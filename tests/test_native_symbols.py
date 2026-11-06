# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native semantic regressions on synthetic sources, never an analysed project's data."""

import json
import os
import tempfile
import unittest
import subprocess
import shutil
from pathlib import Path
from unittest.mock import patch

from laniakea import LaniakeaError, schema, shards
from laniakea.unreal import compiler, graph, native_index, symbols, ubt


class CompilerBoundary(unittest.TestCase):
    def test_generated_references_keep_native_module_ownership_without_generated_stars(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / "Sample.uproject"
            project.write_text('{"Modules":[{"Name":"Sample"}]}')
            source = root / "Source/Sample"
            generated = root / "Intermediate/Inc/Sample/UHT"
            exported={"Modules":{"Sample":{"Directory":str(source),"Rules":str(source / "Sample.Build.cs")}}}
            built,_=graph.build(project,root / "engine",exported)
            fact={"usr":"generated","name":"SampleGenerated","level":"function","signature":"SampleGenerated()",
                  "file":str(generated / "Sample.gen.cpp"),"line":1,"column":1,"parent":None,"scope":"","definition":True}
            ref={"source":"generated","target":"generated","role":4,"file":str(source / "Sample.cpp"),
                 "line":2,"column":1,"implicit":False,"call_confirmed":False,"unevaluated":False}
            batch={"symbols":[fact],"references":[ref],"relations":[],"diagnostics":[]}
            batch['symbols'].append({**fact,'usr':'generated-base','name':'SampleGeneratedBase'})
            batch['relations'].append({'source':'generated','target':'generated-base','type':'overrides'})
            result,unknown=symbols.merge(built,[batch],project,root,root / "engine",exported,{str(generated):"Sample"})
            self.assertEqual(unknown,{"source":0,"target":0})
            self.assertEqual(len(result["edges"]),2)
            self.assertEqual((result["edges"][0]["source"],result["edges"][0]["target"]),("module:Sample","module:Sample"))
            self.assertTrue(all(e.get("internal_to_owner") for e in result["edges"]), "abstracted references are internal facts, not self-dependencies")
            self.assertFalse(any(n["level"]=="function" for n in result["nodes"]))

    def test_ownership_lookup_indexes_module_directories_instead_of_scanning_each_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            node = {"id":"project","label":"Sample","level":"project","parent":None,"boundary":False,"status":"in-target"}
            modules = {f"Sample{n}":{"Directory":str(root / f"Source/Module{n}")} for n in range(1000)}
            built = {"schema":"laniakea.graph/1","nodes":[node,*[
                {**node,"id":"module:"+name,"label":name,"level":"module","parent":"project"} for name in modules]],"edges":[]}
            facts = [{"usr":str(n),"name":f"SampleType{n}","level":"class","signature":f"SampleType{n}",
                      "parent":None,"scope":"","file":str(root / f"Source/Module999/Types{n}.h"),
                      "line":1,"column":1,"definition":True} for n in range(100)]
            with patch("laniakea.unreal.symbols.graph._relative",wraps=graph._relative) as relative:
                result,_=symbols.merge(built,[{"symbols":facts,"references":[],"relations":[],"diagnostics":[]}],
                                       root / "Sample.uproject",root,root / "engine",{"Modules":modules})
                self.assertLessEqual(relative.call_count,300,"ownership must not scan every module for each native file")
            self.assertTrue(all(n["parent"]=="module:Sample999" for n in result["nodes"] if n["level"]=="class"))

    def test_native_template_parameter_spelling_does_not_split_a_canonical_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / "Sample.uproject"
            project.write_text('{"Modules":[{"Name":"Sample"}]}')
            directory = root / "Source/Sample"
            directory.mkdir(parents=True)
            exported = {"Modules": {"Sample": {"Directory": str(directory), "Rules": str(directory / "Sample.Build.cs")}}}
            built, _ = graph.build(project, root / "engine", exported)
            cls = {"usr":"class", "name":"SampleBox", "level":"class", "signature":"SampleBox<T>",
                   "parent":None, "scope":"", "file":str(directory / "Types.h"), "line":1, "column":1, "definition":True}
            ctor = {**cls, "usr":"constructor", "name":"SampleBox<T>", "level":"function", "parent":"class", "line":2}
            first = {"symbols":[cls,ctor],"references":[],"relations":[],"diagnostics":[]}
            second = {**first,"symbols":[{**ctor,"name":"SampleBox<TValue>","definition":False}]}
            result, _ = symbols.merge(built,[first,second],project,root,root / "engine",exported)
            self.assertEqual(sum(n["id"] == symbols.node_id("constructor") for n in result["nodes"]),1)
            wrong = {**second,"symbols":[{**ctor,"level":"class"}]}
            with self.assertRaisesRegex(LaniakeaError,"identity collision"):
                symbols.merge(built,[first,wrong],project,root,root / "engine",exported)

    def test_worker_timeout_and_nonzero_exit_are_failures(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "job.json.gz"
            command = {"file": "Sample.cpp", "directory": temporary, "arguments": ["clang-cl.exe", "Sample.cpp"]}
            for failure in (subprocess.TimeoutExpired("compiler", 900), None):
                with self.subTest(failure=failure), patch("laniakea.unreal.compiler.subprocess.run") as run:
                    if failure:
                        run.side_effect = failure
                    else:
                        run.return_value.returncode = 1
                    with self.assertRaises(LaniakeaError):
                        compiler._worker("libclang.dll", command, temporary, str(output))
                    self.assertFalse(output.exists())

    def test_real_checkout_is_refused_before_native_ubt_runs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / "original/Sample.uproject"
            project.parent.mkdir()
            project.write_text("{}")
            before = project.read_bytes()
            with patch("laniakea.unreal.ubt._run") as run:
                with self.assertRaisesRegex(LaniakeaError, "marked workspace copy"):
                    ubt.build_actions(root / "engine", project, "SampleEditor", "Development", root, root / "workspace")
                run.assert_not_called()
            self.assertEqual(project.read_bytes(), before)

    def test_copy_fidelity_rejects_changed_dependencies_definitions_and_pch(self):
        root = Path("original").absolute()
        copy = Path("copy").absolute()
        original = {"Modules": {"Sample": {"PrivatePCH": str(root / "Source/PCH.h"),
                                           "PublicDefinitions": ["SAMPLE=1"], "PrivateDependencyModules": ["Core"]}}}
        other = json.loads(json.dumps(original).replace(str(root).replace("\\", "\\\\"), str(copy).replace("\\", "\\\\")))
        compiler._check_exports(original, other, root, copy)
        for key, value in (("PublicDefinitions", ["SAMPLE=0"]), ("PrivateDependencyModules", []), ("PrivatePCH", "other.h")):
            changed = json.loads(json.dumps(other))
            changed["Modules"]["Sample"][key] = value
            with self.subTest(key=key), self.assertRaises(LaniakeaError):
                compiler._check_exports(original, changed, root, copy)


@unittest.skipUnless(os.environ.get("LANIAKEA_TEST_LIBCLANG"), "set LANIAKEA_TEST_LIBCLANG to pinned LLVM libclang.dll")
class NativeSymbols(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.project = self.root / "project/Sample.uproject"
        self.directory = self.project.parent / "Source/Sample"
        self.directory.mkdir(parents=True)
        self.other = self.project.parent / "Source/SampleUtility"
        self.other.mkdir()
        self.engine = self.root / "EngineRoot"
        self.core = self.engine / "Engine/Source/Runtime/Core/Public"
        self.core.mkdir(parents=True)
        (self.core / "CoreType.h").write_text("struct SampleEngineBase {virtual int Run();}; int SampleEngineCall();\n")
        (self.other / "Utility.h").write_text("int SampleUtilityCall();\n")
        self.project.write_text(json.dumps({"Modules": [{"Name": "Sample"}, {"Name": "SampleUtility"}]}))
        (self.directory / "Types.h").write_text(
            '#include "CoreType.h"\n#include "Utility.h"\n'
            'struct SampleDerived:SampleEngineBase {int Run() override;};\n'
            'int SampleCalled(); int SampleAddress();\n'
            '#define SAMPLE_DECLARE(Name) int Name();\nSAMPLE_DECLARE(SampleMacro)\n')
        self.source = self.directory / "Calls.cpp"
        self.source.write_text('#include "Types.h"\nint SampleDerived::Run(){auto p=&SampleAddress; '
                               'using T=decltype(SampleCalled()); auto b=noexcept(SampleCalled()); '
                               'auto r=requires{SampleCalled();}; '
                               'return SampleCalled()+SampleEngineCall()+SampleUtilityCall()+sizeof(SampleCalled());}\n')
        self.exported = {"Modules": {
            "Sample": {"Directory": str(self.directory), "Rules": str(self.directory / "Sample.Build.cs"),
                       "PublicDependencyModules": ["Core"]},
            "SampleUtility": {"Directory": str(self.other), "Rules": str(self.other / "SampleUtility.Build.cs")},
            "Core": {"Directory": str(self.core.parent), "Rules": str(self.core.parent / "Core.Build.cs")}}}

    def tearDown(self):
        self.temporary.cleanup()

    def index(self, source=None):
        source = source or self.source
        command = {"directory": str(source.parent), "arguments": ["clang-cl.exe", "/std:c++20", str(source),
                   "/I", str(self.directory), "/I", str(self.other), "/I", str(self.core)]}
        batch = native_index.extract(os.environ["LANIAKEA_TEST_LIBCLANG"], command, self.project.parent)
        self.assertFalse([d for d in batch["diagnostics"] if d["severity"] >= 3])
        self.assertIn(str(source), batch["input_hashes"])
        return batch

    def normalize(self, batches):
        built, _ = graph.build(self.project, self.engine, self.exported)
        result, unknown = symbols.merge(built, batches, self.project, self.project.parent, self.engine, self.exported)
        schema.validate(result)
        self.assertEqual(unknown, {"source": 0, "target": 0})
        return result

    def test_authored_recursion_stays_an_explicit_function_relationship(self):
        self.source.write_text('int SampleRecur(){return SampleRecur();}\n')
        built=self.normalize([self.index()])
        node=next(n for n in built['nodes'] if n['label']=='SampleRecur')
        calls=[e for e in built['edges'] if e['type']=='calls']
        self.assertEqual(len(calls),1)
        self.assertEqual((calls[0]['source'],calls[0]['target']),(node['id'],node['id']))
        self.assertFalse(calls[0].get('internal_to_owner',False))

    def test_class_own_type_references_are_internal_without_hiding_function_self_references(self):
        self.source.write_text(
            '#define SAMPLE_CATEGORY(Name) struct Name { using Self=Name; Name* next; };\n'
            'SAMPLE_CATEGORY(SampleCategory)\n'
            'struct SampleNode {using Self=SampleNode; SampleNode* next; static int Recur(int depth);};\n'
            'int SampleNode::Recur(int depth){auto callback=&SampleNode::Recur; return depth?Recur(depth-1):0;}\n'
            'struct SamplePeer {SampleNode* node;};\n')
        built=self.normalize([self.index()])
        nodes={n['id']:n for n in built['nodes']}
        own_types=[e for e in built['edges'] if e['source']==e['target'] and e['type']=='uses.type']
        self.assertEqual({nodes[e['source']]['label'] for e in own_types},{'SampleNode','SampleCategory'})
        self.assertTrue(all(e.get('internal_to_owner') for e in own_types),
                        'class aliases, own-pointer fields and macro type references belong within their owner')
        function_self=[e for e in built['edges'] if e['source']==e['target'] and nodes[e['source']]['level']=='function']
        self.assertEqual({e['type'] for e in function_self},{'calls','uses.function'})
        self.assertTrue(all(not e.get('internal_to_owner',False) for e in function_self))
        self.assertTrue(any(nodes[e['source']]['label']=='SamplePeer' and nodes[e['target']]['label']=='SampleNode'
                            and not e.get('internal_to_owner',False) for e in built['edges']))

    def test_calls_addresses_inheritance_overrides_source_links_and_edit(self):
        batch = self.index()
        built = self.normalize([batch])
        names = {n["id"]: n["label"] for n in built["nodes"]}
        nodes = {n["label"]: n for n in built["nodes"]}
        calls = [e for e in built["edges"] if e["type"] == "calls"]
        self.assertEqual(len(calls), 3, "address taking and sizeof must not acquire call edges")
        self.assertNotIn("SampleAddress", [names[e["target"]] for e in calls])
        self.assertEqual(nodes["Run"]["parent"], nodes["SampleDerived"]["id"])
        self.assertEqual(nodes["Run"]["source"], {"root": "project", "path": "Source/Sample/Calls.cpp", "line": 2})
        self.assertEqual(nodes["SampleMacro"]["source"]["path"], "Source/Sample/Types.h")
        self.assertFalse(any(str(self.root) in n.get("attrs", {}).get("qualified", "") for n in built["nodes"]))
        self.assertTrue({"inherits", "overrides"} <= {e["type"] for e in built["edges"]})
        self.assertTrue(all(n["level"] not in {"class", "function"} for n in built["nodes"] if n["boundary"]))
        review = next(e for e in calls if names[e["target"]] == "SampleUtilityCall")
        self.assertIn("not a violation", review["attrs"]["dependency_review"])
        found = shards.index(built)
        self.assertTrue(any(n["id"] == nodes["Run"]["id"] for n in found["nodes"]))
        self.source.write_text(self.source.read_text().replace("SampleCalled()+", ""))
        edited = self.normalize([self.index()])
        self.assertEqual({n["id"] for n in built["nodes"]}, {n["id"] for n in edited["nodes"]})
        self.assertEqual(sum(e["type"] == "calls" for e in edited["edges"]), 2)

    def test_equal_basenames_do_not_merge_file_local_symbols(self):
        first = self.directory / "one/Same.cpp"
        second = self.directory / "two/Same.cpp"
        for path in (first, second):
            path.parent.mkdir()
            path.write_text("static int SampleLocal(){return 1;}\nint SampleCaller(){return SampleLocal();}\n")
        built = self.normalize([self.index(first), self.index(second)])
        local = [n for n in built["nodes"] if n["label"] == "SampleLocal"]
        self.assertEqual(len(local), 2)
        self.assertNotEqual(local[0]["id"], local[1]["id"])

    def test_template_callbacks_member_calls_and_function_addresses_remain_distinct(self):
        fixtures = Path(__file__).resolve().parent.parent / "fixtures"
        for name in ("clangd.calls.cpp", "clangd.calls.h"):
            shutil.copy2(fixtures / name, self.directory / name)
        built = self.normalize([self.index(self.directory / "clangd.calls.cpp")])
        calls = [e for e in built["edges"] if e["type"] == "calls"]
        self.assertEqual(sorted(e["attrs"]["location"]["line"] for e in calls), [6, 7, 8, 8, 9, 10])
        names = {n["id"]: n["label"] for n in built["nodes"]}
        self.assertNotIn("AddressOnly", [names[e["target"]] for e in calls])
