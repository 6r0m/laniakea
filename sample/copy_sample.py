# SPDX-License-Identifier: AGPL-3.0-or-later
"""Copy the authored Unreal sample into a disposable directory."""

import argparse
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "sample" / "SampleProject"


def _git_files(*options):
    raw = subprocess.check_output(
        ["git", "ls-files", "-z", *options, "--", SAMPLE.relative_to(ROOT).as_posix()], cwd=ROOT)
    return {ROOT / os.fsdecode(name) for name in raw.split(b"\0") if name}


def tracked_ignored_files():
    return _git_files("--cached", "--ignored", "--exclude-per-directory=.gitignore")


def sample_files():
    candidates = _git_files("--cached") - tracked_ignored_files()
    files = []
    for path in sorted(candidates):
        if path.is_file():
            if path.resolve() != path:
                raise ValueError(f"Sample file must be local to its tracked path: {path.relative_to(SAMPLE)}")
            files.append(path)
    if SAMPLE / "SampleProject.uproject" not in files:
        raise FileNotFoundError("The authored sample project descriptor is missing")
    return files


def copy_sample(base):
    files = sample_files()
    copy = Path(base).resolve() / SAMPLE.name
    if ROOT in copy.parents:
        relative = copy.relative_to(ROOT).as_posix() + "/"
        ignored = subprocess.run(["git", "check-ignore", "-q", "--", relative], cwd=ROOT)
        if ignored.returncode == 1:
            raise ValueError("Choose a destination outside the checkout or in an ignored directory")
        ignored.check_returncode()
    copy.mkdir(parents=True)
    for path in files:
        target = copy / path.relative_to(SAMPLE)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    return copy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="parent directory for the new SampleProject copy")
    destination = parser.parse_args().destination
    try:
        copy = copy_sample(destination)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Could not copy the sample. {error}\n")
    print(copy)


if __name__ == "__main__":
    main()
