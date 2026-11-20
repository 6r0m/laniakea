# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded current-source text, authorized by a recorded evidence location and digest."""

import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import stat

MAX_BYTES=4*1024*1024
MAX_LINES=200
MAX_TEXT=64*1024
CONTEXT_LINES=4


def _opened_path(stream):
    if os.name!='nt':
        raise OSError('source preview requires Windows file-handle validation')
    import ctypes
    from ctypes import wintypes
    import msvcrt
    final=ctypes.WinDLL('kernel32',use_last_error=True).GetFinalPathNameByHandleW
    final.argtypes=[wintypes.HANDLE,wintypes.LPWSTR,wintypes.DWORD,wintypes.DWORD]
    final.restype=wintypes.DWORD
    buffer=ctypes.create_unicode_buffer(32768)
    size=final(msvcrt.get_osfhandle(stream.fileno()),buffer,len(buffer),0)
    if not size or size>=len(buffer):raise ctypes.WinError(ctypes.get_last_error())
    name=buffer.value
    if name.startswith('\\\\?\\UNC\\'):name='\\\\'+name[8:]
    elif name.startswith('\\\\?\\'):name=name[4:]
    return Path(name)


def read(root,location):
    path=location.get('path')
    if location.get('root')!='project' or not isinstance(path,str) or not path or '\\' in path or ':' in path or \
            PurePosixPath(path).is_absolute() or '..' in PurePosixPath(path).parts or PurePosixPath(path).as_posix()!=path or \
            not isinstance(location.get('sha256'),str) or not re.fullmatch('[0-9a-f]{64}',location['sha256']):
        raise ValueError('expected a recorded project-source location and digest')
    if any(type(location.get(key)) is not int or location[key]<1 for key in ('line','column','end_line','end_column')) or \
            (location['end_line'],location['end_column'])<(location['line'],location['column']):
        raise ValueError('invalid recorded source range')
    public={key:location[key] for key in ('root','path','line','column','end_line','end_column')}
    def unavailable(code,detail):
        return {'status':'unavailable','code':code,'detail':detail,'location':public,'lines':[]}
    if not isinstance(root,str) or not root:
        return unavailable('boundary','The recorded project boundary is unavailable.')
    try:
        recorded=Path(root).absolute();physical=recorded.resolve(strict=True)
        if os.path.normcase(str(recorded))!=os.path.normcase(str(physical)):
            return unavailable('boundary','The recorded project root was redirected; preview is unavailable.')
        file=(recorded/path).resolve(strict=True)
        if not file.is_relative_to(physical):
            return unavailable('boundary','Preview is unavailable outside the recorded project boundary. Use the editor link.')
        with file.open('rb') as stream:
            if not _opened_path(stream).is_relative_to(physical):
                return unavailable('boundary','The opened source file is outside the recorded project boundary.')
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):return unavailable('file_type','Preview requires a regular source file.')
            if info.st_size>MAX_BYTES:return unavailable('size_limit','This file exceeds the bounded preview size. Use the editor link.')
            raw=stream.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES:return unavailable('size_limit','This file exceeds the bounded preview size. Use the editor link.')
    except FileNotFoundError:
        return unavailable('missing','The recorded source file is no longer available.')
    except (OSError,RuntimeError):
        return unavailable('read_error','The source file could not be read or its physical boundary could not be verified.')
    if hashlib.sha256(raw).hexdigest()!=location['sha256']:
        return {'status':'changed','detail':'Changed since analysis. Recorded lines may have moved; recheck or open the current file in your editor.',
                'location':public,'lines':[]}
    try:
        text=raw.decode('utf-16' if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8-sig')
    except UnicodeError:
        return unavailable('encoding','This source encoding cannot be previewed. Use the editor link.')
    if '\x00' in text:return unavailable('encoding','This source is not supported text. Use the editor link.')
    lines=text.replace('\r\n','\n').replace('\r','\n').split('\n')
    if location['end_line']>len(lines):
        return unavailable('range','The recorded range is outside the matching source text.')
    wanted_start=max(1,location['line']-CONTEXT_LINES)
    wanted_stop=min(len(lines),location['end_line']+CONTEXT_LINES)
    start=location['line'];stop=start-1;used=0
    for number in range(start,min(location['end_line'],start+MAX_LINES-1)+1):
        size=len(lines[number-1].encode('utf-8'))
        if used+size>MAX_TEXT:break
        used+=size;stop=number
    if stop<start:
        return unavailable('text_limit','The selected matching line exceeds the preview limit. Use the editor link.')
    if stop==location['end_line']:
        while start>wanted_start and stop-start+1<MAX_LINES:
            size=len(lines[start-2].encode('utf-8'))
            if used+size>MAX_TEXT:break
            used+=size;start-=1
        while stop<wanted_stop and stop-start+1<MAX_LINES:
            size=len(lines[stop].encode('utf-8'))
            if used+size>MAX_TEXT:break
            used+=size;stop+=1
    preview=[{'number':number,'text':lines[number-1],'matched':location['line']<=number<=location['end_line']}
             for number in range(start,stop+1)]
    return {'status':'matching','detail':'Current source matches the recorded file hash.',
            'location':public,'start_line':start,'lines':preview,
            'truncated':start>wanted_start or stop<wanted_stop}
