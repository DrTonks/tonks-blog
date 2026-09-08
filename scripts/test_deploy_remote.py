"""Run: python -B -m unittest discover -s .tmp/blog-archive-work -v

Windows runs logic tests using an explicitly NON-ATOMIC exchange mock, plus
mocked flock/fsync/libc. Linux runs the same tests with real renameat2/flock/fsync
AND subprocess/stdin integration tests. All sites are freshly allocated under
tempfile.TemporaryDirectory(prefix='tonks-blog-archive-check-'); no production
paths, SSH, network, or existing site are accessed. To force /tmp on Linux:
TMPDIR=/tmp python3 -B -m unittest discover -s <helper-directory> -v
"""

import base64
import contextlib
from concurrent.futures import ThreadPoolExecutor
import errno
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from unittest import mock
import uuid

import deploy_remote as deploy


LINUX = sys.platform.startswith('linux')
LOCKS = {}


@contextlib.contextmanager
def fake_lock(path):
    lock = LOCKS.setdefault(str(path), threading.Lock())
    if not lock.acquire(blocking=False):
        raise deploy.DeployError('deployment is busy (mock flock)')
    try:
        yield
    finally:
        lock.release()


def fake_exchange(left, right):
    """Test simulation ONLY. Production exchange is NEVER implemented this way."""
    temp = right.parent / 'mock-exchange-temp'
    os.rename(left, temp)
    os.rename(right, left)
    os.rename(temp, right)


def encode(args):
    return base64.b64encode(json.dumps(args).encode()).decode('ascii')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blog_files(version):
    return {'index.html': ('<h1>' + version + '</h1>').encode(),
            'version.json': json.dumps({'id': version}).encode(),
            'community/articles.json': b'[]\n', '.htaccess': b'RewriteEngine On\n',
            'assets/nested/app.123.js': ('console.log(' + json.dumps(version) + ')').encode()}


def package(release_id, version='v1', files=None, members=None):
    files = blog_files(version) if files is None else files
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w:gz', format=tarfile.PAX_FORMAT) as tar:
        if members is None:
            members = []
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                members.append((info, content))
        for info, content in members:
            tar.addfile(info, io.BytesIO(content) if content is not None else None)
    manifest = dict(schema=1, releaseId=release_id, versionId=version,
                    files=[dict(path=k, size=len(v), sha256=sha(v)) for k, v in files.items()],
                    totalBytes=sum(map(len, files.values())))
    return data.getvalue(), manifest


class Fixture(unittest.TestCase):
    def setUp(self):
        self.patches = contextlib.ExitStack()
        self.addCleanup(self.patches.close)
        if not LINUX:
            # Python 3.12 on Windows translates 0700 to a restrictive owner ACL,
            # excluding the sandbox's secondary token. ACLs are not under test here.
            real_mkdir = os.mkdir
            self.patches.enter_context(mock.patch.object(os, 'mkdir',
                lambda path, mode=0o777, **kw: real_mkdir(path, 0o755, **kw)))
        self.temp = tempfile.TemporaryDirectory(prefix='tonks-blog-archive-check-')
        self.addCleanup(self.temp.cleanup)
        self.site = Path(self.temp.name) / 'site'
        self.site.mkdir()
        (self.site / 'index.html').write_bytes(b'legacy page')
        (self.site / 'old.txt').write_bytes(b'original bytes')
        self.root = Path(str(self.site) + '.deploy')
        self.original = self.snapshot()
        if not LINUX:
            self.patches.enter_context(mock.patch.object(deploy, 'sync_dir', lambda path: None))
            self.patches.enter_context(mock.patch.object(os, 'fsync', lambda fd: None))
            self.patches.enter_context(mock.patch.object(deploy, 'libc_exchange', lambda: None))
            self.patches.enter_context(mock.patch.object(deploy, 'file_lock', fake_lock))
            self.patches.enter_context(mock.patch.object(deploy, 'exchange', fake_exchange))
            # Windows os.rename refuses an existing destination, including an empty directory.
            self.patches.enter_context(mock.patch.object(deploy, 'rename_noreplace', os.rename))
            self.patches.enter_context(mock.patch.dict(sys.modules, {'fcntl': mock.Mock()}))

    def snapshot(self):
        return {p.relative_to(self.site).as_posix(): p.read_bytes()
                for p in self.site.rglob('*') if p.is_file()}

    def args(self, action, **kwargs):
        return dict(action=action, siteDir=str(self.site), **kwargs)

    def call(self, action, **kwargs):
        return deploy.Deployer(self.args(action, **kwargs)).run()

    def upload(self, version='v1', archive=None, manifest=None, release_id=None):
        release_id = release_id or str(uuid.uuid4())
        if archive is None:
            archive, manifest = package(release_id, version)
        args = dict(releaseId=release_id, archiveSha256=sha(archive))
        paths = self.call('prepare', **args)
        Path(paths['archivePath']).write_bytes(archive)
        Path(paths['manifestPath']).write_text(json.dumps(manifest), encoding='utf-8')
        return args, paths

    def install(self, version='v1'):
        args, paths = self.upload(version)
        return self.call('activate', **args), args, paths

    def assert_two_archives(self, result):
        expected = {result[key]['releaseId'] for key in ('current', 'previous')}
        archives = self.root / 'archives'
        self.assertEqual({p.name[:-7] for p in archives.glob('*.tar.gz')}, expected)
        self.assertEqual({p.name[:-14] for p in archives.glob('*.manifest.json')}, expected)
        for release in expected:
            manifest = json.loads((archives / (release + '.manifest.json')).read_text())
            self.assertEqual(manifest['releaseId'], release)

    def initializer(self, kind):
        site = self.site.parent / ('init-case-' + str(uuid.uuid4()))
        site.mkdir()
        instance = deploy.Deployer(dict(action='check', siteDir=str(site)))
        if kind == 'root':
            return instance.root, instance.create_root, instance.owner
        instance.create_root()
        if kind == 'archives':
            return instance.archives, instance.ensure_archives, dict(instance.owner, kind='archive-store')
        release_id, digest = str(uuid.uuid4()), 'a' * 64
        return (instance.incoming(release_id), lambda: instance.new_incoming(release_id, digest),
                instance.work_owner(release_id, digest))


