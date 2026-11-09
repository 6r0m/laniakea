# SPDX-License-Identifier: AGPL-3.0-or-later
"""The loopback server: what it serves, and what it refuses."""

import http.client
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
from urllib.parse import quote

from laniakea import LaniakeaError, cli, pipeline
from laniakea.server import DEFAULT_PORT, make_server
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace, read_json, write_json
from support import copy_sample, fake_engine, recorded_ubt


class Server(unittest.TestCase):
    def test_advertised_source_roots_belong_to_the_selected_immutable_run(self):
        from laniakea.server import target_index
        workspace = self.server.workspace_for_tests
        target = workspace.load('sample'); run = workspace.latest('sample')
        manifest = read_json(run / 'manifest.json')
        updated = {**manifest,'roots':{'sample-sdk':str(workspace.root / 'SyntheticSDK')}}
        with patch('laniakea.server.read_json',return_value=updated), \
             patch('laniakea.server.pipeline.freshness',return_value=(run,[])):
            advertised = target_index(workspace)[0]
        self.assertEqual(advertised['roots']['sample-sdk'],updated['roots']['sample-sdk'])
        self.assertEqual(advertised['roots']['project'],target['roots']['project'])

    def test_layout_post_acknowledges_without_echoing_the_growing_cache(self):
        status, body = self.post('/layout/sample/entry.json', {
            'layout': 'ack_probe', 'positions': {'module:SampleProject': {'x': 1, 'y': 2}}})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'saved': True})

    def test_pin_requests_reuse_allowed_ids_of_the_advertised_run(self):
        import laniakea.server as owner
        reads=[]
        original=owner.read_json
        def read(path):
            if Path(path).name=='graph.json':reads.append(path)
            return original(path)
        if hasattr(self.server,'layout_node_ids'):
            self.server.layout_node_ids.clear()
        with patch('laniakea.server.read_json',side_effect=read):
            self.assertEqual(self.get('/layout/sample/entry.json')[0],200)
            self.assertEqual(self.get('/layout/sample/entry.json')[0],200)
            self.assertEqual(self.post('/layout/sample/entry.json',{'layout':'cache_probe','positions':{}})[0],200)
        self.assertEqual(len(reads),0,'released drags must not parse the complete reference graph')

    def test_compact_map_and_paged_references_stay_on_the_advertised_run(self):
        _, data = self.get('/data/targets.json')
        [target] = json.loads(data)
        status, data = self.get(target['map_url'])
        self.assertEqual(status,200)
        topology = json.loads(data)
        self.assertEqual(topology['schema'],'laniakea.map/1')
        self.assertTrue(all(isinstance(r['source'],int) for r in topology['references']))
        refs, cursor = [], 0
        while True:
            status, data = self.get(target['references_url'] + f'?node=project&direction=incident&limit=3&cursor={cursor}')
            self.assertEqual(status,200)
            page = json.loads(data)
            refs += [item['reference'] for item in page['items']]
            cursor = page['next_cursor']
            if cursor is None:
                break
        workspace = self.server.workspace_for_tests
        advertised = workspace.target_dir('sample') / 'runs' / target['run']
        self.assertEqual(refs,read_json(advertised / 'graph.json')['edges'])
        self.assertEqual(self.get(target['references_url']+'?node=missing')[0],400)
        self.assertEqual(self.get(target['references_url']+'?node=project&source_tree=invalid')[0],400)
        self.assertEqual(self.get(target['map_url'].replace('topology.json','references.sqlite'))[0],404)
        before = self.get('/layout/sample/entry.json')
        status, body = self.post(target['references_url'], {'groups':[1], 'limit':3})
        self.assertEqual(status,200)
        self.assertTrue(json.loads(body)['items'])
        self.assertEqual(self.get('/layout/sample/entry.json'),before)
        self.assertEqual(self.post(target['references_url'],{'groups':[1]}, {'Origin':'https://foreign.example'})[0],403)
        for query in ({'node':'project','direction':[]},{'node':'project','cursor':2**64}):
            self.assertEqual(self.post(target['references_url'],query)[0],400)
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
        cls.server.workspace_for_tests = workspace
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

    def test_requests_stay_on_the_run_advertised_by_the_server(self):
        workspace = self.server.workspace_for_tests
        previous = workspace.latest("sample")
        partial = workspace.begin_run("sample")
        manifest = read_json(previous / "manifest.json")
        manifest["run"] = "replacement"
        write_json(partial / "manifest.json", manifest)
        workspace.commit_run("sample", partial)
        try:
            _, body = self.get("/data/sample/manifest.json")
            self.assertEqual(json.loads(body)["run"], self.server.index[0]["run"])
            self.assertEqual(self.get("/data/sample/scopes/entry.json")[0], 200)
        finally:
            write_json(workspace.target_dir("sample") / "latest.json", {"run": previous.name})

    def test_refuses_paths_outside_the_run_and_the_viewer(self):
        for path in ("/data/sample/../target.json", "/data/sample/%2E%2E/target.json", "/../laniakea/server.py",
                     "/data/other/manifest.json"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_refuses_a_foreign_host(self):
        self.assertEqual(self.get("/data/targets.json", host=f"evil.example:{self.port}")[0], 403)

    def test_a_second_server_cannot_take_a_port_in_use(self):
        with self.assertRaisesRegex(LaniakeaError, f"port {self.port} on 127.0.0.1 is in use"):
            make_server(self.server.workspace_for_tests, self.port).server_close()

    def test_the_default_port_is_stable(self):
        self.assertEqual(DEFAULT_PORT, 8737)
        self.assertEqual(cli.parser().parse_args(["serve"]).port, DEFAULT_PORT)

    def post(self, path, value, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        body = json.dumps(value)
        request_headers = {"Host": f"127.0.0.1:{self.port}", "Origin": f"http://127.0.0.1:{self.port}",
                           "Content-Type": "application/json", **(headers or {})}
        connection.request("POST", path, body=body, headers=request_headers)
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_layout_endpoint_saves_only_in_the_workspace(self):
        path = "/layout/sample/entry.json"
        point = {"module:SampleProject": {"x": 10, "y": -20}}
        status, _ = self.post(path, {"layout": "auto", "positions": point})
        self.assertEqual(status, 200)
        status, body = self.get(path)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["auto"], point)
        cache = self.server.workspace_for_tests.target_dir("sample") / "layouts" / "entry.json"
        self.assertTrue(cache.is_file())
        self.assertNotIn("layouts", read_json(self.server.workspace_for_tests.latest("sample") / "manifest.json"))

    def test_continuous_map_can_save_deep_nodes_in_the_entry_layout(self):
        path = "/layout/sample/entry.json"
        point = {"module:SampleCore": {"x": 75, "y": -30}}
        patch = {"layout": "universe_probe", "positions": point}
        self.assertEqual(self.post(path, patch)[0], 200)
        self.assertEqual(json.loads(self.get(path)[1])["universe_probe"], point)
        before = self.get(path)
        invalid = {"layout": "universe_probe", "positions": {**point, "other-target": {"x": 1, "y": 2}}}
        self.assertEqual(self.post(path, invalid)[0], 400)
        self.assertEqual(self.get(path), before)
        self.assertEqual(self.post(path, {"layout": "universe_probe", "positions": None})[0], 200)

    def test_layout_writes_refuse_foreign_origins_hosts_forms_and_unknown_nodes_without_mutation(self):
        path = "/layout/sample/entry.json"
        patch = {"layout": "auto", "positions": {"module:SampleProject": {"x": 10, "y": -20}}}
        before = self.get(path)
        for headers in ({"Origin": "https://foreign.example"}, {"Origin": "null"},
                        {"Host": f"foreign.example:{self.port}"}, {"Content-Type": "text/plain"}):
            with self.subTest(headers=headers):
                self.assertIn(self.post(path, patch, headers)[0], (403, 415))
                self.assertEqual(self.get(path), before)
        invalid = {"layout": "auto", "positions": {"missing": {"x": 1, "y": 2}}}
        self.assertEqual(self.post(path, invalid)[0], 400)
        self.assertEqual(self.get(path), before)

    def test_layout_endpoint_refuses_unknown_scopes_and_paths(self):
        for path in ("/layout/other/entry.json", "/layout/sample/index.json", "/layout/sample/missing.json",
                     "/layout/sample/%2E%2E/target.json", "/data/sample/manifest.json"):
            self.assertEqual(self.post(path, {"layout": "auto", "positions": {}})[0], 404, path)

    def test_layout_scope_must_be_a_basename_on_windows(self):
        shard = self.server.workspace_for_tests.latest("sample") / "scopes" / "entry.json"
        before = shard.read_bytes()
        for name in (str(shard), "INDEX.JSON", "..\\entry.json"):
            path = "/layout/sample/" + quote(name, safe="")
            self.assertEqual(self.post(path, {"layout": "auto", "positions": {}})[0], 404)
            self.assertEqual(shard.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
