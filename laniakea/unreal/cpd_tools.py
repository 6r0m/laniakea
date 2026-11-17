# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline optional CPD installation; ordinary extraction never loads Java."""

import hashlib
import os
import shutil
import subprocess
from pathlib import Path

from .. import LaniakeaError
from ..workspace import read_json, write_json

VERSION='7.29.0'
BRIDGE=Path(__file__).with_name('CpdBridge.java')


class ToolError(LaniakeaError):
    """An optional installation could not be validated; it must never be executed."""


def digest(path):
    result=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()


def inventory(directory):
    def unreadable(error):
        raise error
    found={}
    for current,dirs,files in os.walk(directory,onerror=unreadable):
        dirs.sort()
        for name in dirs+files:
            path=Path(current)/name
            if path.is_symlink() or getattr(path.lstat(),'st_file_attributes',0)&0x400:
                raise ValueError('linked entries are not allowed in the CPD tool inventory')
        for name in sorted(files):
            path=Path(current)/name;relative=path.relative_to(directory).as_posix()
            if relative!='tools.json':found[relative]=path
    return found


def install(directory,distribution,java):
    directory=Path(directory).resolve();distribution=Path(distribution).resolve();java=Path(java).resolve()
    if directory.is_relative_to(distribution) or distribution.is_relative_to(directory):
        raise LaniakeaError('CPD installation and supplied distribution must use separate directories')
    if not (distribution/f'lib/pmd-cpp-{VERSION}.jar').is_file() or not (distribution/'LICENSE').is_file():
        raise LaniakeaError(f'setup-health requires the unpacked PMD {VERSION} binary distribution with LICENSE')
    compiler=java.with_name('javac.exe')
    if not java.is_file() or not compiler.is_file():
        raise LaniakeaError('setup-health requires a JDK 11+ java.exe and adjacent javac.exe')
    replacements=[directory/'lib',directory/'classes']
    if any(java.is_relative_to(path) or compiler.is_relative_to(path) for path in replacements):
        raise LaniakeaError('the supplied JDK must be separate from replaced CPD directories')
    directory.mkdir(parents=True,exist_ok=True)
    try:inventory(directory)
    except (OSError,ValueError) as error:raise LaniakeaError(f'cannot replace CPD installation: {error}') from error
    for path in replacements:
        if path.resolve().parent!=directory or path.exists() and not path.is_dir():
            raise LaniakeaError('CPD replacement paths must be directories inside the installation')
    # Both runtime classpath entries must come only from this setup, not an earlier library or class set.
    for path in replacements:
        if path.exists():shutil.rmtree(path)
    # Keep the supplied distribution notices with its libraries; no tool binary enters Git.
    shutil.copytree(distribution/'lib',directory/'lib')
    for source in distribution.iterdir():
        if source.is_file():shutil.copy2(source,directory/source.name)
    (directory/'classes').mkdir(exist_ok=True)
    try:
        result=subprocess.run([str(compiler),'--release','11','-cp',str(directory/'lib/*'),'-d',str(directory/'classes'),str(BRIDGE)],
                              capture_output=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except (OSError,subprocess.TimeoutExpired) as error:
        raise LaniakeaError(f'CPD adapter compilation failed: {error}') from error
    if result.returncode:raise LaniakeaError('CPD adapter compilation failed: '+result.stderr.decode('utf-8',errors='replace'))
    files={relative:digest(path) for relative,path in inventory(directory).items()}
    write_json(directory/'tools.json',{'version':VERSION,'java':str(java),'java_sha256':digest(java),
                                     'bridge':digest(BRIDGE),'files':files})
    return load(directory)


def load(directory):
    directory=Path(directory).resolve()
    try:
        actual=inventory(directory)
        marker=read_json(directory/'tools.json')
        if marker.get('version')!=VERSION or marker.get('bridge')!=digest(BRIDGE):raise ValueError('adapter or version changed')
        if not isinstance(marker.get('files'),dict) or set(actual)!=set(marker['files']):
            raise ValueError('tool inventory changed')
        java=Path(marker['java'])
        if digest(java)!=marker['java_sha256']:raise ValueError('Java identity changed')
        for relative,expected in marker['files'].items():
            path=(directory/relative).resolve()
            if not path.is_relative_to(directory.resolve()) or digest(path)!=expected:raise ValueError('tool identity changed')
        if not {'classes/CpdBridge.class',f'lib/pmd-cpp-{VERSION}.jar'}<=marker['files'].keys():
            raise ValueError('missing adapter or C++ analyzer')
    except (OSError,ValueError,KeyError,TypeError) as error:
        raise ToolError(f'CPD tools unavailable ({error}); run setup-health with PMD {VERSION} and a JDK 11+') from error
    identity=hashlib.sha256(str(sorted(marker['files'].items())).encode()+marker['bridge'].encode()+marker['java_sha256'].encode()).hexdigest()
    return {'directory':directory.resolve(),'java':java,'identity':identity}
