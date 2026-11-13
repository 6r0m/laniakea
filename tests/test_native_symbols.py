# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native semantic regressions on synthetic sources, never an analysed project's data."""

import json
import gzip
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
    def test_unrendered_members_keep_the_nearest_recorded_code_owner(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);directory=root/'Source/Sample';engine=root/'engine'
            project=root/'Sample.uproject';project.write_text('{"Modules":[{"Name":"Sample"}]}')
            exported={'Modules':{'Sample':{'Directory':str(directory),'Rules':str(directory/'Sample.Build.cs')}}}
            built,_=graph.build(project,engine,exported)
            def fact(usr,level,parent=None,file=None):
                return {'usr':usr,'name':usr,'level':level,'parent':parent,'scope':'','signature':usr,
                        'file':str(file or directory/'Sample.h'),'line':2,'column':1,'definition':True}
            facts=[fact('Class','class'),fact('Method','function','Class'),fact('Peer','class'),
                   fact('Field','member','Class'),fact('Local','other','Method'),
                   fact('Generated','function','Class',engine/'Macros.h'),
                   fact('GeneratedPeer','function','Peer',engine/'Macros.h'),
                   fact('Unowned','function',file=root/'Intermediate/Generated.h')]
            refs=[{'source':source,'target':target,'role':4,'file':str(directory/'Sample.cpp'),
                   'line':n+10,'column':1,'implicit':False,'call_confirmed':False}
                  for n,(source,target) in enumerate([('Field','Peer'),('Local','Peer'),('Generated','Peer'),
                       ('Peer','Field'),('Peer','Generated'),('Unowned','Peer')])]
            batch={'symbols':facts,'references':refs,'relations':[{'source':'Generated','target':'GeneratedPeer','type':'overrides'}],
                   'diagnostics':[]}
            result,unknown=symbols.merge(built,[batch],project,root,engine,exported,
                                         {str(root/'Intermediate'):'Sample'})
            uses=[e for e in result['edges'] if e['type']!='overrides']
            self.assertEqual([(e['source'],e['target']) for e in uses],[
                (symbols.node_id(a) if a!='module:Sample' else a,symbols.node_id(b))
                for a,b in [('Class','Peer'),('Method','Peer'),('Class','Peer'),('Peer','Class'),('Peer','Class'),
                            ('module:Sample','Peer')]])
            relation=next(e for e in result['edges'] if e['type']=='overrides')
            self.assertEqual((relation['source'],relation['target']),(symbols.node_id('Class'),symbols.node_id('Peer')))
            self.assertEqual(unknown,{'source':0,'target':0})
            self.assertEqual(len(uses),len(refs),'normalization must retain every distinct call site')
            self.assertTrue(all(e['attrs']['target_declaration']['id'] for e in result['edges']))

            # Separate macro bodies can share one expansion location and the same displayed owner.
            batch['symbols'].append(fact('GeneratedSecond','function','Class',engine/'Macros.h'))
            first={**refs[2],'call_confirmed':True}
            second={**first,'source':'GeneratedSecond'}
            batch['references']=[first,second,first]
            result,_=symbols.merge(built,[batch],project,root,engine,exported)
            calls=[e for e in result['edges'] if e['type']=='calls']
            self.assertEqual(len(calls),2,'distinct source declarations must not deduplicate after owner collapse')

    def test_batch_consumers_can_reject_a_run_without_an_open_file_blocking_rename(self):
        with tempfile.TemporaryDirectory() as temporary:
            run=Path(temporary)/'run.partial';run.mkdir()
            with gzip.open(run/'job-0000.json.gz','wt',encoding='utf8') as stream:
                json.dump({'diagnostics':[]},stream)
            batches=compiler.batches(run,1)
            try:
                self.assertEqual(next(batches),{'diagnostics':[]})
                run.rename(run.with_name('run.failed'))
            finally:
                batches.close()

    def test_exact_target_declaration_keeps_its_own_column(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            directory=root/'Source/Sample'
            project=root/'Sample.uproject'
            project.write_text('{"Modules":[{"Name":"Sample"}]}')
            exported={'Modules':{'Sample':{'Directory':str(directory),'Rules':str(directory/'Sample.Build.cs')}}}
            built,_=graph.build(project,root/'engine',exported)
            fact={'usr':'record','name':'Record','level':'class','signature':'Record','parent':None,
                  'scope':'','file':str(directory/'Record.cpp'),'line':5,'column':3,'definition':True,
                  'declaration':{'file':str(directory/'Record.h'),'line':2,'column':17}}
            ref={'source':'record','target':'record','role':4,'file':fact['file'],'line':6,
                 'column':9,'implicit':False,'call_confirmed':False}
            batch={'symbols':[fact],'references':[ref],'relations':[],'diagnostics':[]}
            result,_=symbols.merge(built,[batch],project,root,root/'engine',exported)
            target=result['edges'][0]['attrs']['target_declaration']
            self.assertEqual(target['location']['path'],'Source/Sample/Record.h')
            self.assertEqual((target['location']['line'],target['column']),(2,17))

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
            conflicting={**second,'symbols':[{**ctor,'parent':None}]}
            with self.assertRaisesRegex(LaniakeaError,'containment collision.*SampleBox'):
                symbols.merge(built,[first,conflicting],project,root,root/'engine',exported)

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
        for module in self.exported['Modules'].values():
            for field in ('PublicDependencyModules','PrivateDependencyModules',
                          'PublicIncludePathModules','PrivateIncludePathModules'):
                module.setdefault(field,[])

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

    def test_dependent_overload_candidates_are_not_confirmed_calls(self):
        self.source.write_text('struct Left {}; struct Right {};\n'
            'bool operator==(const Left&, int); bool operator==(const Right&, int);\n'
            'template<class T> bool Candidate(const T& value){return value==0;}\n'
            'bool Positive(const Left& value){return value==0;}\n'
            'template<class T> int Chosen(T value){return 1;}\n'
            'int TemplatePositive(){return Chosen<int>(1);}\n'
            'template<class T> struct Box {Box(T);};\n'
            'int ConstructPositive(){Box<int> value(1);return 0;}\n')
        batch=self.index();facts={s['usr']:s for s in batch['symbols']}
        candidates=[r for r in batch['references'] if r['line']==3 and facts[r['target']]['name']=='operator==']
        self.assertEqual(len(candidates),2,'Keep compiler lookup evidence without inventing a selected overload')
        self.assertFalse(any(r['call_confirmed'] for r in candidates))
        built=self.normalize([batch]);nodes={n['id']:n for n in built['nodes']}
        calls=[e for e in built['edges'] if e['type']=='calls']
        self.assertEqual({nodes[e['source']]['label'] for e in calls},{'Positive','TemplatePositive','ConstructPositive'})
        selected=next(e for e in calls if nodes[e['source']]['label']=='Positive')
        self.assertIn('const Left &',selected['attrs']['symbol'])
        self.assertNotIn('Right',selected['attrs']['symbol'])

    def test_forward_declarations_do_not_steal_definition_ownership(self):
        (self.other/'Forward.h').write_text('struct SampleEngineBase;\n')
        (self.directory/'LocalForward.h').write_text('struct SampleUtilityRecord; struct SampleOpaque;\n')
        (self.other/'UtilityRecord.h').write_text('struct SampleUtilityRecord {int Run();};\n')
        self.source.write_text('#include "Forward.h"\n#include "CoreType.h"\n'
            '#include "LocalForward.h"\n#include "UtilityRecord.h"\n'
            'int UseEngine(SampleEngineBase& value){return value.Run();}\n'
            'int UseUtility(SampleUtilityRecord& value){return value.Run();}\n')
        batch=self.index()
        engine_type=next(s for s in batch['symbols'] if s['name']=='SampleEngineBase' and s['level']=='class')
        self.assertTrue(engine_type['definition'])
        self.assertEqual(Path(engine_type['file']),self.core/'CoreType.h')
        prior=self.other/'Prior.cpp';prior.write_text('#include "Forward.h"\n')
        prior_batch=self.index(prior)
        for batches in ([prior_batch,batch],[batch,prior_batch]):
            built=self.normalize(batches);nodes={n['id']:n for n in built['nodes']}
            record=next(n for n in built['nodes'] if n['label']=='SampleUtilityRecord')
            self.assertEqual(record['parent'],'module:SampleUtility')
            self.assertEqual(record['id'],symbols.node_id('c:@S@SampleUtilityRecord'))
            self.assertFalse(any(n['label']=='SampleEngineBase' for n in built['nodes']))
            opaque=next(n for n in built['nodes'] if n['label']=='SampleOpaque')
            self.assertFalse(opaque['attrs']['definition'],'An unavailable definition must remain unknown')
            call=next(e for e in built['edges'] if e['type']=='calls' and nodes[e['source']]['label']=='UseEngine')
            self.assertEqual(call['target'],'module:Core')
            self.assertNotIn('dependency_review',call['attrs'])

    def test_instantiated_template_body_keeps_its_resolved_member_call(self):
        self.source.write_text('#include "CoreType.h"\n'
            'template<class T> int Invoke(T& value){return value.Run();}\n'
            'int Positive(SampleEngineBase& value){return Invoke(value);}\n')
        batch=self.index();facts={s['usr']:s for s in batch['symbols']}
        body=[r for r in batch['references'] if r['line']==2 and facts[r['target']]['name']=='Run']
        self.assertTrue(body)
        self.assertTrue(all(r['call_confirmed'] for r in body))
        built=self.normalize([batch]);nodes={n['id']:n for n in built['nodes']}
        pairs={(nodes[e['source']]['label'],nodes[e['target']]['label']) for e in built['edges'] if e['type']=='calls'}
        self.assertIn(('Positive','Invoke'),pairs)
        self.assertIn(('Invoke','Core'),pairs)

    def test_template_arguments_do_not_invent_reverse_module_dependency_notes(self):
        (self.other/'Generic.h').write_text('#include "CoreType.h"\n'
            'template<class T> int Invoke(T& value){return value.Run()+SampleEngineCall();}\n'
            'struct Relay {template<class T> static int Call(){return T::Key();}};\n')
        self.source.write_text('#include "Generic.h"\n'
            'struct Local {int Run(); static int Key();};\n'
            'int Positive(Local& value){return Invoke(value)+Relay::Call<Local>();}\n')
        built=self.normalize([self.index()]);nodes={n['id']:n for n in built['nodes']}
        calls=[e for e in built['edges'] if e['type']=='calls']
        injected=[e for e in calls if nodes[e['target']]['label'] in {'Run','Key'}]
        self.assertEqual(len(injected),2,'Keep actual instantiated calls in the canonical graph')
        self.assertTrue(all(nodes[e['source']]['attrs']['definition'] is False for e in injected))
        self.assertFalse(any('dependency_review' in e['attrs'] for e in injected),
                         'A concrete template argument does not establish a reverse dependency from the template owner')
        fixed=[e for e in calls if e['attrs']['symbol']=='SampleEngineCall()']
        self.assertTrue(any(nodes[e['source']]['attrs']['definition'] and 'dependency_review' in e['attrs'] for e in fixed),
                        'Nondependent calls in the authored template still need a build dependency')
        self.assertTrue(any(nodes[e['source']]['label']=='Positive' and 'dependency_review' in e['attrs'] for e in calls))

    def test_declared_interface_include_does_not_require_a_link_dependency(self):
        self.exported['Modules']['Sample']['PublicDependencyModules']=[]
        self.exported['Modules']['Sample']['PrivateIncludePathModules']=['Core']
        self.source.write_text('#include "CoreType.h"\n'
            'int Interface(SampleEngineBase& value){return value.Run();}\n'
            'int Static(){return SampleEngineCall();}\n')
        built=self.normalize([self.index()])
        calls=[e for e in built['edges'] if e['type']=='calls']
        interface=next(e for e in calls if e['attrs']['symbol'].startswith('SampleEngineBase::Run'))
        static=next(e for e in calls if e['attrs']['symbol']=='SampleEngineCall()')
        self.assertEqual(interface['attrs']['dispatch'],'virtual target declaration')
        self.assertNotIn('dependency_review',interface['attrs'])
        self.assertNotIn('dependency_review',static['attrs'],'Include-only access does not prove a missing link dependency')
        self.assertEqual(static['attrs']['dependency_access'],'unverified')
        self.exported['Modules']['Sample']['PrivateIncludePathModules']=[]
        undeclared=self.normalize([self.index()])
        interface=next(e for e in undeclared['edges'] if e['type']=='calls' and e['attrs']['symbol'].startswith('SampleEngineBase::Run'))
        self.assertIn('dependency_review',interface['attrs'],'Do not infer an undeclared interface arrangement')

    def test_public_module_exposure_keeps_calls_without_a_direct_entry_warning(self):
        self.source.write_text('#include "CoreType.h"\nint Positive(){return SampleEngineCall();}\n')
        batch=self.index()
        self.exported['Modules']['Sample']['PublicDependencyModules']=[]
        unsupported=self.normalize([batch])
        call=next(e for e in unsupported['edges'] if e['type']=='calls')
        self.assertEqual(call['attrs']['dependency_access'],'unsupported')
        self.exported['Modules']['Sample']['PrivateDependencyModules']=['SampleUtility']
        self.exported['Modules']['SampleUtility']['PublicDependencyModules']=['Core']
        available=self.normalize([batch])
        current=next(e for e in available['edges'] if e['type']=='calls')
        self.assertEqual(current['id'],call['id'])
        self.assertEqual(current['attrs']['target_declaration'],call['attrs']['target_declaration'])
        self.assertEqual(current['attrs']['dependency_access'],'available')
        self.assertEqual(current['attrs']['public_exposure_path'],['Sample','SampleUtility','Core'])
        self.assertNotIn('dependency_review',current['attrs'])

    def test_macro_spelling_and_unrendered_fields_follow_semantic_class_ownership(self):
        (self.core/'Macros.h').write_text('#define SAMPLE_BODY int Generated(){return SampleEngineCall();}\n')
        self.source.write_text('#include "CoreType.h"\n#include "Macros.h"\n'
            'struct SampleRecord {SAMPLE_BODY SampleEngineBase Field;};\n'
            'int Read(SampleRecord& r){return r.Field.Run()+r.Generated();}\n')
        batch=self.index();built=self.normalize([batch]);nodes={n['label']:n for n in built['nodes']}
        record=nodes['SampleRecord']['id'];read=nodes['Read']['id']
        self.assertNotIn('Generated',nodes,'Engine-spelled helpers stay abstracted, not new authored stars')
        self.assertTrue(any(e['source']==record and e['attrs'].get('symbol','').startswith('SampleEngineCall')
                            for e in built['edges']))
        self.assertTrue(any(e['source']==read and e['target']==record for e in built['edges']))
        self.assertFalse(any(e['source']=='module:Sample' for e in built['edges'] if e['origin']=='compiler'))

    def test_namespace_owners_follow_modules_reopenings_and_nested_types(self):
        self.source.write_text('namespace Sample {int First(){return 1;}}\n'
            'namespace Sample {namespace Detail {struct Record {int Read(){return 1;}};}\n'
            'int Second(){return First();}}\n')
        other=self.other/'Other.cpp';other.write_text('namespace Sample {int Third(){return 3;}}\n')
        batches=[self.index(),self.index(other)]
        built=self.normalize(batches);nodes={n['id']:n for n in built['nodes']}
        scopes=[n for n in built['nodes'] if n['level']=='namespace' and n['label']=='Sample']
        self.assertEqual({n['parent'] for n in scopes},{'module:Sample','module:SampleUtility'})
        first=next(n for n in built['nodes'] if n['label']=='First')
        second=next(n for n in built['nodes'] if n['label']=='Second')
        self.assertEqual(first['parent'],second['parent'])
        record=next(n for n in built['nodes'] if n['label']=='Record')
        read=next(n for n in built['nodes'] if n['label']=='Read')
        self.assertEqual(nodes[record['parent']]['label'],'Detail')
        self.assertEqual(read['parent'],record['id'])
        original_ids={symbols.node_id(s['usr']) for batch in batches for s in batch['symbols']
                      if s['level'] in {'class','function'}}
        self.assertTrue(original_ids<={n['id'] for n in built['nodes']})
        reversed_run=self.normalize(list(reversed(batches)))
        self.assertEqual({n['id']:n['parent'] for n in built['nodes']},
                         {n['id']:n['parent'] for n in reversed_run['nodes']})

    def test_anonymous_namespaces_keep_source_context_through_shared_headers_and_unity(self):
        header=self.directory/'Shared.h'
        header.write_text('#pragma once\nnamespace {inline int HeaderLocal(){return 1;}}\n')
        sources=[]
        for sub,name in [('one','FirstLocal'),('two','SecondLocal')]:
            source=self.directory/sub/'Unit.cpp';source.parent.mkdir();sources.append(source)
            source.write_text('#include "Shared.h"\nnamespace {int '+name+'(){return HeaderLocal();}}\n')
        separate=self.normalize([self.index(source) for source in sources])
        unity=self.directory/'Unity.cpp';unity.write_text('#include "one/Unit.cpp"\n#include "two/Unit.cpp"\n')
        together=self.normalize([self.index(unity)])
        for built in (separate,together):
            nodes={n['id']:n for n in built['nodes']}
            local=[n for n in built['nodes'] if n['label'] in {'HeaderLocal','FirstLocal','SecondLocal'}]
            self.assertEqual(len(local),3)
            self.assertEqual(len({n['parent'] for n in local}),3)
            self.assertTrue(all(nodes[n['parent']]['level']=='namespace' for n in local))
        self.assertEqual({n['id']:n['parent'] for n in separate['nodes']},
                         {n['id']:n['parent'] for n in together['nodes']})

    def test_unindexed_alias_helpers_do_not_collide_across_anonymous_scopes(self):
        sources=[]
        for sub,name in [('one','First'),('two','Second')]:
            source=self.directory/sub/'Unit.cpp';source.parent.mkdir();sources.append(source)
            source.write_text('#include "CoreType.h"\nnamespace {using E=SampleEngineBase;struct '+name+'Type:E {};E '+name+'(){return E{};}}\n')
        batches=[self.index(source) for source in sources]
        aliases=[fact for batch in batches for fact in batch['symbols'] if fact['name']=='E']
        self.assertEqual(len(aliases),2)
        self.assertEqual(aliases[0]['usr'],aliases[1]['usr'])
        self.assertNotEqual(aliases[0]['parent'],aliases[1]['parent'])
        built=self.normalize(batches)
        self.assertEqual({n['label'] for n in built['nodes'] if n['level']=='function'},{'First','Second'})
        self.assertFalse(any(n['label']=='E' for n in built['nodes']))
        self.assertTrue(any(e['type']=='uses.type' for e in built['edges']))
        self.assertEqual(len([e for e in built['edges'] if e['type']=='inherits']),2)

    def test_shared_namespace_alias_endpoints_follow_their_declaring_module(self):
        self.source.write_text('#include "CoreType.h"\nnamespace Sample {using E=SampleEngineBase;struct FirstType:E {};}\n')
        other=self.other/'Other.cpp'
        other.write_text('#include "CoreType.h"\nnamespace Sample {using E=SampleEngineBase;struct SecondType:E {};}\n')
        batches=[self.index(),self.index(other)]
        expected={'FirstType':'module:Sample','SecondType':'module:SampleUtility'}
        for order in (batches,list(reversed(batches))):
            built=self.normalize(order);nodes={n['id']:n for n in built['nodes']}
            self.assertEqual({nodes[e['source']]['label']:e['target'] for e in built['edges'] if e['type']=='inherits'},expected)

    def test_declaration_context_retains_access_fields_sources_and_macro_evidence(self):
        header=self.directory/'Context.h'
        header.write_text('namespace Sample {\nstruct Base {virtual int Read() const;};\n'
            'class Record:public Base {public:static int Get();int Read() const override;\n'
            'private:Record();int Stored;};\nstruct Data {int Value;};\n}\n')
        self.source.write_text('#include "Context.h"\nnamespace Sample {\n'
            'int Record::Get(){return 1;}\nint Record::Read() const{return Stored;}\nRecord::Record():Stored(0){}\n}\n'
            '#define SAMPLE_RECORD(Name) struct Name {int Value;};\nSAMPLE_RECORD(MacroRecord)\n')
        batch=self.index();built=self.normalize([batch,batch]);nodes={n['label']:n for n in built['nodes']}
        self.assertEqual(nodes['Data']['attrs'].get('declaration_kind'),'struct')
        self.assertEqual(nodes['Get']['attrs']['access'],'public')
        self.assertTrue(nodes['Get']['attrs']['static'])
        read=next(n for n in built['nodes'] if n.get('attrs',{}).get('qualified')=='Sample::Record::Read')
        self.assertTrue(read['attrs']['const'] and read['attrs']['virtual'])
        self.assertIn('int',read['attrs']['type_signature'])
        ctor=next(n for n in built['nodes'] if n.get('attrs',{}).get('declaration_kind')=='constructor')
        self.assertEqual(ctor['attrs']['access'],'private')
        self.assertTrue(read['attrs']['declaration']['path'].endswith('Context.h'))
        self.assertEqual(read['attrs']['declaration']['line'],3)
        self.assertEqual(read['source']['path'],'Source/Sample/Calls.cpp')
        record=next(n for n in built['nodes'] if n['label']=='Record' and n['level']=='class')
        self.assertEqual(record['attrs']['member_counts'],{'fields':{'private':1},'callables':{'public':2,'private':1}})
        self.assertEqual(nodes['Data']['attrs']['member_counts']['fields'],{'public':1})
        self.assertEqual(nodes['MacroRecord']['attrs']['declaration_origin'],'macro expansion')
        self.assertEqual(nodes['Data']['attrs']['declaration_origin'],'unknown')
        self.assertEqual(len([n for n in built['nodes'] if n['label']=='Value']),0)

    def test_lambda_names_keep_compiler_ids_and_nested_callable_ownership(self):
        self.source.write_text('namespace Sample {int Target(){return 1;}\n'
            'int Host(){auto work=[](){auto nested=[](){return Target();};return nested();};return work();}}\n')
        batch=self.index();built=self.normalize([batch]);nodes={n['id']:n for n in built['nodes']}
        closures=[n for n in built['nodes'] if n.get('attrs',{}).get('declaration_kind')=='lambda']
        self.assertEqual(len(closures),2)
        self.assertEqual({n['label'] for n in closures},{'lambda work','lambda nested'})
        self.assertTrue(all('lambda at' not in n['label'] and str(self.root) not in n['attrs']['qualified'] for n in closures))
        nested=next(n for n in closures if n['label']=='lambda nested')
        self.assertEqual(nodes[nested['parent']]['label'],'operator()')
        self.assertEqual(nodes[nodes[nested['parent']]['parent']]['label'],'lambda work')
        expected={symbols.node_id(s['usr']) for s in batch['symbols'] if s['level'] in {'class','function'}}
        self.assertTrue(expected<=nodes.keys())

    def test_lambda_return_signatures_do_not_expose_compiler_copy_paths(self):
        self.source.write_text('auto Make(){return [](){return 1;};}\nint Call(){return Make()();}\n')
        built=self.normalize([self.index()])
        make=next(n for n in built['nodes'] if n['label']=='Make')
        self.assertNotIn(str(self.root),make['attrs']['type_signature'])
        self.assertTrue(any(n.get('attrs',{}).get('declaration_kind')=='lambda' for n in built['nodes']))

    def test_external_bases_and_call_target_keep_native_declaration_coordinates(self):
        sdk = self.root / 'sdk'; sdk.mkdir()
        header = sdk / 'SampleSDK.h'
        header.write_text('struct SampleFirstBase {};\nstruct SampleSecondBase {};\nint SampleExternalCall();\n')
        self.source.write_text('#include "'+header.as_posix()+'"\n'
                               'struct SampleExternalDerived:SampleFirstBase,SampleSecondBase {};\n'
                               'int SampleExternalCaller(){return SampleExternalCall();}\n')
        built = self.normalize([self.index()])
        bases = [e for e in built['edges'] if e['type']=='inherits']
        self.assertEqual(len(bases),2)
        self.assertEqual({e['attrs']['target_declaration']['location']['line'] for e in bases},{1,2})
        call = next(e for e in built['edges'] if e['type']=='calls')
        self.assertEqual(call['attrs']['location']['line'],3)
        self.assertEqual(call['attrs']['target_declaration']['location']['line'],3)
        self.assertTrue(call['attrs']['target_declaration']['location']['path'].endswith('SampleSDK.h'))

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
