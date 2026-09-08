"""Private archive deployer (Python 3.8+, Linux); no third-party dependencies.

Transport: python3 - <base64(UTF-8 JSON)> < deploy_remote.py
Actions: check, prepare, activate, status, rollback, discard, recover. All take absolute siteDir;
prepare/activate require canonical UUID releaseId and lowercase archiveSha256.
check/status/rollback accept those fields but do not need them. rollback toggles
current/previous; retry an uncertain rollback by inspecting status first.

prepare returns incoming, archivePath, manifestPath. Upload only those two files.
Manifest: {schema:1, releaseId, versionId:string, files:[{path,size,sha256}],
totalBytes}. Tar is gzip, regular files ONLY, POSIX relative paths, no explicit
directory entries. index.html and version.json (JSON object with id=versionId)
as well as community/articles.json and .htaccess are required. Empty directories
are not archived. discard requires releaseId, optionally archiveSha256, and only
removes that owned incoming directory; it refuses a related pending journal.
The release marker filename
is reserved at every depth. All paths must be free of symlink ancestors.

The root is siteDir+'.deploy', bound to the effective UID and site path. It and
its work directories are private. The existing site must be a real directory,
on the same filesystem. check detects the libc symbol, NOT filesystem support
for RENAME_EXCHANGE; only an actual exchange proves filesystem support.

State/journal and archives are fsynced before exchange. Interrupted operations
are resolved using both directory markers on the next activate/rollback/recover.
recover only reconciles metadata/cleans staging and NEVER exchanges directories.
status does not recover. An exception after exchange can mean the new site is live:
inspect status/retry activate with the same ID. After recovery rollback applies
one NEW toggle. Cleanup failures after commit are warnings, never failed deploys.

Trust boundary: one trusted deployment UID, trusted site parent; flock serializes
this helper, not unrelated writers. Do not modify the live site or uploads while
an operation is running. Tar headers are never used to create filesystem links.
Bootstrap permits a legacy site without version/index and restores its files,
with standard 755/644 modes plus the internal release marker. Linux directory
fsync, RENAME_EXCHANGE and RENAME_NOREPLACE are required. Initialization publishes
complete owner-marked directories with NOREPLACE. A killed initializer can leave
its random .tonks-init-* directory; retries ignore these, never sweep them.
PAX headers are capped at 16 KiB (at most four nested headers); GNU extensions
are rejected. The gzip output budget is totalBytes + (fileCount+1)*20 KiB +
10 KiB padding. Archive SHA256 is integrity, not a signature.
"""

import base64
import contextlib
import ctypes
import errno
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tarfile
import time
import uuid


MARKER = '.tonks-deploy-release.json'
OWNER = 'owner.json'
SHA = re.compile(r'[0-9a-f]{64}\Z')
MAX_JSON = 32 * 1024 * 1024
REQUIRED_FILES = {'index.html', 'version.json', 'community/articles.json', '.htaccess'}
MAX_PAX_BYTES = 16 * 1024
METADATA_BYTES_PER_FILE = 20 * 1024
TAR_PADDING_BYTES = 10240


class DeployError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise DeployError(message)


def walk_error(error):
    """os.walk otherwise silently omits unreadable subtrees from the backup."""
    raise error


class BudgetReader:
    """Bound total gzip output, including metadata, skipped bytes and padding."""
    def __init__(self, source, budget):
        self.source = source
        self.remaining = budget

    def read(self, size):
        require(type(size) is int and size >= 0, 'unbounded archive read refused')
        data = self.source.read(min(size, self.remaining + 1, 1024 * 1024))
        require(len(data) <= self.remaining, 'archive decompression budget exceeded')
        self.remaining -= len(data)
        return data


