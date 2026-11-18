# SPDX-License-Identifier: AGPL-3.0-or-later
"""A bounded projection of one owned worker's current phase; never analysis authority."""

from contextlib import contextmanager
from contextvars import ContextVar
from time import monotonic

from .workspace import write_json

_owner=ContextVar('analysis_progress',default=None)


@contextmanager
def reporting(path):
    token=_owner.set((path,monotonic()))
    try:yield
    finally:_owner.reset(token)


def emit(phase,label,completed=None,total=None):
    owner=_owner.get()
    if owner is None:return
    value={'phase':phase,'label':label,'seconds':round(monotonic()-owner[1],2)}
    if completed is not None and total is not None:value.update(completed=completed,total=total)
    write_json(owner[0],value)
