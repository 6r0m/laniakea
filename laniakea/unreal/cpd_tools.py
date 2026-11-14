# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline optional CPD installation; ordinary extraction never loads Java."""

import hashlib
import shutil
import subprocess
from pathlib import Path

from .. import LaniakeaError
from ..workspace import read_json, write_json

VERSION='7.29.0'
BRIDGE=Path(__file__).with_name('CpdBridge.java')


def digest(path):
    result=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()


def install(directory,distribution,java):
    directory=Path(directory);distribution=Path(distribution).resolve();java=Path(java).resolve()
    if not (distribution/f'lib/pmd-cpp-{VERSION}.jar').is_file() or not (distribution/'LICENSE').is_file():
        raise LaniakeaError(f'setup-health requires the unpacked PMD {VERSION} binary distribution with LICENSE')
    compiler=java.with_name('javac.exe')
    if not java.is_file() or not compiler.is_file():
        raise LaniakeaError('setup-health requires a JDK 11+ java.exe and adjacent javac.exe')
    directory.mkdir(parents=True,exist_ok=True)
    # Keep the supplied distribution notices with its libraries; no tool binary enters Git.
    shutil.copytree(distribution/'lib',directory/'lib',dirs_exist_ok=True)
    for source in distribution.iterdir():
        if source.is_file():shutil.copy2(source,directory/source.name)
    (directory/'classes').mkdir(exist_ok=True)
    try:
        result=subprocess.run([str(compiler),'--release','11','-cp',str(directory/'lib/*'),'-d',str(directory/'classes'),str(BRIDGE)],
                              capture_output=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except (OSError,subprocess.TimeoutExpired) as error:
        raise LaniakeaError(f'CPD adapter compilation failed: {error}') from error
    if result.returncode:raise LaniakeaError('CPD adapter compilation failed: '+result.stderr.decode('utf-8',errors='replace'))
    files={p.relative_to(directory).as_posix():digest(p) for p in sorted(directory.rglob('*'))
           if p.is_file() and p.name!='tools.json'}
    write_json(directory/'tools.json',{'version':VERSION,'java':str(java),'java_sha256':digest(java),
                                     'bridge':digest(BRIDGE),'files':files})
    return load(directory)


def load(directory):
    directory=Path(directory)
    try:
        marker=read_json(directory/'tools.json')
        if marker.get('version')!=VERSION or marker.get('bridge')!=digest(BRIDGE):raise ValueError('adapter or version changed')
        java=Path(marker['java'])
        if digest(java)!=marker['java_sha256']:raise ValueError('Java identity changed')
        for relative,expected in marker['files'].items():
            path=(directory/relative).resolve()
            if not path.is_relative_to(directory.resolve()) or digest(path)!=expected:raise ValueError('tool identity changed')
        if not {'classes/CpdBridge.class',f'lib/pmd-cpp-{VERSION}.jar'}<=marker['files'].keys():
            raise ValueError('missing adapter or C++ analyzer')
    except (OSError,ValueError,KeyError,TypeError) as error:
        raise LaniakeaError(f'CPD tools unavailable ({error}); run setup-health with PMD {VERSION} and a JDK 11+') from error
    identity=hashlib.sha256(str(sorted(marker['files'].items())).encode()+marker['bridge'].encode()+marker['java_sha256'].encode()).hexdigest()
    return {'directory':directory.resolve(),'java':java,'identity':identity}
