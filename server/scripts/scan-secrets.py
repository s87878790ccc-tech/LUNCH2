"""Scan all fetched Git refs and the tracked working tree. Never print secrets."""
import hashlib
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

VERSION = "8.30.1"
ARCHIVE = f"gitleaks_{VERSION}_linux_x64.tar.gz"
SHA256 = "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
ROOT = Path(__file__).resolve().parents[2]


def main():
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
        raise SystemExit("This installer supports Linux x64. Install Gitleaks 8.30.1 for your platform and run git/dir scans with --redact.")
    with tempfile.TemporaryDirectory(prefix="lunch-secrets-") as directory:
        temp = Path(directory)
        url = f"https://github.com/gitleaks/gitleaks/releases/download/v{VERSION}/{ARCHIVE}"
        with urllib.request.urlopen(url, timeout=45) as response:
            archive = response.read()
        if hashlib.sha256(archive).hexdigest() != SHA256:
            raise SystemExit("Gitleaks archive checksum mismatch")
        archive_file = temp / ARCHIVE
        archive_file.write_bytes(archive)
        with tarfile.open(archive_file, "r:gz") as tar:
            executable = temp / "gitleaks"
            executable.write_bytes(tar.extractfile("gitleaks").read())
        executable.chmod(0o700)
        options = ["--redact", "--no-banner", "--no-color"]
        history = subprocess.run([str(executable), "git", "--log-opts=--all", *options, str(ROOT)], cwd=ROOT)
        snapshot = temp / "tracked-source"
        snapshot.mkdir()
        files = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
        for name in filter(None, files):
            source = ROOT / name
            if source.is_symlink():
                raise SystemExit("Refusing to scan a tracked symlink")
            if source.is_file():
                target = snapshot / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
        current = subprocess.run([str(executable), "dir", *options, str(snapshot)], cwd=ROOT)
        return 1 if history.returncode or current.returncode else 0


if __name__ == "__main__":
    raise SystemExit(main())