class BoundedTarInfo(tarfile.TarInfo):
    """Check extension headers BEFORE stdlib reads/allocates their payloads."""
    def _proc_member(self, archive):
        # Global PAX dictionaries persist between files; bound those as well.
        require(sum(len(k) + len(v) for k, v in archive.pax_headers.items()) <= MAX_PAX_BYTES,
                'global PAX metadata too large')
        if self.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE):
            require(0 <= self.size <= MAX_PAX_BYTES, 'PAX header size exceeds limit')
            depth = getattr(archive, '_deploy_pax_depth', 0)
            require(depth < 4, 'too many nested PAX headers')
            archive._deploy_pax_depth = depth + 1
            try:
                return super()._proc_member(archive)
            finally:
                archive._deploy_pax_depth = depth
        require(self.type in (tarfile.REGTYPE, tarfile.AREGTYPE),
                'archive contains non-regular file or GNU extension')
        require(self.size >= 0, 'negative archive member size')
        return super()._proc_member(archive)

    def _proc_gnusparse_00(self, *args):
        raise DeployError('GNU sparse PAX extension refused')

    _proc_gnusparse_01 = _proc_gnusparse_00
    _proc_gnusparse_10 = _proc_gnusparse_00


def uuid_text(value):
    require(isinstance(value, str), 'releaseId must be a canonical UUID')
    try:
        require(str(uuid.UUID(value)) == value, 'releaseId must be a canonical UUID')
    except ValueError as exc:
        raise DeployError('releaseId must be a canonical UUID') from exc
    return value


def sha_text(value):
    require(isinstance(value, str) and SHA.fullmatch(value), 'invalid SHA256')
    return value


def uid():
    return os.geteuid() if hasattr(os, 'geteuid') else None


def present(path):
    return os.path.lexists(path)


def regular(path):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1,
            'expected unlinked regular file: ' + str(path))
    return st


def directory(path, private=False):
    st = path.lstat()
    require(stat.S_ISDIR(st.st_mode), 'expected real directory: ' + str(path))
    if private and uid() is not None:
        require(st.st_uid == uid() and stat.S_IMODE(st.st_mode) == 0o700,
                'private directory must be owned by deployment UID, mode 0700: ' + str(path))
    return st


def no_symlink_ancestors(path):
    for part in reversed((path,) + tuple(path.parents)):
        if present(part):
            require(not part.is_symlink(), 'symlink path component: ' + str(part))


def read_json(path):
    require(regular(path).st_size <= MAX_JSON, 'JSON too large')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key: ' + key)
            result[key] = value
        return result
    with path.open('r', encoding='utf-8') as stream:
        return json.load(stream, object_pairs_hook=pairs)


