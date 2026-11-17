# SPDX-License-Identifier: AGPL-3.0-or-later
"""An owned viewer stops gracefully without touching extraction state or unrelated listeners."""

import contextlib
import http.client
import io
import json
import tempfile
import threading
import time
import subprocess
import sys
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from laniakea import LaniakeaError,cli,pipeline,service,unreal
from laniakea.server import HOST,make_server
from laniakea.workspace import Workspace,read_json,write_json
from support import copy_sample,fake_engine,recorded_ubt


class ViewerLifecycle(unittest.TestCase):
    def test_unconfirmed_background_cleanup_is_not_reported_as_stopped_or_silently_restarted(self):
        from laniakea.monitor import Monitor
        server=make_server(self.workspace,scan=False)
        with patch('laniakea.monitor.Monitor') as monitor,patch.object(cli,'make_server',return_value=server), \
                patch.object(server,'serve_forever',side_effect=KeyboardInterrupt), \
                contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            monitor.return_value.stop.side_effect=TimeoutError('owned children not confirmed')
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'up','--watch','--no-browser']),2)
        self.assertEqual(read_json(self.workspace.root/'server.json')['state'],'failed')
        with self.assertRaisesRegex(LaniakeaError,'not confirmed'):service.stop(self.workspace,HOST)
        with self.assertRaisesRegex(LaniakeaError,'not confirmed'):
            with service.running(self.workspace):self.fail('uncertain cleanup must not be discarded')

    def test_down_cancels_owned_blocked_analysis_reaps_descendants_and_releases_writer(self):
        from laniakea.monitor import Monitor
        from laniakea.owned_process import Process,exited
        from laniakea.workspace import WriterBusy
        root=self.workspace.root/'tmp/blocked';root.mkdir(parents=True)
        marker=root/'descendant.json';started=threading.Event();children=[]
        descendant=f'import os,json,time;from pathlib import Path;Path({str(marker)!r}).write_text(json.dumps(os.getpid()));time.sleep(900)'
        program=f'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",{descendant!r}]);time.sleep(900)'
        class Blocked:
            def __init__(_self,*_args):
                _self.process=Process([sys.executable,'-c',program],root/'worker.log')
                children.append(_self.process.pid);started.set()
            def poll(_self):return None
            def close(_self):_self.process.close()
        foreign=subprocess.Popen([sys.executable,'-c','import time;time.sleep(900)'],creationflags=subprocess.CREATE_NO_WINDOW)
        self.addCleanup(lambda:(foreign.kill(),foreign.wait(timeout=3)))
        lease=service.running(self.workspace);owner=lease.__enter__();server=make_server(self.workspace,scan=False)
        monitor=Monitor(self.workspace,server.snapshots,task_factory=Blocked)
        monitor.activate('sample');monitor.states['sample']['phase']='stage';server.monitor=monitor;owner.ready(server)
        errors=[]
        def run():
            try:
                monitor.start();server.serve_forever(poll_interval=.05)
            except BaseException as error:errors.append(error)
            finally:
                monitor.stop();server.server_close();lease.__exit__(None,None,None)
        worker=threading.Thread(target=run,daemon=True);worker.start()
        try:
            self.assertTrue(started.wait(3))
            deadline=time.monotonic()+3
            while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(marker.exists());grandchild=read_json(marker)
            with self.assertRaises(WriterBusy):
                with self.workspace.extraction_lock('sample'):pass
            start=time.monotonic();self.assertTrue(service.stop(self.workspace,HOST));worker.join(timeout=1)
            self.assertLess(time.monotonic()-start,8);self.assertFalse(worker.is_alive());self.assertEqual(errors,[])
            self.assertTrue(exited(children[0]));self.assertTrue(exited(grandchild));self.assertIsNone(foreign.poll())
            with self.workspace.extraction_lock('sample'):pass
            self.assertEqual({p:p.read_bytes() for p in self.protected},self.protected)
        finally:
            if worker.is_alive():monitor.request_stop();server.shutdown();worker.join(timeout=8)

    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        root=Path(temporary.name);project=copy_sample(root);engine=fake_engine(root)
        self.workspace=Workspace(root/'workspace')
        target=self.workspace.register('sample',unreal.target_fields(project/'SampleProject.uproject',str(engine)))
        with recorded_ubt(project,engine):self.run,_=pipeline.extract(self.workspace,target)
        self.protected={p:p.read_bytes() for p in (self.workspace.target_dir('sample')/'latest.json',self.run/'manifest.json')}
        layout=self.workspace.target_dir('sample')/'layouts/entry.json';write_json(layout,{'version':1,'layouts':{}})
        self.protected[layout]=layout.read_bytes()

    def start(self):
        lease=service.running(self.workspace);owner=lease.__enter__()
        server=make_server(self.workspace);owner.ready(server)
        def run():
            try:server.serve_forever(poll_interval=.05)
            finally:server.server_close();lease.__exit__(None,None,None)
        worker=threading.Thread(target=run,daemon=True);worker.start()
        def cleanup():
            if worker.is_alive():server.shutdown();worker.join(timeout=5)
        self.addCleanup(cleanup)
        return server,worker,owner

    def request(self,server,method,path,body=None,headers=None):
        connection=http.client.HTTPConnection(HOST,server.server_address[1],timeout=3)
        connection.request(method,path,body,headers or {})
        response=connection.getresponse();data=response.read();connection.close()
        return response.status,data

    def test_authenticated_down_closes_owned_server_and_preserves_saved_maps(self):
        server,worker,_=self.start()
        self.assertEqual(self.request(server,'GET','/')[0],200)
        self.assertTrue(service.stop(self.workspace,HOST));worker.join(timeout=3)
        self.assertFalse(worker.is_alive());self.assertFalse((self.workspace.root/'server.json').exists())
        self.assertTrue(service.idle(self.workspace));self.assertFalse(service.stop(self.workspace,HOST))
        self.assertEqual({p:p.read_bytes() for p in self.protected},self.protected)

    def test_foreign_origin_and_wrong_tokens_cannot_stop_or_discover_the_instance(self):
        server,worker,owner=self.start();port=server.server_address[1]
        for token in ('','0'*64,'\xff'*64):
            self.assertEqual(self.request(server,'GET',service.INSTANCE,headers={service.HEADER:token})[0],403)
            self.assertEqual(self.request(server,'POST',service.STOP,b'{}',{
                'Origin':f'http://{HOST}:{port}','Content-Type':'application/json',service.HEADER:token})[0],403)
        self.assertEqual(self.request(server,'POST',service.STOP,b'{}',{
            'Origin':'https://foreign.example','Content-Type':'application/json',service.HEADER:owner.token})[0],403)
        self.assertTrue(worker.is_alive());self.assertEqual(self.request(server,'GET','/')[0],200)

    def test_repeated_up_refuses_before_preparing_another_server(self):
        self.start()
        with patch.object(cli,'make_server',side_effect=AssertionError('must not prepare a second viewer')), \
                contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'up','--no-browser']),2)

    def test_blocked_browser_launch_keeps_starting_state_until_the_serving_loop(self):
        entered=threading.Event();release=threading.Event();serving=threading.Event();results=[]
        server=make_server(self.workspace);serve=server.serve_forever
        def browser(_url):
            entered.set()
            if not release.wait(timeout=5):raise AssertionError('Browser launch was not released')
        def loop():
            serving.set();serve(poll_interval=.05)
        def run():
            try:results.append(cli.main(['--workspace',str(self.workspace.root),'up']))
            except BaseException as error:results.append(error)
        with patch.object(cli,'make_server',return_value=server),patch.object(cli.webbrowser,'open',side_effect=browser), \
                patch.object(server,'serve_forever',side_effect=loop),contextlib.redirect_stdout(io.StringIO()):
            worker=threading.Thread(target=run,daemon=True);worker.start()
            try:
                self.assertTrue(entered.wait(timeout=5))
                self.assertEqual(read_json(self.workspace.root/'server.json'),{'version':1,'state':'starting'})
                with patch.object(service.http.client,'HTTPConnection',side_effect=AssertionError('Starting viewer must not receive control requests')):
                    with self.assertRaisesRegex(LaniakeaError,'still preparing'):service.stop(self.workspace,HOST)
                release.set();self.assertTrue(serving.wait(timeout=5))
                self.assertEqual(self.request(server,'GET','/')[0],200)
                self.assertTrue(service.stop(self.workspace,HOST))
            finally:
                release.set()
                if serving.wait(timeout=5) and worker.is_alive():server.shutdown()
                worker.join(timeout=5);server.server_close()
        self.assertFalse(worker.is_alive());self.assertEqual(results,[0])
        self.assertFalse((self.workspace.root/'server.json').exists());self.assertTrue(service.idle(self.workspace))
        self.assertEqual({p:p.read_bytes() for p in self.protected},self.protected)

    def test_stale_state_never_sends_stop_to_a_foreign_port(self):
        posts=[]
        class Foreign(BaseHTTPRequestHandler):
            def log_message(self,*_args):pass
            def do_GET(self):self.send_error(404)
            def do_POST(self):posts.append(self.path);self.send_error(404)
        foreign=ThreadingHTTPServer((HOST,0),Foreign)
        threading.Thread(target=foreign.serve_forever,daemon=True).start()
        self.addCleanup(foreign.server_close);self.addCleanup(foreign.shutdown)
        record={'version':1,'state':'running','port':foreign.server_address[1],'token':'0'*64}
        write_json(self.workspace.root/'server.json',record)
        self.assertFalse(service.stop(self.workspace,HOST));self.assertEqual(posts,[])
        with service.running(self.workspace):
            write_json(self.workspace.root/'server.json',record)
            with self.assertRaisesRegex(LaniakeaError,'not the recorded'):service.stop(self.workspace,HOST)
            self.assertEqual(posts,[])

    def test_down_requires_the_authenticated_connection_to_remain_open(self):
        posts=[];token='0'*64
        class Closing(BaseHTTPRequestHandler):
            def log_message(self,*_args):pass
            def do_GET(self):
                body=json.dumps({'service':'laniakea/1','instance':token}).encode()
                self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            def do_POST(self):posts.append(self.path);self.send_error(404)
        foreign=ThreadingHTTPServer((HOST,0),Closing)
        threading.Thread(target=foreign.serve_forever,daemon=True).start()
        self.addCleanup(foreign.server_close);self.addCleanup(foreign.shutdown)
        with service.running(self.workspace):
            write_json(self.workspace.root/'server.json',{'version':1,'state':'running','port':foreign.server_address[1],'token':token})
            with self.assertRaisesRegex(LaniakeaError,'refusing to reconnect'):service.stop(self.workspace,HOST)
        self.assertEqual(posts,[])

    def test_startup_failure_and_starting_or_corrupt_state_are_observable(self):
        for data in ({'version':1,'state':'starting'},{'version':True},['broken']):
            with service.running(self.workspace):
                write_json(self.workspace.root/'server.json',data)
                with self.assertRaises(LaniakeaError):service.stop(self.workspace,HOST)
        with patch.object(cli,'make_server',side_effect=LaniakeaError('port occupied')), \
                contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'up','--no-browser']),2)
        self.assertFalse((self.workspace.root/'server.json').exists());self.assertTrue(service.idle(self.workspace))

    def test_empty_workspace_up_requests_build_without_starting_analysis(self):
        with patch.object(cli.pipeline,'extract',side_effect=AssertionError('up must not analyse')), \
                contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()) as error:
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root/'empty'),'up','--no-browser']),2)
        self.assertIn('python laniakea.py build',error.getvalue())

    def test_cancelled_viewer_preparation_releases_ownership_without_changing_saved_maps(self):
        with patch.object(cli,'make_server',side_effect=KeyboardInterrupt),contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'up','--no-browser']),130)
        self.assertFalse((self.workspace.root/'server.json').exists());self.assertTrue(service.idle(self.workspace))
        self.assertEqual({p:p.read_bytes() for p in self.protected},self.protected)


if __name__=='__main__':unittest.main()
