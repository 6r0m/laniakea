# SPDX-License-Identifier: AGPL-3.0-or-later
"""Real Windows ownership, including controller death and unrelated-process survival."""

import json
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from pathlib import Path

from support import ROOT


class OwnedProcess(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)

    def ready(self,path,timeout=4):
        deadline=time.monotonic()+timeout
        while not path.exists():
            if time.monotonic()>=deadline:self.fail('owned child did not become ready')
            time.sleep(.02)
        return json.loads(path.read_text())

    def test_assignment_and_handle_exclusion_precede_execution_and_cancel_reaps_descendants(self):
        from laniakea.owned_process import Process
        marker=self.root/'child.json';grand=self.root/'grand.json'
        grand_program=f"import json,os,time;from pathlib import Path;Path({str(grand)!r}).write_text(json.dumps(os.getpid()));time.sleep(90)"
        program=("import json,os,subprocess,sys,time;from pathlib import Path;"
                 f"subprocess.Popen([sys.executable,'-c',{grand_program!r}]);"
                 f"Path({str(marker)!r}).write_text(json.dumps(os.getpid()));time.sleep(90)")
        with Process([sys.executable,'-c',program],self.root/'child.log',cwd=ROOT) as child:
            self.assertTrue(child.contains(child.handle))
            self.assertEqual(self.ready(marker),child.pid);self.ready(grand)
            started=time.monotonic();child.cancel()
            self.assertLess(time.monotonic()-started,5)
            self.assertEqual(child.active(),0)

    def test_controller_death_closes_last_job_handle_without_killing_a_foreign_process(self):
        from laniakea.owned_process import exited
        marker=self.root/'worker.json'
        program=("import sys,time,json;from pathlib import Path;from laniakea.owned_process import Process;"
                 f"p=Process([sys.executable,'-c','import time;time.sleep(90)'],Path({str(self.root/'worker.log')!r}));"
                 f"Path({str(marker)!r}).write_text(json.dumps(p.pid));time.sleep(90)")
        foreign=subprocess.Popen([sys.executable,'-c','import time;time.sleep(90)'],creationflags=subprocess.CREATE_NO_WINDOW)
        controller=subprocess.Popen([sys.executable,'-c',program],cwd=ROOT,creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            pid=self.ready(marker);controller.kill();controller.wait(timeout=3)
            deadline=time.monotonic()+4
            while not exited(pid) and time.monotonic()<deadline:time.sleep(.02)
            self.assertTrue(exited(pid));self.assertIsNone(foreign.poll())
        finally:
            if controller.poll() is None:controller.kill();controller.wait(timeout=3)
            foreign.kill();foreign.wait(timeout=3)

    def test_ordinary_uncontained_process_is_rejected_by_the_same_membership_check(self):
        from laniakea.owned_process import Process
        foreign=subprocess.Popen([sys.executable,'-c','import time;time.sleep(90)'],creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            with Process([sys.executable,'-c','pass'],self.root/'probe.log') as child:
                self.assertFalse(child.contains(foreign._handle))
                self.assertEqual(child.wait(3),0)
        finally:foreign.kill();foreign.wait(timeout=3)

    def test_missing_admission_is_rejected_before_first_instruction_without_a_suspended_orphan(self):
        from laniakea import owned_process as owned
        marker=self.root/'executed.json';created=[]
        update,create=owned.update,owned.create
        def skip_assignment(*args):return True if args[2]==0x2000D else update(*args)
        def record(*args):
            result=create(*args)
            if result:created.append(args[-1]._obj.pid)
            return result
        with patch.object(owned,'update',side_effect=skip_assignment),patch.object(owned,'create',side_effect=record), \
                patch.object(owned,'resume',side_effect=AssertionError('uncontained code must never start')):
            with self.assertRaisesRegex(Exception,'not contained'):
                owned.Process([sys.executable,'-c',f'from pathlib import Path;Path({str(marker)!r}).write_text("1")'],
                              self.root/'rejected.log')
        self.assertFalse(marker.exists());self.assertEqual(len(created),1)
        self.assertTrue(owned.exited(created[0]))


if __name__=='__main__':unittest.main()
