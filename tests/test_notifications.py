# SPDX-License-Identifier: AGPL-3.0-or-later
"""Notification decoding and actual Windows atomic-save delivery."""

from pathlib import Path
import struct
import os
import tempfile
import threading
import time
import unittest

from laniakea.notifications import Notifications,names


class NotificationsTests(unittest.TestCase):
    def test_replaced_directory_is_not_delayed_by_the_old_directory_refusal_budget(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'Source';source.mkdir();seen=[];event=threading.Event()
            def receive(spec,batch,failure):
                seen.extend((spec,name) for name in batch);event.set()
            watcher=Notifications(receive)
            def specification():
                stat=source.stat();return (source,True,(stat.st_dev,stat.st_ino))
            try:
                watcher.replace([specification()])
                deadline=time.monotonic()+2
                while not seen and time.monotonic()<deadline:
                    (source/'Warmup.h').write_text('first');event.wait(.02)
                self.assertTrue(seen)
                spec=(os.path.normcase(str(source)),True)
                watcher._refuse(spec,'injected old-root refusal')
                source.rename(root/'OldSource');source.mkdir();watcher.replace([specification()])
                deadline=time.monotonic()+2
                while not any(name=='Replacement.h' for _,name in seen) and time.monotonic()<deadline:
                    event.clear();(source/'Replacement.h').write_text('new');event.wait(.02)
                self.assertTrue(any(name=='Replacement.h' for _,name in seen),'new root inherited old refusal delay')
            finally:watcher.stop()

    def test_malformed_batches_require_reconciliation(self):
        raw='API.h'.encode('utf-16-le')
        self.assertEqual(names(struct.pack('<III',0,1,len(raw))+raw),['API.h'])
        for bad in (b'',struct.pack('<III',4,1,len(raw))+raw,
                    struct.pack('<III',0,1,100)+raw,struct.pack('<III',0,1,2)+b'\x00\x00'):
            with self.assertRaises((ValueError,UnicodeError)):names(bad)

    def test_atomic_save_rename_and_root_replacement_are_observable_and_stop_reaps_io(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'Source';source.mkdir();ready=threading.Event();seen=[]
            def event(spec,batch,failure):
                seen.extend(batch);ready.set()
            watcher=Notifications(event)
            try:
                watcher.replace([(root,False),(source,True),(source,True)])
                # Replacement synchronizes through the completion port; retry writes only until admission is observed.
                for _ in range(20):
                    (source/'API.tmp').write_text('first')
                    if ready.wait(.05):break
                self.assertTrue(ready.is_set())
                ready.clear();(source/'API.tmp').replace(source/'API.h')
                self.assertTrue(ready.wait(2));ready.clear()
                source.rename(root/'OldSource');source.mkdir()
                self.assertTrue(ready.wait(2))
                self.assertTrue(any('API' in name for name in seen))
            finally:watcher.stop()
            self.assertFalse(watcher.thread.is_alive());self.assertIsNone(watcher.error)


if __name__=='__main__':unittest.main()