class DeployTests(Fixture):
    def test_bootstrap_walk_permission_and_io_errors_abort_before_exchange(self):
        hidden = self.site / 'subtree'
        hidden.mkdir()
        (hidden / 'must-back-up.txt').write_bytes(b'cannot omit me')
        original = self.snapshot()
        real_scandir = os.scandir
        for error in (PermissionError(errno.EACCES, 'unreadable subtree'),
                      OSError(errno.EIO, 'subtree IO error')):
            with self.subTest(error=type(error).__name__):
                args, _ = self.upload()
                def fail_subtree(path):
                    if not isinstance(path, int) and Path(path) == hidden:
                        raise error
                    return real_scandir(path)
                with mock.patch.object(os, 'scandir', side_effect=fail_subtree), \
                        mock.patch.object(deploy, 'exchange') as exchanged:
                    with self.assertRaises(type(error)):
                        self.call('activate', **args)
                    exchanged.assert_not_called()
                self.assertEqual(self.snapshot(), original)
                self.assertFalse((self.root / 'pending.json').exists())
                self.assertFalse((self.root / 'state.json').exists())

    def test_init_owner_write_sync_and_publish_failures_are_retryable(self):
        for kind in ('root', 'archives', 'incoming'):
            for phase in ('owner', 'sync', 'publish'):
                with self.subTest(kind=kind, phase=phase):
                    target, initialize, owner = self.initializer(kind)
                    unrelated = target.parent / ('.tonks-init-unrelated-' + str(uuid.uuid4()))
                    unrelated.mkdir(mode=0o700)
                    (unrelated / 'keep').write_bytes(b'not ours')
                    existing_temps = set(target.parent.glob('.tonks-init-*'))
                    original_sync = deploy.sync_dir
                    def fail_temp_sync(path):
                        if path.name.startswith('.tonks-init-'):
                            raise OSError('injected init sync failure')
                        return original_sync(path)
                    patch = {'owner': mock.patch.object(deploy, 'write_json', side_effect=OSError('owner write failed')),
                             'sync': mock.patch.object(deploy, 'sync_dir', side_effect=fail_temp_sync),
                             'publish': mock.patch.object(deploy, 'rename_noreplace', side_effect=OSError('publish failed'))}[phase]
                    with patch, self.assertRaises(OSError):
                        initialize()
                    self.assertFalse(target.exists())
                    self.assertEqual(set(target.parent.glob('.tonks-init-*')), existing_temps)
                    self.assertEqual((unrelated / 'keep').read_bytes(), b'not ours')
                    initialize()
                    self.assertEqual(deploy.read_json(target / deploy.OWNER), owner)

    def test_init_failure_after_publish_leaves_complete_retryable_directory(self):
        for kind in ('root', 'archives', 'incoming'):
            with self.subTest(kind=kind):
                target, initialize, owner = self.initializer(kind)
                real_sync = deploy.sync_dir
                def fail_parent_sync(path):
                    if path == target.parent:
                        raise OSError('after publish fsync failure')
                    return real_sync(path)
                with mock.patch.object(deploy, 'sync_dir', side_effect=fail_parent_sync):
                    with self.assertRaisesRegex(OSError, 'after publish'):
                        initialize()
                self.assertEqual(deploy.read_json(target / deploy.OWNER), owner)
                initialize()
                self.assertEqual(deploy.read_json(target / deploy.OWNER), owner)

    def test_init_racing_creators_validate_winner(self):
        for kind in ('root', 'archives', 'incoming'):
            with self.subTest(kind=kind):
                target, initialize, owner = self.initializer(kind)
                barrier = threading.Barrier(2, timeout=10)
                real_publish = deploy.rename_noreplace
                def race(source, destination):
                    barrier.wait()
                    return real_publish(source, destination)
                with mock.patch.object(deploy, 'rename_noreplace', side_effect=race):
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        futures = [pool.submit(initialize) for _ in range(2)]
                        for future in futures:
                            future.result(timeout=15)
                self.assertEqual(deploy.read_json(target / deploy.OWNER), owner)
                self.assertFalse(list(target.parent.glob('.tonks-init-*')))

    def test_init_never_replaces_unknown_empty_directory_in_race(self):
        for kind in ('root', 'archives', 'incoming'):
            with self.subTest(kind=kind):
                target, initialize, _ = self.initializer(kind)
                real_publish = deploy.rename_noreplace
                identity = []
                def competing_unknown(source, destination):
                    destination.mkdir(mode=0o700)
                    identity.append(destination.stat().st_ino)
                    return real_publish(source, destination)
                with mock.patch.object(deploy, 'rename_noreplace', side_effect=competing_unknown):
                    with self.assertRaises((deploy.DeployError, FileNotFoundError)):
                        initialize()
                self.assertEqual(target.stat().st_ino, identity[0])
                self.assertEqual(list(target.iterdir()), [])
                self.assertFalse(list(target.parent.glob('.tonks-init-*')))

    def test_oversize_pax_and_gnu_headers_rejected_before_payload_processing(self):
        types = (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE,
                 tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK, tarfile.GNUTYPE_SPARSE)
        for header_type in types:
            with self.subTest(header_type=header_type):
                release_id = str(uuid.uuid4())
                _, manifest = package(release_id)
                info = tarfile.TarInfo('extension')
                info.type, info.size = header_type, 1024 * 1024 * 1024
                # Only a 512-byte header: it advertises a GiB payload that must never be read.
                archive = gzip.compress(info.tobuf(format=tarfile.USTAR_FORMAT))
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with mock.patch.object(tarfile.TarInfo, '_proc_pax', side_effect=AssertionError('unsafe PAX processing')), \
                        mock.patch.object(tarfile.TarInfo, '_proc_gnulong', side_effect=AssertionError('unsafe GNU processing')), \
                        mock.patch.object(tarfile.TarInfo, '_proc_sparse', side_effect=AssertionError('unsafe sparse processing')):
                    with self.assertRaises(deploy.DeployError):
                        self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)
                self.assertFalse((self.root / 'pending.json').exists())

    def test_sparse_pax_rejected_before_sparse_payload_parser(self):
        release_id = str(uuid.uuid4())
        members = []
        for name, content in blog_files('v1').items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            if name == 'index.html':
                info.pax_headers = {'GNU.sparse.major': '1', 'GNU.sparse.minor': '0'}
            members.append((info, content))
        archive, manifest = package(release_id, members=members)
        args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
        with mock.patch.object(tarfile.TarInfo, '_proc_gnusparse_10', side_effect=AssertionError('unsafe parser')):
            with self.assertRaisesRegex(deploy.DeployError, 'GNU sparse'):
                self.call('activate', **args)
        self.assertEqual(self.snapshot(), self.original)

    def test_decompressed_metadata_budget_and_pax_nesting_limit(self):
        payload_value = 'x' * (deploy.MAX_PAX_BYTES - 64)
        record_body = (' comment=' + payload_value + '\n').encode()
        length = len(record_body) + 1
        while length != len(str(length)) + len(record_body):
            length = len(str(length)) + len(record_body)
        payload = str(length).encode() + record_body
        info = tarfile.TarInfo('PaxHeader')
        info.type, info.size = tarfile.XHDTYPE, len(payload)
        pax_block = info.tobuf(format=tarfile.USTAR_FORMAT) + payload + b'\0' * (-len(payload) % 512)
        for count, message in ((3, 'decompression budget'), (5, 'nested PAX')):
            with self.subTest(count=count):
                release_id = str(uuid.uuid4())
                _, manifest = package(release_id)
                raw = bytearray()
                for name, content in blog_files('v1').items():
                    regular = tarfile.TarInfo(name)
                    regular.size = len(content)
                    raw.extend(pax_block * count)
                    raw.extend(regular.tobuf(format=tarfile.USTAR_FORMAT))
                    raw.extend(content + b'\0' * (-len(content) % 512))
                raw.extend(b'\0' * 1024)
                archive = gzip.compress(raw)
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with self.assertRaisesRegex(deploy.DeployError, message):
                    self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)

    def test_python_pax_long_unicode_paths_and_bootstrap_still_roundtrip(self):
        name = 'content/' + ('long-directory-' * 9) + '/\u4e2d\u6587.txt'
        old_file = self.site.joinpath(*name.split('/'))
        old_file.parent.mkdir(parents=True)
        old_file.write_bytes(b'legacy long unicode path')
        original = self.snapshot()
        release_id = str(uuid.uuid4())
        files = dict(blog_files('v1'), **{name: b'new long unicode path'})
        archive, manifest = package(release_id, files=files)
        args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
        result = self.call('activate', **args)
        self.assertTrue(result['success'])
        self.assertEqual(self.site.joinpath(*name.split('/')).read_bytes(), files[name])
        self.call('rollback')
        snapshot = self.snapshot()
        snapshot.pop(deploy.MARKER)
        self.assertEqual(snapshot, original)

    def test_check_is_read_only(self):
        result = self.call('check')
        self.assertTrue(result['sameDevice'])
        self.assertFalse(result['rootExists'])
        self.assertFalse(self.root.exists())
        self.assertEqual(self.snapshot(), self.original)

    def test_prepare_discard_and_modes(self):
        args, paths = self.upload()
        self.assertEqual(paths['incoming'], str(self.root / ('incoming-' + args['releaseId'])))
        if LINUX:
            for path in (self.root, Path(paths['incoming'])):
                self.assertEqual(path.stat().st_mode & 0o777, 0o700)
        result = self.call('discard', **args)
        self.assertTrue(result['discarded'])
        self.assertFalse(Path(paths['incoming']).exists())
        self.assertFalse(self.call('discard', releaseId=args['releaseId'])['discarded'])
        self.assertEqual(self.snapshot(), self.original)

    def test_first_deploy_bootstrap_and_rollback_toggle(self):
        result, args, paths = self.install()
        self.assertTrue(result['previous']['bootstrap'])
        self.assertIsNone(result['previous']['versionId'])
        self.assert_two_archives(result)
        self.assertFalse(Path(paths['incoming']).exists())
        self.assertFalse(self.site.is_symlink())
        self.assertEqual((self.site / 'index.html').read_bytes(), blog_files('v1')['index.html'])
        if LINUX:
            for path in (self.site, *self.site.rglob('*')):
                self.assertEqual(path.stat().st_mode & 0o777, 0o755 if path.is_dir() else 0o644)
        back = self.call('rollback')
        files = self.snapshot()
        files.pop(deploy.MARKER)
        self.assertEqual(files, self.original)
        self.assertEqual(back['previous'], result['current'])
        self.assert_two_archives(back)
        forward = self.call('rollback')
        self.assertEqual(forward['current'], result['current'])
        self.assert_two_archives(forward)
        self.assertTrue(self.call('status')['consistent'])
        self.assertFalse(self.call('activate', **args)['changed'])

    def test_second_third_deploy_retain_exactly_two_archives(self):
        first, _, _ = self.install('v1')
        second, _, _ = self.install('v2')
        self.assertEqual(second['previous'], first['current'])
        self.assert_two_archives(second)
        third, _, _ = self.install('v3')
        self.assertEqual(third['previous'], second['current'])
        self.assert_two_archives(third)
        self.assertFalse(list(self.root.glob('incoming-*')))
        rolled = self.call('rollback')
        self.assertEqual(rolled['current'], second['current'])
        self.assert_two_archives(rolled)

    def test_archive_checksum_failure_preserves_old_site(self):
        args, paths = self.upload()
        Path(paths['archivePath']).write_bytes(b'corrupt gzip')
        with self.assertRaisesRegex(deploy.DeployError, 'archive SHA256'):
            self.call('activate', **args)
        self.assertEqual(self.snapshot(), self.original)
        self.assertFalse((self.root / 'pending.json').exists())

    def test_bad_file_hash_size_total_and_version_preserve_site(self):
        for failure in ('hash', 'size', 'total', 'version'):
            with self.subTest(failure=failure):
                release_id = str(uuid.uuid4())
                archive, manifest = package(release_id)
                if failure == 'hash':
                    manifest['files'][0]['sha256'] = '0' * 64
                elif failure == 'size':
                    manifest['files'][0]['size'] += 1
                    manifest['totalBytes'] += 1
                elif failure == 'total':
                    manifest['totalBytes'] += 1
                else:
                    manifest['versionId'] = 'wrong-version'
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with self.assertRaises(deploy.DeployError):
                    self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)

    def test_missing_each_required_blog_file(self):
        for missing in deploy.REQUIRED_FILES:
            with self.subTest(missing=missing):
                release_id = str(uuid.uuid4())
                files = blog_files('v1')
                del files[missing]
                archive, manifest = package(release_id, files=files)
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with self.assertRaisesRegex(deploy.DeployError, 'required blog files'):
                    self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)

    def test_traversal_reserved_and_absolute_manifest_paths(self):
        for name in ('../escape', '/tmp/escape', 'a/../../escape', 'a\\escape',
                     'C:/escape', 'a//x', './index.html', deploy.MARKER, 'a/' + deploy.MARKER):
            with self.subTest(name=name):
                release_id = str(uuid.uuid4())
                files = dict(blog_files('v1'), **{name: b'unsafe'})
                archive, manifest = package(release_id, files=files)
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with self.assertRaises(deploy.DeployError):
                    self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)
        self.assertFalse((self.site.parent / 'escape').exists())

    def test_links_special_directories_extra_duplicate_and_missing_tar_members(self):
        for kind in ('symlink', 'hardlink', 'fifo', 'device', 'directory', 'extra', 'duplicate', 'missing', 'traversal'):
            with self.subTest(kind=kind):
                release_id = str(uuid.uuid4())
                files = blog_files('v1')
                members = []
                for name, content in files.items():
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    members.append((info, content))
                if kind == 'missing':
                    members.pop()
                elif kind in ('symlink', 'hardlink', 'fifo', 'device', 'directory'):
                    info = tarfile.TarInfo('index.html')
                    info.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE,
                                 'fifo': tarfile.FIFOTYPE, 'device': tarfile.CHRTYPE,
                                 'directory': tarfile.DIRTYPE}[kind]
                    info.linkname = '../../outside'
                    members[0] = (info, None)
                elif kind == 'duplicate':
                    members.append(members[0])
                else:
                    info = tarfile.TarInfo('../escape' if kind == 'traversal' else 'extra.txt')
                    info.size = 1
                    members.append((info, b'x'))
                archive, manifest = package(release_id, files=files, members=members)
                args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
                with self.assertRaises(deploy.DeployError):
                    self.call('activate', **args)
                self.assertEqual(self.snapshot(), self.original)

    def test_duplicate_manifest_and_prefix_collision(self):
        for collision in (False, True):
            release_id = str(uuid.uuid4())
            archive, manifest = package(release_id)
            item = dict(manifest['files'][0])
            if collision:
                item['path'] = 'index.html/nested'
            manifest['files'].append(item)
            manifest['totalBytes'] += item['size']
            args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
            with self.assertRaises(deploy.DeployError):
                self.call('activate', **args)
        self.assertEqual(self.snapshot(), self.original)

    def test_truncated_gzip_and_trailing_payload(self):
        for failure in ('truncated', 'trailing'):
            release_id = str(uuid.uuid4())
            archive, manifest = package(release_id)
            if failure == 'truncated':
                archive = archive[:-8]
            else:
                import gzip
                archive += gzip.compress(b'hidden tar payload')
            args, _ = self.upload(archive=archive, manifest=manifest, release_id=release_id)
            with self.assertRaises((deploy.DeployError, EOFError, OSError)):
                self.call('activate', **args)
            self.assertEqual(self.snapshot(), self.original)

    def test_unmanaged_root_and_foreign_owner_refused(self):
        self.root.mkdir(mode=0o700)
        sentinel = self.root / 'never-delete'
        sentinel.write_bytes(b'foreign')
        with self.assertRaises((deploy.DeployError, FileNotFoundError)):
            self.call('prepare', releaseId=str(uuid.uuid4()), archiveSha256='0' * 64)
        (self.root / deploy.OWNER).write_text(json.dumps({'siteDir': '/unrelated'}))
        with self.assertRaises(deploy.DeployError):
            self.call('check')
        self.assertEqual(sentinel.read_bytes(), b'foreign')
        self.assertEqual(self.snapshot(), self.original)

    def test_discard_refuses_unmanaged_work_and_preserves_archives(self):
        result, _, _ = self.install()
        args, paths = self.upload('unused')
        archive_before = {p.name: p.read_bytes() for p in (self.root / 'archives').iterdir()}
        live_before = self.snapshot()
        owner = Path(paths['incoming']) / deploy.OWNER
        owner.unlink()
        with self.assertRaises(FileNotFoundError):
            self.call('discard', **args)
        self.assertTrue(Path(paths['incoming']).exists())
        self.assertEqual(self.snapshot(), live_before)
        self.assertEqual(archive_before, {p.name: p.read_bytes() for p in (self.root / 'archives').iterdir()})
        self.assert_two_archives(result)

    def test_lock_refuses_concurrent_mutation(self):
        args, _ = self.upload()
        with deploy.file_lock(self.root / 'lock'):
            for action in ('activate', 'rollback', 'prepare', 'discard', 'recover'):
                with self.subTest(action=action), self.assertRaisesRegex(deploy.DeployError, 'busy'):
                    self.call(action, **args)
            self.assertIsNone(self.call('status')['pending'])
        self.assertEqual(self.snapshot(), self.original)

    def test_exchange_failure_preserves_site_and_pending_blocks_discard(self):
        args, paths = self.upload()
        with mock.patch.object(deploy, 'exchange', side_effect=OSError('exchange unavailable')):
            with self.assertRaisesRegex(OSError, 'exchange unavailable'):
                self.call('activate', **args)
        self.assertEqual(self.snapshot(), self.original)
        status = self.call('status')
        self.assertIsNotNone(status['pending'])
        self.assertFalse(status['consistent'])
        with self.assertRaisesRegex(deploy.DeployError, 'pending'):
            self.call('discard', **args)
        self.assertTrue(Path(paths['incoming']).exists())
        # An explicit action resolves a not-exchanged transaction without altering live.
        with self.assertRaisesRegex(deploy.DeployError, 'no previous'):
            self.call('rollback')
        self.assertIsNone(self.call('status')['pending'])
        self.assertEqual(self.snapshot(), self.original)
        # Upload again after the aborted transaction, using the same release ID.
        archive, manifest = package(args['releaseId'])
        args, _ = self.upload(archive=archive, manifest=manifest, release_id=args['releaseId'])
        self.assertTrue(self.call('activate', **args)['success'])

    def test_failure_immediately_after_exchange_recovers_on_activate_retry(self):
        args, _ = self.upload()
        actual = deploy.exchange
        def crash(left, right):
            actual(left, right)
            raise OSError('simulated lost connection after exchange')
        with mock.patch.object(deploy, 'exchange', side_effect=crash):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        status = self.call('status')
        self.assertEqual(status['live']['releaseId'], args['releaseId'])
        self.assertIsNone(status['state'])
        self.assertIsNotNone(status['pending'])
        result = self.call('activate', **args)
        self.assertEqual(result['recovered'], 'committed')
        self.assertFalse(result['changed'])
        self.assert_two_archives(result)
        self.assertTrue(self.call('status')['consistent'])

    def test_recover_before_exchange_cleans_staging_preserves_old(self):
        args, paths = self.upload()
        with mock.patch.object(deploy, 'exchange', side_effect=OSError('exchange unavailable')):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        with mock.patch.object(deploy, 'exchange') as exchanged:
            result = self.call('recover')
            exchanged.assert_not_called()
        self.assertEqual(result['recovered'], 'not-exchanged')
        self.assertIsNone(result['state'])
        self.assertTrue(result['consistent'])
        self.assertEqual(self.snapshot(), self.original)
        self.assertFalse(Path(paths['incoming']).exists())
        self.assertFalse(list((self.root / 'archives').glob('*.tar.gz')))

    def test_readonly_pending_and_recover_after_exchange_does_not_rollback(self):
        args, _ = self.upload()
        actual = deploy.exchange
        def crash(left, right):
            actual(left, right)
            raise OSError('after exchange')
        with mock.patch.object(deploy, 'exchange', side_effect=crash):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        before = {p.relative_to(self.root).as_posix(): (p.read_bytes(), p.stat().st_mtime_ns)
                  for p in self.root.rglob('*') if p.is_file()}
        live_before = self.snapshot()
        self.call('check')
        self.call('status')
        after = {p.relative_to(self.root).as_posix(): (p.read_bytes(), p.stat().st_mtime_ns)
                 for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(live_before, self.snapshot())
        with mock.patch.object(deploy, 'exchange') as exchanged:
            result = self.call('recover')
            exchanged.assert_not_called()
        self.assertEqual(result['recovered'], 'committed')
        self.assertEqual(result['state']['current']['releaseId'], args['releaseId'])
        self.assertEqual(self.snapshot(), live_before)
        self.assertTrue(result['consistent'])
        self.assertIsNone(self.call('recover')['recovered'])

    def test_state_write_failure_recovers(self):
        args, _ = self.upload()
        actual = deploy.write_json
        def fail_state(path, value):
            if path.name == 'state.json':
                raise OSError('state write failure')
            return actual(path, value)
        with mock.patch.object(deploy, 'write_json', side_effect=fail_state):
            with self.assertRaisesRegex(OSError, 'state write'):
                self.call('activate', **args)
        self.assertIsNotNone(self.call('status')['pending'])
        self.assertEqual(self.call('activate', **args)['recovered'], 'committed')

    def test_recovery_syncs_exchange_before_state_commit(self):
        args, _ = self.upload()
        actual_exchange = deploy.exchange
        def crash(left, right):
            actual_exchange(left, right)
            raise OSError('lost after exchange')
        with mock.patch.object(deploy, 'exchange', side_effect=crash):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        original_sync = deploy.sync_dir
        def fail_parent(path):
            if path == self.site.parent:
                raise OSError('parent fsync failed')
            return original_sync(path)
        with mock.patch.object(deploy, 'sync_dir', side_effect=fail_parent):
            with self.assertRaisesRegex(OSError, 'parent fsync failed'):
                self.call('recover')
        self.assertFalse((self.root / 'state.json').exists())
        self.assertTrue((self.root / 'pending.json').exists())
        result = self.call('recover')
        self.assertTrue(result['consistent'])
        self.assertEqual(result['state']['current']['releaseId'], args['releaseId'])

    def test_recovery_committed_journal_cleanup_failure_is_warning(self):
        args, _ = self.upload()
        with mock.patch.object(deploy.Deployer, 'finish_journal', side_effect=OSError('cannot unlink')):
            self.assertTrue(self.call('activate', **args)['success'])
            result = self.call('recover')
        self.assertTrue(result['success'])
        self.assertTrue(result['warnings'])
        self.assertFalse(result['consistent'])
        self.assertIsNotNone(result['pending'])
        self.assertEqual(result['state']['current']['releaseId'], args['releaseId'])
        self.assertTrue(self.call('recover')['consistent'])

    def test_pending_write_failure_never_exchanges(self):
        args, _ = self.upload()
        actual = deploy.write_json
        def fail_journal(path, value):
            if path.name == 'pending.json':
                raise OSError('journal write failure')
            return actual(path, value)
        with mock.patch.object(deploy, 'write_json', side_effect=fail_journal), \
                mock.patch.object(deploy, 'exchange') as exchanged:
            with self.assertRaisesRegex(OSError, 'journal write'):
                self.call('activate', **args)
            exchanged.assert_not_called()
        self.assertEqual(self.snapshot(), self.original)

    def test_unknown_live_marker_refuses_recovery(self):
        args, _ = self.upload()
        with mock.patch.object(deploy, 'exchange', side_effect=OSError('no exchange')):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        (self.site / deploy.MARKER).write_text('{}')
        before = self.snapshot()
        with self.assertRaisesRegex(deploy.DeployError, 'unknown exchange state'):
            self.call('activate', **args)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue((self.root / 'pending.json').exists())

    def test_postcommit_cleanup_failure_is_warning(self):
        args, _ = self.upload()
        actual = deploy.Deployer.remove_incoming
        def fail_after_commit(instance, release_id):
            if instance.state_path.exists():
                raise OSError('simulated cleanup failure')
            return actual(instance, release_id)
        with mock.patch.object(deploy.Deployer, 'remove_incoming', fail_after_commit):
            result = self.call('activate', **args)
        self.assertTrue(result['success'])
        self.assertTrue(result['warnings'])
        self.assertTrue(self.call('status')['consistent'])
        self.assert_two_archives(result)

    def test_postcommit_journal_failure_is_warning_and_recoverable(self):
        args, _ = self.upload()
        with mock.patch.object(deploy.Deployer, 'finish_journal', side_effect=OSError('journal unlink failed')):
            result = self.call('activate', **args)
        self.assertTrue(result['success'])
        self.assertTrue(result['warnings'])
        self.assertIsNotNone(self.call('status')['pending'])
        result = self.call('activate', **args)
        self.assertEqual(result['recovered'], 'committed')
        self.assertTrue(self.call('status')['consistent'])

    def test_corrupt_previous_archive_or_manifest_refuses_rollback(self):
        for kind in ('archive', 'manifest'):
            with self.subTest(kind=kind):
                result, _, _ = self.install('v-' + kind)
                live = self.snapshot()
                suffix = '.tar.gz' if kind == 'archive' else '.manifest.json'
                path = self.root / 'archives' / (result['previous']['releaseId'] + suffix)
                original = path.read_bytes()
                path.write_bytes(b'corrupted')
                with self.assertRaises(deploy.DeployError):
                    self.call('rollback')
                self.assertEqual(self.snapshot(), live)
                path.write_bytes(original)

    def test_discard_unrelated_upload_during_pending_is_safe(self):
        args, _ = self.upload()
        other, paths = self.upload('v-other')
        with mock.patch.object(deploy, 'exchange', side_effect=OSError('failure')):
            with self.assertRaises(OSError):
                self.call('activate', **args)
        archive_before = {p.name: p.read_bytes() for p in (self.root / 'archives').iterdir()}
        self.assertTrue(self.call('discard', **other)['discarded'])
        self.assertFalse(Path(paths['incoming']).exists())
        self.assertEqual(archive_before, {p.name: p.read_bytes() for p in (self.root / 'archives').iterdir()})
        self.assertEqual(self.snapshot(), self.original)

    @unittest.skipUnless(LINUX, 'real POSIX symlinks and permission enforcement')
    def test_real_symlink_root_site_upload_and_bootstrap_rejected(self):
        outside = self.site.parent / 'outside'
        outside.mkdir()
        self.root.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(deploy.DeployError):
            self.call('check')
        self.root.unlink()
        args, paths = self.upload()
        package_path = Path(paths['archivePath'])
        content = package_path.read_bytes()
        package_path.unlink()
        foreign = outside / 'archive.gz'
        foreign.write_bytes(content)
        package_path.symlink_to(foreign)
        with self.assertRaises(deploy.DeployError):
            self.call('activate', **args)
        package_path.unlink()
        package_path.write_bytes(content)
        (self.site / 'linked').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(deploy.DeployError):
            self.call('activate', **args)
        self.assertEqual(foreign.read_bytes(), content)

    @unittest.skipUnless(LINUX, 'real POSIX permissions')
    def test_nonprivate_root_refused(self):
        self.upload()
        self.root.chmod(0o755)
        with self.assertRaisesRegex(deploy.DeployError, '0700'):
            self.call('check')


@unittest.skipUnless(LINUX, 'Linux real renameat2 + stdin subprocess integration')
class LinuxIntegrationTests(Fixture):
    """DeployTests also uses real Linux primitives when run on Linux."""

    def cli(self, action, **kwargs):
        return subprocess.run([sys.executable, '-B', '-', encode(self.args(action, **kwargs))],
                              input=Path(deploy.__file__).read_bytes(), stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=30)

    def test_init_process_death_before_owner_before_and_after_publish_is_retryable(self):
        helper = Path(deploy.__file__).read_text(encoding='utf-8')
        for kind in ('root', 'archives', 'incoming'):
            for phase in ('owner', 'before-publish', 'after-publish'):
                with self.subTest(kind=kind, phase=phase):
                    target, initialize, owner = self.initializer(kind)
                    existing_temps = set(target.parent.glob('.tonks-init-*'))
                    driver = ('import os\n'
                              'ns = {"__name__": "init_crash_test"}\n'
                              'exec(' + repr(helper) + ', ns)\n')
                    if phase == 'owner':
                        driver += 'ns["write_json"] = lambda *a: os._exit(92)\n'
                    elif phase == 'before-publish':
                        driver += 'ns["rename_noreplace"] = lambda *a: os._exit(92)\n'
                    else:
                        driver += ('original = ns["rename_noreplace"]\n'
                                   'def crash_after_publish(*a):\n'
                                   '    original(*a)\n'
                                   '    os._exit(92)\n'
                                   'ns["rename_noreplace"] = crash_after_publish\n')
                    driver += 'ns["init_directory"](ns["Path"](' + repr(str(target)) + '), ' + repr(owner) + ')\n'
                    child = subprocess.run([sys.executable, '-B', '-'], input=driver.encode(),
                                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                    self.assertEqual(child.returncode, 92, child.stderr)
                    leftover = set(target.parent.glob('.tonks-init-*')) - existing_temps
                    self.assertEqual(len(leftover), 0 if phase == 'after-publish' else 1)
                    self.assertEqual(target.exists(), phase == 'after-publish')
                    initialize()
                    self.assertEqual(deploy.read_json(target / deploy.OWNER), owner)
                    # Retry must neither need nor remove any interrupted invocation's temp.
                    self.assertEqual(set(target.parent.glob('.tonks-init-*')), existing_temps | leftover)
        self.assertEqual(self.snapshot(), self.original)

    def test_real_exchange_swaps_directory_inodes(self):
        left = self.site.parent / 'left'
        right = self.site.parent / 'right'
        left.mkdir()
        right.mkdir()
        a, b = left.stat().st_ino, right.stat().st_ino
        deploy.exchange(left, right)
        self.assertEqual((left.stat().st_ino, right.stat().st_ino), (b, a))
        self.assertFalse(left.is_symlink())
        self.assertFalse(right.is_symlink())

    def test_stdin_protocol_end_to_end_and_cross_process_lock(self):
        checked = self.cli('check')
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(len(checked.stdout.splitlines()), 1)
        self.assertTrue(json.loads(checked.stdout)['success'])
        self.assertEqual(checked.stderr, b'')
        release_id = str(uuid.uuid4())
        archive, manifest = package(release_id)
        args = dict(releaseId=release_id, archiveSha256=sha(archive))
        prepared = self.cli('prepare', **args)
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        paths = json.loads(prepared.stdout)
        Path(paths['archivePath']).write_bytes(archive)
        Path(paths['manifestPath']).write_text(json.dumps(manifest))
        with deploy.file_lock(self.root / 'lock'):
            busy = self.cli('activate', **args)
            self.assertEqual(busy.returncode, 1)
            self.assertEqual(busy.stdout, b'')
            self.assertIn('busy', json.loads(busy.stderr)['error'])
        initial_inode = self.site.stat().st_ino
        active = self.cli('activate', **args)
        self.assertEqual(active.returncode, 0, active.stderr)
        self.assertNotEqual(initial_inode, self.site.stat().st_ino)
        self.assert_two_archives(json.loads(active.stdout))
        result = self.cli('rollback')
        self.assertEqual(result.returncode, 0, result.stderr)
        files = self.snapshot()
        files.pop(deploy.MARKER)
        self.assertEqual(files, self.original)
        status = self.cli('status')
        self.assertTrue(json.loads(status.stdout)['consistent'])
        result = self.cli('not-an-action')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b'')
        self.assertFalse(json.loads(result.stderr)['success'])

    def test_process_death_after_real_exchange_recovers(self):
        args, _ = self.upload()
        helper = Path(deploy.__file__).read_text(encoding='utf-8')
        # Inject a hard exit at the exact crash boundary, executing the actual exchange first.
        helper = helper.replace('            exchange(self.site, stage)\n',
                                '            exchange(self.site, stage)\n            os._exit(91)\n')
        crashed = subprocess.run([sys.executable, '-B', '-', encode(self.args('activate', **args))],
                                 input=helper.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        self.assertEqual(crashed.returncode, 91, crashed.stderr)
        self.assertIsNotNone(self.call('status')['pending'])
        self.assertEqual(self.call('activate', **args)['recovered'], 'committed')
        self.assertTrue(self.call('status')['consistent'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
