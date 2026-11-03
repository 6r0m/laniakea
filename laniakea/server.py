# SPDX-License-Identifier: AGPL-3.0-or-later
"""The loopback file server: the viewer, plus each target's last good run.

It binds 127.0.0.1 only and answers only requests addressed to that host, so a web page cannot reach it through a
rebound DNS name. Nothing is written; freshness is computed once at start.
"""

import json
import mimetypes
import os
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from . import pipeline

VIEWER = Path(__file__).resolve().parent.parent / "viewer"
HOST = "127.0.0.1"
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

    def do_GET(self):
        port = self.server.server_address[1]
        if self.headers.get("Host") not in (f"{HOST}:{port}", f"localhost:{port}"):
            return self._send(403, b"forbidden host\n")
        path = unquote(urlsplit(self.path).path)
        if path == "/data/targets.json":
            return self._send(200, json.dumps(self.index).encode(), "application/json")
        if path.startswith("/data/"):
            target_id, _, rest = path[len("/data/"):].partition("/")
            run = next((self.workspace.latest(t["id"]) for t in self.index if t["id"] == target_id), None)
            if run is None or not rest:
                return self._send(404, b"not found\n")
            return self._file(run / rest, run)
        return self._file(VIEWER / (path.lstrip("/") or "index.html"), VIEWER)


def make_server(workspace, port=0):
    """A bound server that has not started serving; port 0 picks a free port."""
    index = target_index(workspace)
    server = ThreadingHTTPServer((HOST, port), partial(Handler, workspace=workspace, index=index))
    server.index = index
    return server
