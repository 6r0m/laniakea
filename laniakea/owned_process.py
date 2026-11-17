# SPDX-License-Identifier: AGPL-3.0-or-later
"""Windows child-tree ownership for disposable analysis; no PID/name-based termination."""

import ctypes as c
from ctypes import wintypes as w
import msvcrt
import os
from pathlib import Path
import subprocess
import time

from . import LaniakeaError


k=c.WinDLL('kernel32',use_last_error=True)


def api(name,args,result=w.BOOL):
    call=getattr(k,name);call.argtypes=args;call.restype=result
    return call


close=api('CloseHandle',[w.HANDLE])
create_job=api('CreateJobObjectW',[w.LPVOID,w.LPCWSTR],w.HANDLE)
set_job=api('SetInformationJobObject',[w.HANDLE,c.c_int,w.LPVOID,w.DWORD])
query_job=api('QueryInformationJobObject',[w.HANDLE,c.c_int,w.LPVOID,w.DWORD,w.LPVOID])
terminate_job=api('TerminateJobObject',[w.HANDLE,w.UINT])
terminate_process=api('TerminateProcess',[w.HANDLE,w.UINT])
initialize=api('InitializeProcThreadAttributeList',[w.LPVOID,w.DWORD,w.DWORD,c.POINTER(c.c_size_t)])
update=api('UpdateProcThreadAttribute',[w.LPVOID,w.DWORD,c.c_size_t,w.LPVOID,c.c_size_t,w.LPVOID,w.LPVOID])
delete=api('DeleteProcThreadAttributeList',[w.LPVOID],None)
wait=api('WaitForSingleObject',[w.HANDLE,w.DWORD],w.DWORD)
exit_code=api('GetExitCodeProcess',[w.HANDLE,c.POINTER(w.DWORD)])
member=api('IsProcessInJob',[w.HANDLE,w.HANDLE,c.POINTER(w.BOOL)])
resume=api('ResumeThread',[w.HANDLE],w.DWORD)
open_process=api('OpenProcess',[w.DWORD,w.BOOL,w.DWORD],w.HANDLE)