def sync_dir(path):
    fd = os.open(str(path), os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_json(path, value):
    """Atomic, durable metadata update; stale temp files are harmless."""
    temp = path.with_name('.' + path.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        fd = os.open(str(temp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=True, separators=(',', ':'))
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        sync_dir(path.parent)
    finally:
        if present(temp):
            temp.unlink()


def digest(path):
    regular(path)
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def libc_exchange():
    require(sys.platform.startswith('linux'), 'Linux is required')
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        fn = libc.renameat2
    except AttributeError as exc:
        raise DeployError('libc renameat2 is unavailable') from exc
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    fn.restype = ctypes.c_int
    return fn


def exchange(left, right):
    fn = libc_exchange()
    if fn(-100, os.fsencode(left), -100, os.fsencode(right), 2) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def rename_noreplace(source, target):
    fn = libc_exchange()
    if fn(-100, os.fsencode(source), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def init_directory(path, owner):
    """Publish a complete directory, never overwrite even an empty unknown one.

    The caller MUST validate the final directory, including after losing a race.
    Only this invocation's unpublished temporary inode may be cleaned here.
    """
    if present(path):
        return
    temp = path.parent / ('.tonks-init-' + str(uuid.uuid4()))
    temp.mkdir(mode=0o700)
    created = temp.lstat()
    try:
        write_json(temp / OWNER, owner)  # fsyncs owner AND the temporary directory
        try:
            rename_noreplace(temp, path)
        except OSError as exc:
            if exc.errno != errno.EEXIST:
                raise
        sync_dir(path.parent)
    finally:
        if present(temp):
            found = directory(temp, private=True)
            require((found.st_dev, found.st_ino) == (created.st_dev, created.st_ino),
                    'initialization temp directory changed; refusing cleanup')
            shutil.rmtree(temp)
            sync_dir(path.parent)


@contextlib.contextmanager
def file_lock(path):
    import fcntl
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        st = os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_uid == uid(),
                'invalid lock file')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno in (errno.EACCES, errno.EAGAIN):
                raise DeployError('deployment is busy (flock)') from exc
            raise
        yield
    finally:
        os.close(fd)


def safe_path(value):
    require(isinstance(value, str) and value and len(value) <= 4096, 'invalid file path')
    require('\\' not in value and ':' not in value and
            not any(ord(c) < 32 or ord(c) == 127 for c in value), 'unsafe file path: ' + value)
    parts = value.split('/')
    require(all(p and p not in ('.', '..', MARKER) for p in parts), 'unsafe/reserved path: ' + value)
    return value


def manifest_data(data, release_id, bootstrap=False):
    require(isinstance(data, dict) and type(data.get('schema')) is int and data['schema'] == 1,
            'unsupported manifest schema')
    require(data.get('releaseId') == release_id, 'manifest releaseId mismatch')
    version = data.get('versionId')
    require(isinstance(version, str) or (bootstrap and version is None), 'invalid versionId')
    files = data.get('files')
    require(isinstance(files, list) and len(files) <= 200000, 'invalid manifest files')
    mapped = {}
    total = 0
    for item in files:
        require(isinstance(item, dict), 'invalid manifest file')
        path = safe_path(item.get('path'))
        require(path not in mapped, 'duplicate manifest path: ' + path)
        size = item.get('size')
        require(type(size) is int and size >= 0, 'invalid file size')
        sha_text(item.get('sha256'))
        mapped[path] = item
        total += size
    for path in mapped:
        parts = path.split('/')
        require(all('/'.join(parts[:i]) not in mapped for i in range(1, len(parts))),
                'file/directory path collision: ' + path)
    require(type(data.get('totalBytes')) is int and data['totalBytes'] == total,
            'manifest totalBytes mismatch')
    if not bootstrap:
        require(REQUIRED_FILES <= set(mapped), 'required blog files missing: ' +
                ', '.join(sorted(REQUIRED_FILES - set(mapped))))
    return mapped


def release_marker(entry):
    return dict(schema=1, releaseId=entry['releaseId'], versionId=entry['versionId'],
                archiveSha256=entry['archiveSha256'], bootstrap=entry['bootstrap'])


class Deployer:
    def __init__(self, args):
        require(isinstance(args, dict), 'arguments must be an object')
        self.args = args
        self.action = args.get('action')
        require(self.action in ('check', 'prepare', 'activate', 'status', 'rollback', 'discard', 'recover'), 'invalid action')
        raw = args.get('siteDir')
        require(isinstance(raw, str) and os.path.isabs(raw), 'siteDir must be absolute')
        require('..' not in Path(raw).parts, 'siteDir may not contain ..')
        self.site = Path(os.path.normpath(raw))
        require(self.site != self.site.parent, 'siteDir cannot be filesystem root')
        no_symlink_ancestors(self.site)
        self.root = Path(str(self.site) + '.deploy')
        self.archives = self.root / 'archives'
        self.state_path = self.root / 'state.json'
        self.pending_path = self.root / 'pending.json'
        self.owner = dict(schema=1, kind='tonks-blog-deploy', siteDir=str(self.site), ownerUid=uid())
        self.timings = {}
        self.warnings = []
        self.recovered = None
        if 'releaseId' in args:
            uuid_text(args['releaseId'])
        if 'archiveSha256' in args:
            sha_text(args['archiveSha256'])
        if self.action in ('prepare', 'activate'):
            uuid_text(args.get('releaseId'))
            sha_text(args.get('archiveSha256'))
        if self.action == 'discard':
            uuid_text(args.get('releaseId'))

    @contextlib.contextmanager
    def timed(self, name):
        start = time.monotonic()
        try:
            yield
        finally:
            self.timings[name] = round((time.monotonic() - start) * 1000, 3)

    def validate_root(self):
        directory(self.root, private=True)
        require(read_json(self.root / OWNER) == self.owner, 'unmanaged or foreign deploy root')
        if present(self.archives):
            directory(self.archives, private=True)
            require(read_json(self.archives / OWNER) == dict(self.owner, kind='archive-store'),
                    'unmanaged archive store')

    def preflight(self):
        import fcntl  # noqa: F401 - intentionally verifies the required module
        libc_exchange()
        site_stat = directory(self.site)
        parent_stat = directory(self.site.parent)
        if present(self.root):
            self.validate_root()
            device = self.root.stat().st_dev
            require(os.access(self.root, os.R_OK | os.W_OK | os.X_OK), 'deploy root permissions')
        else:
            device = parent_stat.st_dev
        require(site_stat.st_dev == device == parent_stat.st_dev, 'site and staging must be on same device')
        require(os.access(self.site, os.R_OK | os.X_OK) and
                os.access(self.site.parent, os.W_OK | os.X_OK), 'site/parent permissions')
        # renameat2 also enforces mountpoint, ACL, immutable and filesystem restrictions.
        if parent_stat.st_mode & stat.S_ISVTX and uid() not in (0, parent_stat.st_uid, site_stat.st_uid):
            raise DeployError('sticky parent prevents site rename')
        disk = shutil.disk_usage(self.site.parent)
        return dict(python=sys.version.split()[0], renameExchangeSymbol=True,
                    filesystemExchangeVerified=False, sameDevice=True,
                    freeBytes=disk.free, totalBytes=disk.total, rootExists=present(self.root))

    def create_root(self):
        init_directory(self.root, self.owner)
        self.validate_root()

    def ensure_archives(self):
        init_directory(self.archives, dict(self.owner, kind='archive-store'))
        self.validate_root()

    def incoming(self, release_id):
        return self.root / ('incoming-' + uuid_text(release_id))

    def work_owner(self, release_id, sha):
        return dict(self.owner, kind='incoming', releaseId=release_id, archiveSha256=sha)

    def validate_incoming(self, release_id, sha=None):
        path = self.incoming(release_id)
        directory(path, private=True)
        owner = read_json(path / OWNER)
        require(isinstance(owner, dict), 'invalid incoming owner')
        actual_sha = sha_text(owner.get('archiveSha256'))
        require(owner == self.work_owner(release_id, actual_sha), 'unmanaged incoming directory')
        require(sha is None or sha == actual_sha, 'incoming archiveSha256 mismatch')
        require(path.stat().st_dev == self.site.stat().st_dev, 'incoming is on another filesystem')
        return path

    def new_incoming(self, release_id, sha):
        path = self.incoming(release_id)
        init_directory(path, self.work_owner(release_id, sha))
        return self.validate_incoming(release_id, sha)

    def paths(self, entry):
        release_id = uuid_text(entry['releaseId'])
        return (self.archives / (release_id + '.tar.gz'),
                self.archives / (release_id + '.manifest.json'))

    def validate_entry(self, entry):
        require(isinstance(entry, dict) and set(entry) ==
                {'releaseId', 'versionId', 'archiveSha256', 'manifestSha256', 'bootstrap'}, 'invalid state entry')
        uuid_text(entry['releaseId'])
        sha_text(entry['archiveSha256'])
        sha_text(entry['manifestSha256'])
        require(type(entry['bootstrap']) is bool, 'invalid bootstrap flag')
        require(isinstance(entry['versionId'], str) or (entry['bootstrap'] and entry['versionId'] is None),
                'invalid state version')

    def validate_state(self, value):
        require(isinstance(value, dict) and set(value) == {'schema', 'siteDir', 'current', 'previous'} and
                type(value['schema']) is int and value['schema'] == 1 and value['siteDir'] == str(self.site),
                'invalid state')
        self.validate_entry(value['current'])
        self.validate_entry(value['previous'])
        require(value['current']['releaseId'] != value['previous']['releaseId'], 'state releases must differ')
        return value

    def state(self):
        return self.validate_state(read_json(self.state_path)) if present(self.state_path) else None

    def marker(self, site):
        directory(site)
        return read_json(site / MARKER) if present(site / MARKER) else None

    def assert_live(self, state):
        expected = release_marker(state['current']) if state else None
        require(self.marker(self.site) == expected, 'unknown live release; refusing to change site')

    def recover(self):
        if not present(self.pending_path):
            return
        journal = read_json(self.pending_path)
        require(isinstance(journal, dict) and journal.get('schema') == 1 and
                journal.get('siteDir') == str(self.site) and journal.get('op') in ('activate', 'rollback'),
                'invalid pending journal')
        before = journal.get('before')
        if before is not None:
            self.validate_state(before)
        after = self.validate_state(journal.get('after'))
        require((before is not None or journal['op'] == 'activate') and
                (after['previous'] == before['current'] if before else after['previous']['bootstrap']),
                'invalid journal transition')
        if journal['op'] == 'rollback':
            require(after['current'] == before['previous'], 'invalid rollback journal')
        before_marker = release_marker(before['current']) if before else None
        after_marker = release_marker(after['current'])
        stage = self.validate_incoming(journal.get('stageId'), after['current']['archiveSha256']) / 'site'
        stored = self.state()
        require(stored == before or stored == after, 'journal/state conflict')
        live = self.marker(self.site)
        staged = self.marker(stage)
        if live == after_marker and staged == before_marker:
            for entry in (after['current'], after['previous']):
                self.verify_archive_metadata(entry)
            # The interrupted process may have died before persisting the exchange.
            sync_dir(self.site.parent)
            sync_dir(stage.parent)
            write_json(self.state_path, after)
            self.recovered = 'committed'
        elif live == before_marker and staged == after_marker and stored == before:
            self.recovered = 'not-exchanged'
        else:
            raise DeployError('unknown exchange state; pending journal retained')
        try:
            self.finish_journal()
        except Exception as exc:
            if self.recovered != 'committed':
                raise
            self.warnings.append('journal finalization: ' + str(exc))
        self.cleanup(self.state(), only_stage=journal['stageId'])
        self.cleanup(self.state())

    def status(self):
        state = self.state() if present(self.root) else None
        result = dict(state=state, live=self.marker(self.site),
                      pending=read_json(self.pending_path) if present(self.pending_path) else None)
        result['consistent'] = result['pending'] is None and result['live'] == (
            release_marker(state['current']) if state else None)
        return result

    def verify_archive_metadata(self, entry):
        archive, manifest = self.paths(entry)
        regular(archive)
        require(digest(manifest) == entry['manifestSha256'], 'saved manifest SHA256 mismatch')
        data = read_json(manifest)
        manifest_data(data, entry['releaseId'], entry['bootstrap'])
        require(data['versionId'] == entry['versionId'], 'saved versionId mismatch')
        return archive, data

    def extract(self, archive, data, entry, target):
        with self.timed('verifyExtractMs'):
            mapped = manifest_data(data, entry['releaseId'], entry['bootstrap'])
            require(digest(archive) == entry['archiveSha256'], 'archive SHA256 mismatch')
            require(shutil.disk_usage(self.root).free >= data['totalBytes'] + 1024 * 1024,
                    'insufficient free space for extraction')
            require(not present(target), 'staging site already exists')
            target.mkdir(mode=0o755)
            os.chmod(target, 0o755)
            seen = set()
            budget = data['totalBytes'] + (len(mapped) + 1) * METADATA_BYTES_PER_FILE + TAR_PADDING_BYTES
            with gzip.open(archive, 'rb') as zipped:
                uncompressed = BudgetReader(zipped, budget)
                with tarfile.open(fileobj=uncompressed, mode='r|', bufsize=512, tarinfo=BoundedTarInfo) as tar:
                    for member in tar:
                        name = safe_path(member.name)
                        require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and not member.issparse() and
                                not any(k.startswith('GNU.sparse') for k in member.pax_headers),
                                'archive contains non-regular file: ' + name)
                        require(name in mapped and name not in seen, 'extra/duplicate archive path: ' + name)
                        expected = mapped[name]
                        require(member.size == expected['size'], 'archive size mismatch: ' + name)
                        seen.add(name)
                        output = target.joinpath(*name.split('/'))
                        output.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                        hasher = hashlib.sha256()
                        source = tar.extractfile(member)
                        require(source is not None, 'missing file data')
                        with source, output.open('xb') as destination:
                            remaining = member.size
                            while remaining:
                                chunk = source.read(min(1024 * 1024, remaining))
                                require(chunk, 'truncated archive file')
                                remaining -= len(chunk)
                                hasher.update(chunk)
                                destination.write(chunk)
                            destination.flush()
                            os.chmod(output, 0o644)
                            os.fsync(destination.fileno())
                        require(hasher.hexdigest() == expected['sha256'], 'file SHA256 mismatch: ' + name)
                        tar.members.clear()  # Streaming needs no retained per-file PAX dictionaries.
                # Read to gzip EOF for CRC/truncation checks; reject hidden trailing tar data.
                trailing = 0
                for chunk in iter(lambda: uncompressed.read(65536), b''):
                    trailing += len(chunk)
                    require(trailing <= TAR_PADDING_BYTES and not any(chunk), 'non-padding/excess trailing archive data')
            require(seen == set(mapped), 'archive is missing manifest files')
            if not entry['bootstrap']:
                version = read_json(target / 'version.json')
                require(isinstance(version, dict) and version.get('id') == data['versionId'],
                        'version.json id mismatch')
            write_json(target / MARKER, release_marker(entry))
            os.chmod(target / MARKER, 0o644)
            with (target / MARKER).open('rb') as stream:
                os.fsync(stream.fileno())
            for parent, dirs, _ in os.walk(target, topdown=False, followlinks=False, onerror=walk_error):
                os.chmod(parent, 0o755)
                sync_dir(Path(parent))
            sync_dir(target.parent)

    def save_uploaded(self, incoming, entry, manifest):
        archive_path, manifest_path = self.paths(entry)
        require(not present(archive_path) and not present(manifest_path), 'releaseId already archived')
        os.replace(incoming / 'package.tar.gz', archive_path)
        os.chmod(archive_path, 0o600)
        with archive_path.open('rb') as stream:
            os.fsync(stream.fileno())
        write_json(manifest_path, manifest)
        entry['manifestSha256'] = digest(manifest_path)
        sync_dir(incoming)
        sync_dir(self.archives)

    def bootstrap(self):
        with self.timed('bootstrapMs'):
            entry = dict(releaseId=str(uuid.uuid4()), versionId=None, bootstrap=True,
                         archiveSha256='0' * 64, manifestSha256='0' * 64)
            archive_path, manifest_path = self.paths(entry)
            files = []
            # Do not follow symlinks, including directory links. Hardlinks are rejected too.
            with archive_path.open('xb') as raw:
                os.chmod(archive_path, 0o600)
                with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, compresslevel=1) as zipped:
                    with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.PAX_FORMAT) as tar:
                        for parent, dirs, names in os.walk(self.site, followlinks=False, onerror=walk_error):
                            dirs.sort()
                            names.sort()
                            for name in dirs:
                                path = Path(parent) / name
                                safe_path(path.relative_to(self.site).as_posix())
                                directory(path)
                            for name in names:
                                path = Path(parent) / name
                                relative = safe_path(path.relative_to(self.site).as_posix())
                                size = regular(path).st_size
                                info = tarfile.TarInfo(relative)
                                info.size = size
                                info.mode = 0o644
                                with path.open('rb') as source:
                                    tar.addfile(info, source)
                                files.append(dict(path=relative, size=size, sha256=digest(path)))
                raw.flush()
                os.fsync(raw.fileno())
            if present(self.site / 'version.json'):
                try:
                    value = read_json(self.site / 'version.json')
                    if isinstance(value, dict) and isinstance(value.get('id'), str):
                        entry['versionId'] = value['id']
                except (ValueError, UnicodeError):
                    pass  # Legacy version.json is restored as opaque content.
            manifest = dict(schema=1, releaseId=entry['releaseId'], versionId=entry['versionId'],
                            files=files, totalBytes=sum(f['size'] for f in files))
            write_json(manifest_path, manifest)
            entry['archiveSha256'] = digest(archive_path)
            entry['manifestSha256'] = digest(manifest_path)
            # Verify that archived bytes match the snapshot manifest before risking the live site.
            work_id = str(uuid.uuid4())
            work = self.new_incoming(work_id, entry['archiveSha256'])
            self.extract(archive_path, manifest, entry, work / 'site')
            self.remove_incoming(work_id)
            return entry

    def finish_journal(self):
        self.pending_path.unlink()
        sync_dir(self.root)

    def remove_incoming(self, release_id):
        path = self.validate_incoming(release_id)
        # rmtree never follows directory symlinks; Linux uses its fd-safe implementation.
        shutil.rmtree(path)
        sync_dir(self.root)

    def cleanup(self, state, only_stage=None):
        """Only exact managed children; errors cannot turn a committed deploy into failure."""
        try:
            self.validate_root()
            require(not present(self.pending_path), 'cleanup deferred: pending journal exists')
            if only_stage is not None:
                if present(self.incoming(only_stage)):
                    self.remove_incoming(only_stage)
                return
            # Other prepared uploads may belong to the JS uploader: preserve them.
            keep = set()
            if state:
                for entry in (state['current'], state['previous']):
                    keep.update(p.name for p in self.paths(entry))
            if present(self.archives):
                for path in self.archives.iterdir():
                    match = re.fullmatch(r'([0-9a-f-]{36})(\.tar\.gz|\.manifest\.json)', path.name)
                    if match and path.name not in keep:
                        uuid_text(match.group(1))
                        regular(path)
                        path.unlink()
                sync_dir(self.archives)
        except Exception as exc:
            self.warnings.append('cleanup: ' + str(exc))

    def commit(self, op, before, after, stage_id):
        stage = self.validate_incoming(stage_id, after['current']['archiveSha256']) / 'site'
        self.assert_live(before)
        require(self.marker(stage) == release_marker(after['current']), 'staging marker mismatch')
        journal = dict(schema=1, siteDir=str(self.site), op=op, before=before, after=after, stageId=stage_id)
        write_json(self.pending_path, journal)
        with self.timed('exchangeMs'):
            exchange(self.site, stage)
            sync_dir(self.site.parent)
            sync_dir(stage.parent)
        with self.timed('stateCommitMs'):
            write_json(self.state_path, after)
        # State is durable: all subsequent errors are warnings.
        try:
            self.finish_journal()
        except Exception as exc:
            self.warnings.append('journal finalization: ' + str(exc))
        self.cleanup(after, only_stage=stage_id)
        self.cleanup(after)
        return dict(current=after['current'], previous=after['previous'], changed=True)

    def activate(self):
        self.recover()
        state = self.state()
        self.assert_live(state)
        release_id = self.args['releaseId']
        sha = self.args['archiveSha256']
        if state and state['current']['releaseId'] == release_id:
            require(state['current']['archiveSha256'] == sha, 'current release SHA mismatch')
            self.cleanup(state)
            return dict(current=state['current'], previous=state['previous'], changed=False)
        require(not state or state['previous']['releaseId'] != release_id, 'use rollback for previous release')
        incoming = self.validate_incoming(release_id, sha)
        require(not present(incoming / 'site'), 'stale extraction: call prepare to reset this release')
        self.ensure_archives()
        # Failed pre-journal attempts can leave unreferenced archives for this ID.
        self.cleanup(state)
        manifest = read_json(incoming / 'manifest.json')
        manifest_data(manifest, release_id)
        entry = dict(releaseId=release_id, versionId=manifest['versionId'], archiveSha256=sha,
                     manifestSha256='0' * 64, bootstrap=False)
        self.extract(incoming / 'package.tar.gz', manifest, entry, incoming / 'site')
        previous = state['current'] if state else self.bootstrap()
        self.save_uploaded(incoming, entry, manifest)
        after = dict(schema=1, siteDir=str(self.site), current=entry, previous=previous)
        return self.commit('activate', state, after, release_id)

    def rollback(self):
        self.recover()
        state = self.state()
        require(state is not None, 'no previous deployment')
        self.assert_live(state)
        archive, manifest = self.verify_archive_metadata(state['previous'])
        stage_id = str(uuid.uuid4())
        incoming = self.new_incoming(stage_id, state['previous']['archiveSha256'])
        self.extract(archive, manifest, state['previous'], incoming / 'site')
        after = dict(state, current=state['previous'], previous=state['current'])
        return self.commit('rollback', state, after, stage_id)

    def discard(self):
        release_id = self.args['releaseId']
        if present(self.pending_path):
            journal = read_json(self.pending_path)
            require(isinstance(journal, dict) and journal.get('schema') == 1 and
                    journal.get('siteDir') == str(self.site), 'invalid pending journal')
            self.validate_state(journal.get('after'))
            require(journal.get('stageId') != release_id and
                    journal['after']['current']['releaseId'] != release_id,
                    'discard refused: incoming is associated with pending journal')
        path = self.incoming(release_id)
        removed = present(path)
        if removed:
            self.validate_incoming(release_id, self.args.get('archiveSha256'))
            self.remove_incoming(release_id)
        return dict(releaseId=release_id, discarded=removed)

    def run(self):
        start = time.monotonic()
        with self.timed('checkMs'):
            checked = self.preflight()
        if self.action == 'check':
            result = checked
        elif self.action == 'status':
            result = self.status()
        else:
            if self.action == 'prepare':
                self.create_root()
            else:
                self.validate_root()
            with file_lock(self.root / 'lock'):
                if self.action == 'prepare':
                    require(not present(self.pending_path), 'pending deployment: run recover first')
                    state = self.state()
                    self.assert_live(state)
                    release_id = self.args['releaseId']
                    require(not state or release_id not in
                            (state['current']['releaseId'], state['previous']['releaseId']), 'releaseId already active/previous')
                    incoming = self.new_incoming(release_id, self.args['archiveSha256'])
                    # Explicit prepare resets only this exact, owned work directory.
                    if present(incoming / 'site'):
                        self.remove_incoming(release_id)
                        incoming = self.new_incoming(release_id, self.args['archiveSha256'])
                    result = dict(incoming=str(incoming), archivePath=str(incoming / 'package.tar.gz'),
                                  manifestPath=str(incoming / 'manifest.json'))
                elif self.action == 'activate':
                    result = self.activate()
                elif self.action == 'discard':
                    result = self.discard()
                elif self.action == 'recover':
                    self.recover()
                    state = self.state()
                    self.assert_live(state)
                    result = self.status()
                else:
                    result = self.rollback()
        self.timings['totalMs'] = round((time.monotonic() - start) * 1000, 3)
        return dict(success=True, action=self.action, **result, recovered=self.recovered,
                    warnings=self.warnings, timings=self.timings)


def main():
    deployer = None
    try:
        require(len(sys.argv) == 2, 'usage: python3 - <base64json> < deploy_remote.py')
        require(len(sys.argv[1]) <= 65536, 'arguments too large')
        args = json.loads(base64.b64decode(sys.argv[1], validate=True).decode('utf-8'))
        deployer = Deployer(args)
        result = deployer.run()
        print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))
        return 0
    except Exception as exc:
        error = dict(success=False, error=str(exc), errorType=type(exc).__name__,
                     timings=deployer.timings if deployer else {})
        # No recovery/mutation here: the journal remains evidence for the next explicit action.
        if deployer:
            error['action'] = deployer.action
            error['inspectStatus'] = True
        print(json.dumps(error, ensure_ascii=True, separators=(',', ':')), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
