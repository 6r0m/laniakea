# SPDX-License-Identifier: AGPL-3.0-or-later
"""The loopback server: what it serves, and what it refuses."""

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from laniakea import pipeline
from laniakea.server import make_server
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace
from support import copy_sample, fake_engine, recorded_ubt


class Server(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        base = Path(cls.temporary.name)
        project, engine_root = copy_sample(base), fake_engine(base)
        workspace = Workspace(base / "workspace")
        target = workspace.register("sample", target_fields(project / "SampleProject.uproject", str(engine_root)))
        with recorded_ubt(project, engine_root):
            pipeline.extract(workspace, target)
        (project / "Source/SampleProject/SampleProject.Build.cs").write_text("// edited\n", encoding="utf-8")
        cls.server = make_server(workspace)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temporary.cleanup()

    def get(self, path, host=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request("GET", path, headers={"Host": host or f"127.0.0.1:{self.port}"})
        response = connection.getresponse()
        body = response.read()
        connection.close()
        return response.status, body

    def test_binds_loopback_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_target_index_reports_a_stale_run(self):
        status, body = self.get("/data/targets.json")
        self.assertEqual(status, 200)
        [entry] = json.loads(body)
        self.assertEqual((entry["id"], entry["stale"]), ("sample", True))
        self.assertEqual(entry["changed"], ["Source/SampleProject/SampleProject.Build.cs"])
        self.assertIn("project", entry["roots"])

    def test_serves_the_latest_run_and_the_viewer(self):
        self.assertEqual(self.get("/data/sample/scopes/entry.json")[0], 200)
        self.assertEqual(self.get("/data/sample/manifest.json")[0], 200)
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"cytoscape.min.js", body)

    def test_refuses_paths_outside_the_run_and_the_viewer(self):
        for path in ("/data/sample/../target.json", "/data/sample/%2E%2E/target.json", "/../laniakea/server.py",
                     "/data/other/manifest.json"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_refuses_a_foreign_host(self):
        self.assertEqual(self.get("/data/targets.json", host=f"evil.example:{self.port}")[0], 403)


if __name__ == "__main__":
    unittest.main()