class BasicLimit(c.Structure):
    _fields_=[('process_time',c.c_longlong),('job_time',c.c_longlong),('flags',w.DWORD),
              ('min_working',c.c_size_t),('max_working',c.c_size_t),('active',w.DWORD),
              ('affinity',c.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]


class Limits(c.Structure):
    _fields_=[('basic',BasicLimit),('io',c.c_ulonglong*6),('process_memory',c.c_size_t),
              ('job_memory',c.c_size_t),('peak_process',c.c_size_t),('peak_job',c.c_size_t)]


class Accounting(c.Structure):
    _fields_=[('times',c.c_longlong*4),('faults',w.DWORD),('total',w.DWORD),
              ('active',w.DWORD),('terminated',w.DWORD)]


class Startup(c.Structure):
    _fields_=[('cb',w.DWORD),('reserved',w.LPWSTR),('desktop',w.LPWSTR),('title',w.LPWSTR),
              ('x',w.DWORD),('y',w.DWORD),('width',w.DWORD),('height',w.DWORD),
              ('xchars',w.DWORD),('ychars',w.DWORD),('fill',w.DWORD),('flags',w.DWORD),
              ('show',w.WORD),('reserved_size',w.WORD),('reserved_data',w.LPVOID),
              ('stdin',w.HANDLE),('stdout',w.HANDLE),('stderr',w.HANDLE)]


class StartupEx(c.Structure):
    _fields_=[('base',Startup),('attributes',w.LPVOID)]


class Information(c.Structure):
    _fields_=[('process',w.HANDLE),('thread',w.HANDLE),('pid',w.DWORD),('tid',w.DWORD)]


create=api('CreateProcessW',[w.LPCWSTR,w.LPWSTR,w.LPVOID,w.LPVOID,w.BOOL,w.DWORD,
                            w.LPVOID,w.LPCWSTR,c.POINTER(StartupEx),c.POINTER(Information)])


def checked(result):
    if not result:raise c.WinError(c.get_last_error())
    return result


def exited(pid):
    handle=open_process(0x100000,False,pid)
    if not handle:
        if c.get_last_error()==87:return True
        raise c.WinError(c.get_last_error())
    try:return wait(handle,0)==0
    finally:close(handle)


class Process:
    def __init__(self,command,log,cwd=None,env=None):
        self.job=None;self.handle=None;self.pid=None
        attributes=None;initialized=False;info=Information()
        try:
            self.job=checked(create_job(None,None))
            limits=Limits();limits.basic.flags=0x2000
            checked(set_job(self.job,9,c.byref(limits),c.sizeof(limits)))
            length=c.c_size_t()
            initialize(None,2,0,c.byref(length))
            attributes=c.create_string_buffer(length.value)
            checked(initialize(attributes,2,0,c.byref(length)));initialized=True
            jobs=(w.HANDLE*1)(self.job)
            checked(update(attributes,0,0x2000D,jobs,c.sizeof(jobs),None,None))
            Path(log).parent.mkdir(parents=True,exist_ok=True)
            with open(log,'wb') as output,open(os.devnull,'rb') as input_stream:
                handles=(w.HANDLE*2)(msvcrt.get_osfhandle(input_stream.fileno()),msvcrt.get_osfhandle(output.fileno()))
                for handle in handles:os.set_handle_inheritable(handle,True)
                try:
                    checked(update(attributes,0,0x20002,handles,c.sizeof(handles),None,None))
                    startup=StartupEx();startup.base.cb=c.sizeof(startup);startup.attributes=c.cast(attributes,w.LPVOID)
                    startup.base.flags=0x100;startup.base.stdin=handles[0]
                    startup.base.stdout=handles[1];startup.base.stderr=handles[1]
                    environment=c.create_unicode_buffer('\0'.join(f'{name}={value}' for name,value in sorted(
                        (dict(os.environ) if env is None else env).items(),key=lambda pair:pair[0].upper()))+'\0\0')
                    # JOB_LIST assigns the suspended child during creation. Only this controller retains the job handle.
                    checked(create(str(command[0]),c.create_unicode_buffer(subprocess.list2cmdline(list(map(str,command)))),
                                   None,None,True,0x8000000|0x80000|0x400|0x4,environment,
                                   str(cwd) if cwd else None,c.byref(startup),c.byref(info)))
                finally:
                    for handle in handles:os.set_handle_inheritable(handle,False)
            self.handle=info.process;self.pid=info.pid
            if not self.contains(self.handle):raise LaniakeaError('analysis worker was not contained before execution')
            if resume(info.thread)==0xffffffff:raise c.WinError(c.get_last_error())
        except BaseException:
            if self.job:terminate_job(self.job,130)
            if info.process:
                # CreateProcess returned this exact owned handle even if admission verification failed.
                # Such a suspended child may not belong to the job, so closing the job alone is insufficient.
                terminate_process(info.process,130)
                wait(info.process,3000);close(info.process)
            if self.job:close(self.job)
            self.job=self.handle=None
            raise
        finally:
            if info.thread:close(info.thread)
            if initialized:delete(attributes)

    def contains(self,handle):
        result=w.BOOL();checked(member(int(handle),self.job,c.byref(result)))
        return bool(result.value)

    def active(self):
        data=Accounting();checked(query_job(self.job,1,c.byref(data),c.sizeof(data),None))
        return data.active

    def poll(self):
        result=wait(self.handle,0)
        if result==258:return None
        if result!=0:raise c.WinError(c.get_last_error())
        code=w.DWORD();checked(exit_code(self.handle,c.byref(code)))
        return code.value

    def wait(self,timeout):
        if wait(self.handle,max(0,int(timeout*1000)))!=0:raise TimeoutError('analysis worker is still running')
        return self.poll()

    def cancel(self,timeout=3):
        checked(terminate_job(self.job,130))
        deadline=time.monotonic()+timeout
        while self.active():
            if time.monotonic()>=deadline:raise TimeoutError('owned analysis children did not stop')
            time.sleep(.01)
        self.wait(max(.01,deadline-time.monotonic()))

    def close(self):
        if self.job:
            try:
                if self.active():self.cancel()
            finally:
                # Last-handle closure remains the final containment boundary even if reaping failed.
                close(self.job);close(self.handle)
                self.job=self.handle=None

    def __enter__(self):return self
    def __exit__(self,*_args):self.close()
