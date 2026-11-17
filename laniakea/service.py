# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local viewer ownership and graceful stop; ports and PIDs alone never identify our server."""

import http.client
import json
import secrets
import time
from contextlib import contextmanager

from . import LaniakeaError
from .workspace import write_json, writer_lock

INSTANCE='/control/instance'
STOP='/control/stop'
HEADER='X-Laniakea-Control'


def _failed_shutdown(workspace):
    try:
        with (workspace.root/'server.json').open('rb') as stream:raw=stream.read(4097)
    except FileNotFoundError:return False
    if len(raw)>4096:return False
    try:state=json.loads(raw)
    except ValueError:return False
    return isinstance(state,dict) and state.get('state')=='failed'


class Owner:
    def __init__(self,workspace):
        self.path=workspace.root/'server.json'
        self.token=secrets.token_hex(32)
        self.failure=None

    def failed(self,error):
        self.failure=str(error)
        write_json(self.path,{'version':1,'state':'failed','error':self.failure})

    def ready(self,server):
        server.control_token=self.token
        write_json(self.path,{'version':1,'state':'running','port':server.server_address[1],'token':self.token})


@contextmanager
def running(workspace):
    with writer_lock(workspace.root/'server.lock','Laniakea is already starting or running in this workspace; run python laniakea.py down first.'):
        if _failed_shutdown(workspace):
            raise LaniakeaError('previous background shutdown was not confirmed; inspect workspace server.json and worker logs before restarting')
        owner=Owner(workspace)
        try:
            write_json(owner.path,{'version':1,'state':'starting'})
            yield owner
        finally:
            if owner.failure is None:owner.path.unlink(missing_ok=True)


def control(handler,stop=False):
    expected=getattr(handler.server,'control_token',None)
    supplied=handler.headers.get(HEADER,'')
    if not expected or len(supplied)!=64 or any(c not in '0123456789abcdef' for c in supplied) or \
            not secrets.compare_digest(supplied,expected):
        return handler._send(403,b'forbidden server control\n')
    if not stop:
        # Keep the authenticated connection, so down cannot reconnect to a different process on a reused port.
        handler.protocol_version='HTTP/1.1';handler.close_connection=False
        return handler._send(200,json.dumps({'service':'laniakea/1','instance':expected}).encode(),'application/json')
    if handler.headers.get('Content-Type','').split(';',1)[0]!='application/json':
        return handler._send(415,b'expected application/json\n')
    if handler.headers.get('Content-Length')!='2' or handler.headers.get('Transfer-Encoding'):
        return handler._send(413,b'expected empty JSON object\n')
    if handler._body(2)!=b'{}':return handler._send(400,b'expected empty JSON object\n')
    monitor=getattr(handler.server,'monitor',None)
    if monitor:monitor.request_stop()
    handler._send(200,b'{"stopping":true}','application/json')
    handler.server.shutdown()


def idle(workspace,clean=False):
    acquired=False
    try:
        with writer_lock(workspace.root/'server.lock','Viewer is running.'):
            acquired=True
            if clean:(workspace.root/'server.json').unlink(missing_ok=True)
    except LaniakeaError:
        if acquired:raise
        return False
    return True


def stop(workspace,host):
    try:
        if _failed_shutdown(workspace):
            raise ValueError('previous shutdown was not confirmed; inspect server.json before restarting')
        if idle(workspace,clean=True):return False
        with (workspace.root/'server.json').open('rb') as stream:raw=stream.read(4097)
        if len(raw)>4096:raise ValueError('oversized server state')
        state=json.loads(raw)
        if not isinstance(state,dict) or type(state.get('version')) is not int or state['version']!=1:
            raise ValueError('invalid server state')
        if state.get('state')=='starting':raise ValueError('viewer is still preparing maps; retry down when ready')
        port=state.get('port');token=state.get('token')
        if state.get('state')!='running' or type(port) is not int or not 1<=port<=65535 or \
                not isinstance(token,str) or len(token)!=64 or any(c not in '0123456789abcdef' for c in token):
            raise ValueError('invalid server control identity')
        connection=http.client.HTTPConnection(host,port,timeout=3)
        try:
            headers={HEADER:token}
            connection.request('GET',INSTANCE,headers=headers);peer=connection.sock
            response=connection.getresponse();body=response.read(4097)
            if response.status!=200 or len(body)>4096 or json.loads(body)!={'service':'laniakea/1','instance':token}:
                raise ValueError('endpoint is not the recorded Laniakea instance; nothing was stopped')
            if peer is None or connection.sock is not peer:
                raise ValueError('control connection closed; refusing to reconnect for shutdown')
            connection.request('POST',STOP,b'{}',headers={**headers,'Origin':f'http://{host}:{port}',
                                                       'Content-Type':'application/json','Connection':'close'})
            response=connection.getresponse();body=response.read(4097)
            if response.status!=200 or len(body)>4096 or json.loads(body)!={'stopping':True}:
                raise ValueError('viewer refused the stop request')
        finally:connection.close()
        deadline=time.monotonic()+10
        while not idle(workspace):
            if time.monotonic()>=deadline:raise ValueError('stop requested but shutdown is not confirmed')
            time.sleep(.05)
        if _failed_shutdown(workspace):raise ValueError('background shutdown was not confirmed; inspect server.json')
    except (OSError,ValueError,http.client.HTTPException) as error:
        raise LaniakeaError(f'cannot stop viewer: {error}') from error
    return True
