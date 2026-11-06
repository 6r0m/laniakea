# SPDX-License-Identifier: AGPL-3.0-or-later
"""The loopback file server: the viewer, plus each target's last good run.

It binds 127.0.0.1 only and answers only requests addressed to that host, so a web page cannot reach it through a
rebound DNS name. Only validated user positions can be written, in the ignored workspace. Freshness is computed
once at start.
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

from . import LaniakeaError, map_index, pipeline
from .layouts import LayoutStore
from .workspace import read_json

VIEWER = Path(__file__).resolve().parent.parent / "viewer"
HOST = "127.0.0.1"
# Stable, so bookmarks and links keep working. Chosen clear of every port the maintainer's other stacks declare or
# listen on, and of the ranges Windows reserves.
DEFAULT_PORT = 8737
_TYPES = {".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".html": "text/html"}


def target_index(workspace):
    """What the viewer needs to pick a target. Absolute roots stay on this machine: they build source links."""
    index = []
    for target in workspace.targets():
        run, changed = pipeline.freshness(workspace, target)
        if run is None:
            continue
        index.append({
            "id": target["id"],
            "project": Path(target["project_file"]).stem,
            "run": run.name,
            "roots": target.get("roots", {}),
            "stale": bool(changed),
            "changed": changed[:20],
            "changed_count": len(changed),
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
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

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
        index = self.server.views.get(target)
        return (index,name) if index is not None and key==index.root.name else None

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
            # The advertised run is immutable for this server's lifetime.
            with self.server.layout_ids_lock:
                if run not in self.server.layout_node_ids:
                    self.server.layout_node_ids[run] = self.server.views[target].node_ids()
                allowed = self.server.layout_node_ids[run]
        else:
            allowed = {node["id"] for node in read_json(shard)["nodes"]}
        return target, scope, allowed

    def do_POST(self):
        if not self._local() or self.headers.get("Origin") != f"http://{self.headers.get('Host')}":
            return self._send(403, b"forbidden origin or host\n")
        try:
            path = unquote(urlsplit(self.path).path)
            if path.startswith('/map/'):
                view = self._view(path)
                if view is None or view[1]!='references':
                    return self._send(404,b'not found\n')
                if self.headers.get('Content-Type','').split(';',1)[0]!='application/json':
                    return self._send(415,b'expected application/json\n')
                length = self.headers.get('Content-Length','')
                if not length.isdecimal() or not 0<int(length)<=1048576 or self.headers.get('Transfer-Encoding'):
                    return self._send(413,b'expected a reference query no larger than 1 MiB\n')
                try:
                    return self._references(view[0],json.loads(self.rfile.read(int(length))))
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
                patch = json.loads(self.rfile.read(int(length)))
                self.server.layouts.update(*scope[:2], patch, scope[2])
            except (ValueError, UnicodeError) as error:
                return self._send(400, str(error).encode())
            self._send(200, b'{"saved":true}', "application/json")
        except (OSError, LaniakeaError) as error:
            self._send(500, str(error).encode())

    def do_GET(self):
        if not self._local():
            return self._send(403, b"forbidden host\n")
        path = unquote(urlsplit(self.path).path)
        if path.startswith('/map/'):
            view = self._view(path)
            if view is None:
                return self._send(404, b'not found\n')
            index,name = view
            if name == 'topology.json':
                return self._file(index.root / name, index.root)
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


def make_server(workspace, port=0):
    """A bound server that has not started serving; port 0 picks a free port."""
    index = target_index(workspace)
    views = {}
    for entry in index:
        run = workspace.target_dir(entry['id']) / 'runs' / entry['run']
        view = map_index.ensure(workspace, entry['id'], run)
        views[entry['id']] = view
        base = f"/map/{entry['id']}/{view.root.name}"
        entry.update(map_url=base+'/topology.json', references_url=base+'/references')
    try:
        server = _Server((HOST, port), partial(Handler, workspace=workspace, index=index))
    except OSError as error:
        raise LaniakeaError(f"port {port} on {HOST} is in use or reserved ({error.strerror}); stop the other server, "
                            "or pass --port <n> (0 picks a free one)") from error
    server.index = index
    server.views = views
    server.layouts = LayoutStore(workspace)
    server.layout_node_ids = {}
    server.layout_ids_lock = threading.Lock()
    return server
