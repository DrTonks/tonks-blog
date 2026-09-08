"""Write regular manifest files as a portable tar stream (including UTF-8 names)."""
import json
import os
from pathlib import Path
import sys
import tarfile


def pack(root, manifest_path):
    root = Path(root).resolve(strict=True)
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|", format=tarfile.PAX_FORMAT) as archive:
        for entry in manifest["files"]:
            filename = entry["path"]
            source = root.joinpath(*filename.split("/"))
            if source.is_symlink() or not source.is_file() or source.resolve(strict=True) != source:
                raise ValueError("Archive source changed or contains a symbolic link")
            if not source.is_relative_to(root):
                raise ValueError("Archive source escaped dist")
            info = tarfile.TarInfo(filename)
            info.size = entry["size"]
            info.mode = 0o644
            info.mtime = 0
            with source.open("rb") as stream:
                if os.fstat(stream.fileno()).st_size != info.size:
                    raise ValueError("Archive source size changed during build")
                archive.addfile(info, stream)


if __name__ == "__main__":
    pack(sys.argv[1], sys.argv[2])
