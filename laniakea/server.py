# SPDX-License-Identifier: AGPL-3.0-or-later
"""The loopback file server: the viewer, plus each target's last good run.

It binds 127.0.0.1 only and answers only requests addressed to that host, so a web page cannot reach it through a
rebound DNS name. Validated positions and review decisions are written only in the ignored workspace. Source scanning is
explicit; generation-bound contexts keep old reads stable when new runs are published.
"""

import json
import mimetypes
import os
import socket
import threading
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from . import LaniakeaError, map_index, pipeline, service
from .layouts import LayoutStore
from .review_store import Review, Conflict
from .workspace import read_json
from .snapshots import Snapshots

VIEWER = Path(__file__).resolve().parent.parent / "viewer"
HOST = "127.0.0.1"
# Stable, so bookmarks and links keep working. Chosen clear of every port the maintainer's other stacks declare or
# listen on, and of the ranges Windows reserves.
DEFAULT_PORT = 8737
_TYPES = {".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".html": "text/html"}


def target_index(workspace, *, scan=True):
    """What the viewer needs to pick a target. Absolute roots stay on this machine: they build source links."""
    index = []
    for target in workspace.targets():
        run, changed = pipeline.freshness(workspace, target) if scan else (workspace.latest(target['id']),[])
        if run is None:
            continue
        request=workspace.request_at(target['id'],run)
        settings=request['target'] if request is not None else target
        manifest=read_json(run/'manifest.json')
        from . import profiles
        describe=getattr(profiles.get(manifest['profile']),'analysis_metadata',None)
        index.append({
            "id": target["id"],
            "project": Path(target["project_file"]).stem,
            "run": run.name,
            "roots": {**settings.get("roots", {}), **manifest.get('roots', {})},
            "acquisition": manifest['coverage'].get('acquisition',{}),
            "stale": bool(changed),
            "changed": changed[:20],
            "changed_count": len(changed),
            "freshness": "checked" if scan else "unknown",
            **(describe(manifest,request) if describe else {}),
        })
    return index


def _inside(path, root):
    path, root = os.path.normcase(os.path.realpath(path)), os.path.normcase(os.path.realpath(root))
    return path.startswith(root.rstrip("\\/") + os.sep)


class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, workspace, index, **kwargs):
        self.workspace, self.index = workspace, index
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        pass

    def _send(self, status, body, content_type="text/plain; charset=utf-8"):
        # Windows may reset a closing socket with unread POST data before its refusal reaches the client.
        # Drain only a bounded, declared body; a slow or incomplete sender cannot hold a refusal open.
        if status>=400 and self.command=='POST' and not getattr(self,'_body_consumed',False):
            length=self.headers.get('Content-Length','')
            if length.isdecimal() and int(length)<=1048576 and not self.headers.get('Transfer-Encoding'):
                timeout=self.connection.gettimeout()
                try:
                    self.connection.settimeout(0.25)
                    self._body(int(length))
                except OSError:
                    body+=b'\nRequest body was incomplete; connection closed.\n'
                finally:
                    self.connection.settimeout(timeout)
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            # A cancelled page cannot receive another error response; context leases still close in dispatch.
            self.close_connection=True
            return False
        return True

    def _body(self, length):
        self._body_consumed=True
        return self.rfile.read(length)

    def _file(self, path, root):
        if not _inside(path, root) or not Path(path).is_file():
            return self._send(404, b"not found\n")
        kind = _TYPES.get(Path(path).suffix) or mimetypes.guess_type(path)[0] or "application/octet-stream"
        self._send(200, Path(path).read_bytes(), kind)

    def _local(self):
        port = self.server.server_address[1]
        return self.headers.get("Host") in (f"{HOST}:{port}", f"localhost:{port}")

    def _view(self, path):
        parts = path[len('/map/'):].split('/') if path.startswith('/map/') else []
        if len(parts)!=3:
            return None
        target,key,name = parts
        context=getattr(self,'context',None)
        index = context.view if context else self.server.views.get(target)
        return (index,name) if index is not None and key==index.root.name else None

    def _review(self,target):
        context=getattr(self,'context',None)
        return context.review if context else self.server.reviews[target]

    def _dispatch(self,method):
        if not self._local() or self.command=='POST' and self.headers.get('Origin')!=f"http://{self.headers.get('Host')}":
            return self._send(403,b'forbidden origin or host\n')
        original=self.path;index=self.index
        parsed=urlsplit(original)
        with self.server.snapshots.route(unquote(parsed.path)) as (context,path):
            if context is False:return self._send(410,b'snapshot expired; reopen the ready map\n')
            self.context=context
            if context:
                self.index=[context.entry]
                self.path=path+('?' + parsed.query if parsed.query else '')
            try:return method()
            finally:self.path=original;self.index=index;self.context=None

    def do_POST(self):return self._dispatch(self._POST)
    def do_GET(self):return self._dispatch(self._GET)

    def _references(self, index, query):
        allowed = {'node','direction','source','target','source_tree','target_tree','group','groups','types','cursor','limit','boundary'}
        if not isinstance(query,dict) or set(query)-allowed:
            raise ValueError('unknown reference query field')
        for flag in ('source_tree','target_tree','boundary'):
            if flag in query and type(query[flag]) is not bool:
                raise ValueError('invalid reference query flag')
        data = index.references(query)
        return self._send(200,json.dumps(data,separators=(',',':')).encode(),'application/json')

    def _layout_scope(self, path):
        if not path.startswith("/layout/"):
            return None
        parts = path[len("/layout/"):].split("/")
        if len(parts) != 2:
            return None
        target, scope = parts
        if scope != Path(scope).name or not scope.endswith(".json") or scope.casefold() == "index.json":
            return None
        run = next((self.workspace.target_dir(t["id"]) / "runs" / t["run"]
                    for t in self.index if t["id"] == target), None)
        if run is None:
            return None
        shard = run / "scopes" / scope
        if not _inside(shard, run / "scopes") or not shard.is_file():
            return None
        manifest = read_json(run / "manifest.json")
        if scope == manifest["entry"]:
            context=getattr(self,'context',None)
            if context:
                with context.lock:
                    if context.node_ids is None:context.node_ids=context.view.node_ids()
                    allowed=context.node_ids
            else:
                with self.server.layout_ids_lock:
                    if run not in self.server.layout_node_ids:self.server.layout_node_ids[run]=self.server.views[target].node_ids()
                    allowed = self.server.layout_node_ids[run]
        else:
            allowed = {node["id"] for node in read_json(shard)["nodes"]}
        return target, scope, allowed

    def _POST(self):
        if not self._local() or self.headers.get("Origin") != f"http://{self.headers.get('Host')}":
            return self._send(403, b"forbidden origin or host\n")
        try:
            path = unquote(urlsplit(self.path).path)
            if path==service.STOP:return service.control(self,stop=True)
            if path=='/monitor/control':
                from .monitor import ChecksConflict
                monitor=getattr(self.server,'monitor',None)
                if monitor is None:return self._send(409,b'monitoring is off; restart with --watch\n')
                if self.headers.get('Content-Type','').split(';',1)[0]!='application/json':
                    return self._send(415,b'expected application/json\n')
                length=self.headers.get('Content-Length','')
                if not length.isdecimal() or not 0<int(length)<=4096 or self.headers.get('Transfer-Encoding'):
                    return self._send(413,b'expected bounded monitor control\n')
                try:
                    body=json.loads(self._body(int(length)))
                    if not isinstance(body,dict) or body.get('action') not in {'activate','pause','retry','checks'} or \
                            set(body)!=({'action','target','checks','run','revision'} if body['action']=='checks' else {'action','target'}) or \
                            not isinstance(body['target'],str) or not any(e['id']==body['target'] for e in self.server.index):
                        raise ValueError('invalid monitor control')
                    if body['action']=='checks':monitor.configure(body['target'],body['checks'],body['run'],body['revision'])
                    else:getattr(monitor,body['action'])(body['target'])
                except ChecksConflict as error:return self._send(409,str(error).encode())
                except (ValueError,UnicodeError) as error:return self._send(400,str(error).encode())
                return self._send(200,json.dumps(monitor.status()).encode(),'application/json')
            if path.startswith('/map/'):
                view = self._view(path)
                if view is None or view[1] not in {'references','review'}:
                    return self._send(404,b'not found\n')
                if self.headers.get('Content-Type','').split(';',1)[0]!='application/json':
                    return self._send(415,b'expected application/json\n')
                length = self.headers.get('Content-Length','')
                if not length.isdecimal() or not 0<int(length)<=1048576 or self.headers.get('Transfer-Encoding'):
                    return self._send(413,b'expected a reference query no larger than 1 MiB\n')
                try:
                    body=json.loads(self._body(int(length)))
                    if view[1]=='review':
                        owner=self._review(path.split('/')[2])
                        data=owner.update(body)
                        return self._send(200,json.dumps(data).encode(),'application/json')
                    return self._references(view[0],body)
                except Conflict as error:
                    return self._send(409,str(error).encode())
                except (ValueError,UnicodeError) as error:
                    return self._send(400,str(error).encode())
            scope = self._layout_scope(unquote(urlsplit(self.path).path))
            if scope is None:
                return self._send(404, b"not found\n")
            if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
                return self._send(415, b"expected application/json\n")
            length = self.headers.get("Content-Length", "")
            if not length.isdecimal() or not 0 < int(length) <= 131072 or self.headers.get("Transfer-Encoding"):
                return self._send(413, b"expected a JSON body no larger than 128 KiB\n")
            try:
                patch = json.loads(self._body(int(length)))
                self.server.layouts.update(*scope[:2], patch, scope[2])
            except (ValueError, UnicodeError) as error:
                return self._send(400, str(error).encode())
            self._send(200, b'{"saved":true}', "application/json")
        except (OSError, LaniakeaError) as error:
            self._send(500, str(error).encode())

    def _GET(self):
        if not self._local():
            return self._send(403, b"forbidden host\n")
        path = unquote(urlsplit(self.path).path)
        if path==service.INSTANCE:return service.control(self)
        if path=='/data/startup.json':
            return self._send(200,json.dumps({'target':self.server.launch_target,
                               'monitoring':getattr(self.server,'monitor',None) is not None}).encode(),'application/json')
        if path=='/monitor/status':
            query=parse_qs(urlsplit(self.path).query,keep_blank_values=True)
            if query and (set(query)!={'target','run','client','index'} or any(len(values)!=1 for values in query.values()) or
                    not 1<=len(query['client'][0])<=64 or any(c not in
                    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in query['client'][0])):
                return self._send(400,b'expected one target, run, index and bounded browser identifier\n')
            retained=self.server.snapshots.touch(query['target'][0],query['run'][0],query['client'][0],query['index'][0]) if query else None
            monitor=getattr(self.server,'monitor',None)
            data=monitor.status() if monitor else {'targets':[{'id':e['id'],'active':False,'state':'saved',
                  'ready':self.server.snapshots.latest(e['id'])} for e in self.server.index]}
            return self._send(200,json.dumps({**data,'context_retained':retained}).encode(),'application/json')
        if path.startswith('/map/'):
            view = self._view(path)
            if view is None:
                return self._send(404, b'not found\n')
            index,name = view
            if name == 'topology.json':
                return self._file(index.root / name, index.root)
            if name == 'review':
                try:
                    query=parse_qs(urlsplit(self.path).query,keep_blank_values=True)
                    if any(len(v)!=1 for v in query.values()):
                        raise ValueError('repeated review query')
                    query={k:v[0] for k,v in query.items()}
                    for key in ('cursor','limit'):
                        if key in query:
                            if not query[key].isdecimal():
                                raise ValueError('invalid review cursor or limit')
                            query[key]=int(query[key])
                    for flag in ('ack','evidence'):
                        if flag in query:
                            if query[flag] not in {'true','false'}:
                                raise ValueError('invalid review flag')
                            query[flag]=query[flag]=='true'
                    data=self._review(path.split('/')[2]).page(query)
                    return self._send(200,json.dumps(data,separators=(',',':')).encode(),'application/json')
                except Conflict as error:
                    return self._send(409,str(error).encode())
                except (ValueError,UnicodeError) as error:
                    return self._send(400,str(error).encode())
                except (OSError,LaniakeaError) as error:
                    return self._send(500,str(error).encode())
            if name != 'references':
                return self._send(404, b'not found\n')
            try:
                values = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
                if any(len(v)!=1 for v in values.values()):
                    raise ValueError('unknown or repeated reference query field')
                query = {k:v[0] for k,v in values.items()}
                for flag in ('source_tree','target_tree','boundary'):
                    if flag in query:
                        if query[flag] not in {'true','false'}:
                            raise ValueError('invalid reference query flag')
                        query[flag] = query[flag]=='true'
                for field in ('types','groups'):
                    if field in query:
                        query[field] = json.loads(query[field])
                return self._references(index,query)
            except ValueError as error:
                return self._send(400, str(error).encode())
            except (OSError, LaniakeaError) as error:
                return self._send(500, str(error).encode())
        if path.startswith("/layout/"):
            try:
                scope = self._layout_scope(path)
                if scope is None:
                    return self._send(404, b"not found\n")
                data = self.server.layouts.read(*scope)
                return self._send(200, json.dumps(data).encode(), "application/json")
            except (OSError, LaniakeaError) as error:
                return self._send(500, str(error).encode())
        if path == "/data/targets.json":
            return self._send(200, json.dumps(self.index).encode(), "application/json")
        if path.startswith("/data/"):
            target_id, _, rest = path[len("/data/"):].partition("/")
            # The index, manifest and shards must describe one extraction even if latest.json moves mid-session.
            run = next((self.workspace.target_dir(t["id"]) / "runs" / t["run"]
                        for t in self.index if t["id"] == target_id), None)
            if run is None or not rest:
                return self._send(404, b"not found\n")
            return self._file(run / rest, run)
        return self._file(VIEWER / (path.lstrip("/") or "index.html"), VIEWER)


