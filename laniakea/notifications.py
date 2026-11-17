# SPDX-License-Identifier: AGPL-3.0-or-later
"""Windows directory notifications multiplexed through one completion port."""

import ctypes as c
from ctypes import wintypes as w
import os
from pathlib import Path
import struct
import threading
import time

from .owned_process import api, checked, close


class Overlapped(c.Structure):
    _fields_=[('internal',c.c_size_t),('high',c.c_size_t),('offset',w.DWORD),
              ('offset_high',w.DWORD),('event',w.HANDLE)]


create_file=api('CreateFileW',[w.LPCWSTR,w.DWORD,w.DWORD,w.LPVOID,w.DWORD,w.DWORD,w.HANDLE],w.HANDLE)
completion=api('CreateIoCompletionPort',[w.HANDLE,w.HANDLE,c.c_size_t,w.DWORD],w.HANDLE)
changes=api('ReadDirectoryChangesW',[w.HANDLE,w.LPVOID,w.DWORD,w.BOOL,w.DWORD,w.LPVOID,
                                   c.POINTER(Overlapped),w.LPVOID])
receive=api('GetQueuedCompletionStatus',[w.HANDLE,c.POINTER(w.DWORD),c.POINTER(c.c_size_t),
                                       c.POINTER(c.POINTER(Overlapped)),w.DWORD])
wake=api('PostQueuedCompletionStatus',[w.HANDLE,w.DWORD,c.c_size_t,w.LPVOID])
cancel=api('CancelIoEx',[w.HANDLE,w.LPVOID])
drain=api('GetOverlappedResult',[w.HANDLE,c.POINTER(Overlapped),c.POINTER(w.DWORD),w.BOOL])
INVALID=c.c_void_p(-1).value


def names(raw):
    """Reject malformed/overflowed event batches; callers must reconcile rather than infer absence."""
    found=[];offset=0
    while True:
        if len(raw)-offset<12:raise ValueError('short notification')
        following,action,length=struct.unpack_from('<III',raw,offset)
        if action not in range(1,6) or length%2 or length>len(raw)-offset-12:
            raise ValueError('invalid notification')
        name=raw[offset+12:offset+12+length].decode('utf-16-le')
        if not name or '\x00' in name or Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('invalid notification path')
        found.append(name)
        if not following:return found
        if following<12+length or following%4 or offset+following>=len(raw):
            raise ValueError('invalid notification offset')
        offset+=following


class Notifications:
    """One pending read per deduplicated directory. Callback receives (spec, names, failure)."""
    def __init__(self,callback):
        self.callback=callback
        self.port=checked(completion(INVALID,None,0,1))
        self.lock=threading.Lock();self.desired={};self.entries={};self.serial=0
        self.stopping=False;self.error=None
        self.failures={};self.retry_after={}
        self.thread=threading.Thread(target=self._run,name='laniakea-notifications',daemon=True)
        self.thread.start()

    def replace(self,specs):
        with self.lock:
            if self.stopping:return
            self.desired={(os.path.normcase(str(Path(spec[0]).absolute())),bool(spec[1])):
                          spec[2] if len(spec)>2 else None for spec in specs}
            if self.error:raise OSError(self.error)
            checked(wake(self.port,0,0,None))

    def _arm(self,entry):
        # No last-access notifications: content verification itself must not retrigger analysis.
        checked(changes(entry['handle'],entry['buffer'],len(entry['buffer']),entry['spec'][1],
                        1|2|4|8|16|64|256,None,c.byref(entry['overlapped']),None))

    def _sync(self):
        with self.lock:desired={} if self.stopping else self.desired.copy()
        for entry in list(self.entries.values()):
            if (entry['spec'] not in desired or entry['identity']!=desired[entry['spec']]) and not entry['closing']:
                entry['closing']=True
                if not cancel(entry['handle'],c.byref(entry['overlapped'])) and c.get_last_error()!=1168:
                    self.callback(entry['spec'],[],str(c.WinError(c.get_last_error())))
        active={e['spec'] for e in self.entries.values()}
        for spec in desired.keys()-active:
            refused,deadline=self.retry_after.get(spec,(None,0))
            if refused==desired[spec] and time.monotonic()<deadline:continue
            handle=create_file(spec[0],1,1|2|4,None,3,0x2000000|0x40000000,None)
            if handle==INVALID:
                self._refuse(spec,str(c.WinError(c.get_last_error())),desired[spec]);continue
            self.serial+=1;key=self.serial
            entry={'spec':spec,'identity':desired[spec],'handle':handle,'buffer':c.create_string_buffer(65536),
                   'overlapped':Overlapped(),'closing':False}
            try:
                checked(completion(handle,self.port,key,0));self._arm(entry)
            except OSError as error:
                close(handle);self._refuse(spec,str(error),desired[spec])
            else:
                self.entries[key]=entry
                failures=dict(self.failures);failures.pop(spec,None);self.failures=failures
                self.retry_after.pop(spec,None)

    def _refuse(self,spec,error,identity=None):
        if identity is None:
            with self.lock:identity=self.desired.get(spec)
        self.failures={**self.failures,spec:error};self.retry_after[spec]=(identity,time.monotonic()+60)
        self.callback(spec,[],error)

    def _run(self):
        try:
            while True:
                self._sync()
                with self.lock:stopping=self.stopping
                if stopping and not self.entries:break
                count=w.DWORD();key=c.c_size_t();overlap=c.POINTER(Overlapped)()
                ok=receive(self.port,c.byref(count),c.byref(key),c.byref(overlap),1000)
                if not overlap:
                    if not ok and c.get_last_error()!=258:raise c.WinError(c.get_last_error())
                    continue
                entry=self.entries[key.value]
                if entry['closing']:
                    close(entry['handle']);del self.entries[key.value];continue
                failure=None;batch=[]
                if not ok:failure=str(c.WinError(c.get_last_error()))
                elif not count.value:failure='directory notification overflow; reconciliation required'
                else:
                    try:batch=names(entry['buffer'].raw[:count.value])
                    except (ValueError,UnicodeError) as error:failure=str(error)
                try:self._arm(entry)
                except OSError as error:
                    failure=str(error);close(entry['handle']);del self.entries[key.value]
                    self.failures={**self.failures,entry['spec']:failure}
                    self.retry_after[entry['spec']]=(entry['identity'],time.monotonic()+60)
                self.callback(entry['spec'],batch,failure)
        except BaseException as error:
            self.error=str(error)
            self.callback(None,[],self.error)
        finally:
            # Pending OVERLAPPED storage stays alive until cancellation completes.
            for entry in self.entries.values():cancel(entry['handle'],None)
            for entry in self.entries.values():
                count=w.DWORD();drain(entry['handle'],c.byref(entry['overlapped']),c.byref(count),True)
                close(entry['handle'])
            self.entries.clear();close(self.port)

    def stop(self,timeout=3):
        with self.lock:
            self.stopping=True
            if self.thread.is_alive() and not self.error:checked(wake(self.port,0,0,None))
        if self.thread.is_alive():
            self.thread.join(timeout)
        if self.thread.is_alive():raise TimeoutError('directory notifications did not stop')
