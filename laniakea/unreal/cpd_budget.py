# SPDX-License-Identifier: AGPL-3.0-or-later
"""Windows admission for one bounded CPD JVM; this does not reserve host memory."""

import ctypes
from ctypes import wintypes


def memory():
    class Status(ctypes.Structure):
        _fields_=[('length',wintypes.DWORD),('load',wintypes.DWORD),
                  *[(name,ctypes.c_ulonglong) for name in
                    ('total','available','commit_total','commit_available','virtual_total','virtual_available','extended')]]
    status=Status();status.length=ctypes.sizeof(status)
    api=ctypes.WinDLL('kernel32',use_last_error=True).GlobalMemoryStatusEx
    api.argtypes=[ctypes.POINTER(Status)];api.restype=wintypes.BOOL
    if not api(ctypes.byref(status)):raise ctypes.WinError(ctypes.get_last_error())
    if status.total<=0 or status.available>status.total:
        raise OSError('invalid Windows memory sample')
    return status.total,status.available,status.commit_available


def require_headroom(heap_mib):
    total,available,commit=memory()
    reserve=max(8*1024**3,total*15//100)
    process=heap_mib*1024**2+1536*1024**2
    if available<process+reserve or commit<process+reserve:
        raise MemoryError(f'CPD needs {heap_mib} MiB heap plus JVM and host headroom; retry when resources are available')