class _Server(ThreadingHTTPServer):
    # The base class sets SO_REUSEADDR, which on Windows lets a second server bind a port already in use, so two
    # servers would share one port. Bind exclusively instead.
    allow_reuse_address = False

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_server(workspace, port=0, *, scan=True, launch_target=None):
    """A bound server that has not started serving; port 0 picks a free port."""
    index = target_index(workspace,scan=scan)
    views = {}
    for entry in index:
        run = workspace.target_dir(entry['id']) / 'runs' / entry['run']
        view = map_index.ensure(workspace, entry['id'], run)
        views[entry['id']] = view
        base = f"/map/{entry['id']}/{view.root.name}"
        entry.update(map_url=base+'/topology.json',map_identity=view.root.name,
                     references_url=base+'/references',review_url=base+'/review')
    try:
        server = _Server((HOST, port), partial(Handler, workspace=workspace, index=index))
    except OSError as error:
        raise LaniakeaError(f"port {port} on {HOST} is in use or reserved ({error.strerror}); stop the other server, "
                            "or pass --port <n> (0 picks a free one)") from error
    server.index = index
    server.views = views
    server.snapshots=Snapshots(workspace,index,views)
    server.reviews={entry['id']:server.snapshots.contexts[entry['id'],entry['run'],entry['map_identity']].review for entry in index}
    server.launch_target=launch_target
    server.layouts = LayoutStore(workspace)
    server.layout_node_ids = {}
    server.layout_ids_lock = threading.Lock()
    return server
