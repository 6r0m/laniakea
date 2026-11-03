# Milestone 1 - project, plugin and module graph

**Status:** REVIEW REQUIRED. The direction was reviewed and accepted. D4 changes how the tool meets an analysed project, so
this version needs review before implementation starts.
**Scope:** the first working version: Unreal project, plugin and module levels with typed build edges, a static viewer, and the
privacy gates for publishing.
**Next milestone:** [m2_function_layer.md](m2_function_layer.md), not approved.
**Evidence appendix:** [evidence.md](evidence.md) holds the prior-art and engine audits.

## Contents

- Goal
- Authority register
- Non-goals
- Verified evidence
- Current sources of truth
- Problem and capability gap
- Decision
- Workspace and isolation contract
- Graph model
- Required invariants
- Implementation tasks
- Realization
- Test-first and verification plan
- Documentation plan
- Rollout and rollback
- Completion criteria
- Review record

Path tokens: `<project>` = the analysed project's root folder, `<engine>` = the engine root, `<laniakea>` = this clone.
Engine citations are paths under `Engine/Source/Programs/UnrealBuildTool/` unless stated, read at 5.8.3.

## Goal

A developer points Laniakea at an Unreal C++ project and explores it progressively: project -> plugins -> modules, with typed
dependency edges and jump to source. The view is regenerated from source and build rules and is never authored. The analysed
project needs nothing installed, configured or committed for it.

## Authority register

### Operator decisions

Source: the maintainer, 2026-11-02 (D1-D3, D5, D6) and 2026-11-03 (D4).

- **D1** Reuse before building. No custom C++ parser, Unreal asset parser, graph rendering engine or build system. Open
  source, permissive preferred. No subscription, paid API, hosted service or LLM. Local-first, on Windows and Linux. Prefer
  headless, keep services minimal, no manual architecture DSL, reliability over visual novelty.
  - Effect: bounds every option. Reason: avoid building another large development platform.
- **D2** Source and executable build configuration are authoritative. Every graph is a regenerable projection. Verified static
  facts stay apart from inferred or dynamic ones, and missing analysis never reads as proof of absence.
  - Effect: drives the coverage model and the failure policy.
- **D3** Language profiles: core and viewer stay language-neutral and language logic lives in profiles, so Rust, Python or
  similar can follow when needed.
  - Effect: only the seam is built now (A3).
- **D4** Black-box use. Laniakea runs from its own clone, the user chooses the project at run time, and everything learned
  about the project lives in the clone's ignored workspace. The project needs no file, configuration, hook, link or ignore rule
  for the tool, and knows nothing about it.
  - Effect: the workspace contract; invariants 1, 9 and 11. Replaces an earlier layout that put a clone of the tool inside the
    analysed project.
  - Reason: full decoupling in both directions.
- **D5** Name: Laniakea, repository `laniakea`. Public text keeps to astronomy and states independence from Epic Games.
- **D6** The public repository holds no data from any analysed private project: no code, names, paths, logs, screenshots,
  receipts or identifying counts. Generic outcomes are allowed, such as "seconds per target". Ignore rules alone are not
  trusted for this (invariant 12).

### Operator gates

- **Q1 [OPEN - maintainer action]:** each push, including the first. The maintainer pushes after the P7 gate. An agent pushes
  only when the current request names the repository and the operation.
- **Q2 [OPEN - NON-BLOCKING]:** is elkjs (EPL-2.0 OR GPL-3.0-or-later) acceptable as a vendored dependency, given that D1
  prefers permissive? Dormant while elkjs is deferred (A2).
- **Q3 [OPEN - NON-BLOCKING]:** are Client and Server targets needed? A launcher engine refuses them. Default: A4.
- **Q4 [OPEN - before the first code push]:** the LICENSE copyright holder text. MIT per A1; the holder text is the
  maintainer's choice.

### Working assumptions

- **A1 [ACTIVE]** MIT license. The sample is a small synthetic Unreal-shaped project with no engine code.
- **A2 [ACTIVE]** Cytoscape.js built-in layouts come first. elkjs comes back only if they prove insufficient on real scopes.
- **A3 [ACTIVE]** Only the `unreal` profile is built until another language is needed. A hand-written non-Unreal fixture proves
  the seam.
- **A4 [ACTIVE]** Editor and Game targets are analysed; Client and Server are reported as not analysed. M1 defaults to the
  project's Editor target.
- **A5 [ACTIVE]** Python 3 standard library only. Unreal bundles Python, so a machine with Unreal installed needs nothing extra.

## Non-goals

- A full engine symbol index. Engine modules and plugins appear only as boundary nodes.
- Classes, functions and calls. Those belong to M2.
- A runtime call graph.
- Continuous zoom, live push updates, a database, or any server beyond a loopback static file server.
- Asset and Blueprint relationships.
- Registering a project from the browser. The page only switches between projects already extracted.
- Any change to an analysed project.

## Verified evidence

Measurements come from a private validation project. Only their generic outcome is stated here (D6).

### Verified facts

**UBT module graph.**
- `-Mode=JsonExport <Target> <Platform> <Configuration> -Project=<uproject> -OutputFile=<file>` evaluates the target rules. Per
  module it writes Public, Private, PublicIncludePath, PrivateIncludePath and DynamicallyLoaded dependencies, plus Directory,
  Rules, Type, PCHUsage and CircularlyReferenced. Owners: `Modes/JsonExportMode.cs`, `UEBuildTarget.ExportJson`,
  `UEBuildModule.ExportJson`.
  - Measured with current build rules: a few seconds per target. No build intermediates, binaries or makefile were written,
    and every dependency name resolved to an exported module.
- The export has no plugin field. Every plugin-hosted project module resolved to its nearest `.uplugin`, which lists it in
  `Modules[]` (measured).
- `UEBuildModule.ExportJson` writes `InternalIncludePaths` from `PublicIncludePaths`, so that field is wrong; do not consume
  it.
- Removing a dependency from a `Build.cs` and exporting again removes the edge (measured on a copy).
- A target is not the whole project: the Editor target omitted some `.uplugin` and `Build.cs` files on disk (measured).
- A launcher engine refuses `Client` and `Server` targets with rc=6; `Game` works (measured).
- `-Mode=QueryTargets -Project=<uproject> -Output=<file>` lists targets with name, path and type. Without `-Output` it writes
  `<project>/Intermediate/TargetInfo.json` (`Modes/QueryTargetsMode.cs`).
- Writes into the project: after a `Build.cs` or `Target.cs` change, UBT recompiles the project rules assembly into
  `<project>/Intermediate/Build/BuildRules/<Project>ModuleRules.dll` (`Configuration/Rules/RulesCompiler.cs`). Source read only:
  the no-write measurement above ran with rules already current.
- JsonExport is single-instance (`ToolModeOptions.SingleInstance`). Without `-WaitMutex` it aborts while another UBT runs
  (`UnrealBuildTool.cs`, `GlobalOptions.cs`).
- `-Log=<file>` replaces the default UBT log location (`GlobalOptions.cs`).
- UBT needs the engine's bundled .NET. A system `dotnet` failed with exit 150 (measured). On Windows,
  `Engine/Build/BatchFiles/RunDotnet.bat` calls `GetDotnetPath.bat`, which points `DOTNET_ROOT` at the bundled SDK.
  `RunUBT.sh` covers Linux and Mac.
- Engine association: a `.uproject` `EngineAssociation` resolves through one of these. Owner:
  `Engine/Source/Developer/DesktopPlatform/Private/`.
  - Launcher engines: the launcher list `UnrealEngineLauncher/LauncherInstalled.dat` in the application settings folder.
  - Source builds: on Windows, registry key `SOFTWARE\Epic Games\Unreal Engine\Builds`. On Linux,
    `UnrealEngine/Install.ini` section `[Installations]`.

**Plugin descriptors.**
- `.uplugin` `Modules[]` lists the modules a plugin hosts.
- `Plugins[]` declares plugin dependencies. Each entry can carry `Optional`, plus `PlatformAllowList`, `PlatformDenyList`,
  `TargetAllowList`, `TargetDenyList`, `TargetConfigurationAllowList` and `TargetConfigurationDenyList`. Owner:
  `Engine/Source/Runtime/Projects/Private/PluginReferenceDescriptor.cpp`.

**Compile database.** This is an M2 input, stated here because it shapes the workspace.
- `-Mode=GenerateClangDatabase` on an installed engine writes response files into the project's live intermediates. The
  `UEBuildTarget` constructor sets `IntermediateEnvironment` to Default when `Unreal.IsEngineInstalled()`, so the isolated
  `<Target>GCD` folder exists only on source builds.
  - Measured on a real project: live intermediates were rewritten, so the next normal build recompiles the affected modules.
    `-NoExecCodeGenActions` does not prevent it.
- On a copy of the project, with `-OutputDir` inside the copy, the same mode left the original untouched. Measured by makefile
  hash, the response-file set, and the absence of newer files.

**Other Epic sources** (detail in evidence.md, sections 3-5).
- UHT parses reflected headers only and never reads `.cpp`. Its `-Json` exporter failed on 5.8.3 with an object cycle (rc=6,
  measured).
- `-Mode=Analyze` writes a pruned GEXF graph, not the full module graph (measured).
- Plugin Reference Viewer and Plugin Audit use `.uplugin` and Asset Registry data only, need the Editor UI, and have no module
  or code edges. No Epic tool reads C++ bodies.

### Assumptions / unverified areas

- Whether `RunDotnet.bat` gives the same export as the direct bundled-runtime call that was measured.
- Exactly which files a rules recompile writes on a real run.
- JsonExport while the project's Editor is open. The measurements ran with it closed.
- Linux: nothing was run.
- Viewer performance and layout determinism: no viewer was built.

## Current sources of truth

- Module graph: UBT target evaluation, fed by `.Build.cs`, `.Target.cs`, `.uplugin` and `.uproject`.
- Plugin ownership and declared plugin dependencies: `.uplugin` `Modules[]` and `Plugins[]`.
- Engine location: the `.uproject` `EngineAssociation`, resolved through the engine's own registration.
- The tool owns no fact. It joins these, read-only, and displays them.

## Problem and capability gap

Each layer exists separately and nothing joins them. Epic has no unifying framework and no call edges, and no mature free
platform gives this hierarchy on Windows. Full audits: evidence.md, sections 1-4.

| Candidate | License | Maintenance | Verdict |
|---|---|---|---|
| Thin viewer over UBT, plus clangd for M2 | Components MIT, Apache-2.0 | Epic, LLVM, Cytoscape | **Recommended** |
| Prerendered Graphviz SVG per scope | EPL-2.0 engine | Active | **Fallback**: the same graph data and no runtime library, but no live filtering |
| Sourcetrail fork | GPL-3.0 | One maintainer | Optional experiment only. Windows binaries are sponsor-only; a source build needs Qt6, Boost and LLVM; the import SDK was archived in 2021; no Unreal scale evidence |
| Doxygen | GPL-2.0 | Active | Rejected as primary: static output, no custom hierarchy |
| CodeCompass | GPL-3.0 | Active | Rejected: Linux only, LLVM 15 |
| scip-clang + Sourcegraph | Apache-2.0 + commercial | Beta | Rejected: no Windows, no clang-cl, no `@rsp`; the viewer is Enterprise |
| Kythe, Glean, Searchfox | Various | Active | Rejected: Linux or WSL only |
| Repowise, GitNexus, tree-sitter graphs | Various | Various | Rejected: not semantic; GitNexus is noncommercial |
| CodeQL, Understand | Commercial terms | Active | Rejected: D1 |
| Spyglass, Monolith, ue-codegraph-mcp | MIT, MIT, none | Active | Rejected: `.uplugin`-only, or regex and tree-sitter heuristics |
| Neo4j or any graph database | Various | Active | Rejected: solves storage only, and the views are small and static |

Viewer libraries: Cytoscape.js 3.x comes first (MIT, since 2011, used by Nx and Mermaid). React Flow (MIT) is the alternative,
though its capacity beyond hundreds of nodes is unproven. G6 v5 is rejected: scoped views avoid its combo defects, but not its
open performance reports. Sigma has no documented nesting. Detail: evidence.md, section 2.

## Decision

**Recommended: a thin CLI and a static viewer over UBT's own module graph, run from the tool's clone against a project chosen at
run time.** Fallback: prerendered Graphviz SVG per scope over the same graph data. The durable boundary is the graph schema, not
one visualization library.

```text
analysed project (read-only)                laniakea clone
  .uproject  .uplugin  Build.cs  Target.cs ---> laniakea extract
engine (resolved from EngineAssociation) ----->   runs UBT QueryTargets and JsonExport, output and log in the workspace
                                                  reads descriptors and hashes build inputs
                                                    |
                                                    v
                                                workspace/targets/<id>/runs/<utc>/   ignored
                                                  manifest.json  graph.json  scopes/*.json
                                                    |
                                                laniakea serve --> 127.0.0.1 --> static page (Cytoscape.js)
                                                                                 vscode:// source links
```

| Component | Treatment |
|---|---|
| UBT JsonExport and QueryTargets, `.uplugin` | Reused unchanged, launched through the engine's own .NET script |
| Cytoscape.js | Reused: vendored and pinned 3.x, no CDN, built-in layouts first |
| `laniakea` CLI: engine resolution, extract, normalize, shard, serve | Small, Python standard library |
| Viewer page: target picker, scope navigation, edge filters, coverage, source links | Small, using library rendering |
| Custom parser, renderer, database | None |

**Premise / KISS gate.** UBT owns the module graph and already produces it. `.uplugin` owns plugin ownership. The tool joins and
displays them and owns no fact. The moving parts are one CLI, one static page and one loopback server. No toolchain is needed
beyond the engine's own, and the analysed project gains nothing. Continuous zoom and live updates are dropped knowingly;
scoped drill-down and regenerate-on-demand replace them.

### Alternatives considered for meeting the project (D4)

- **A clone or link of the tool inside the project.** Rejected for four reasons:
  - It puts tool files and an ignore rule into the project.
  - Links need extra privileges on Windows, and project scripts walk into them.
  - Publishing the project then depends on its ignore rules.
  - The project knows about the tool.
- **Output in the project's `Saved/`.** Rejected: the project would hold tool state, absolute paths and logs in a tree that may
  be published.
- **Consuming an export the project already produces.** Rejected: it couples the tool to a project script and needs a staleness
  protocol, while running the export directly costs seconds.
- **A per-user workspace outside the clone.** Viable, but not chosen. One visible folder beside the tool is simpler to inspect
  and delete.

## Workspace and isolation contract

```text
<laniakea>/workspace/                            ignored; the only place project data lives
  targets/<id>/target.json                       project file, engine root, targets; absolute paths live only here
  targets/<id>/latest.json                       the last good run
  targets/<id>/runs/<utc>/ubt/targets.json       QueryTargets output (-Output)
  targets/<id>/runs/<utc>/ubt/<Target>.json      raw export (-OutputFile)
  targets/<id>/runs/<utc>/ubt/<Target>.log       UBT log (-Log)
  targets/<id>/runs/<utc>/manifest.json          targets, configuration, tool and engine versions, input hashes, analyses not run
  targets/<id>/runs/<utc>/graph.json             schema v1, independent of the viewer
  targets/<id>/runs/<utc>/scopes/*.json          one shard per drill-down scope
```

- `<id>` defaults to the `.uproject` name in lower case, and `--name` overrides it. An id already bound to a different project
  file is refused.
- **Writes into the project.** The tool writes nothing there. The only change allowed is UBT's own rules-assembly refresh
  under `Intermediate/Build/BuildRules/`, the same files any build writes. The isolation test proves nothing else changes.
- **Writes into the engine.** UBT keeps whatever writable-folder state it keeps for any command. Its log is redirected into the
  workspace.
- **Removal.** Delete `workspace/targets/<id>/` to forget one project, or `workspace/` to reset the tool.

## Graph model

Schema v1, in `schema/graph.v1.schema.json`, owns the shapes. This section owns the semantics.

- **Levels.** The profile declares its levels in the manifest, and the viewer hardcodes none.
  - Unreal: project, plugin, module; M2 adds class and function.
  - Rust, later: workspace, crate, module, type, function. Python, later: project, package, module, class, function.
- **Nodes.** Each carries a level, a parent, a boundary flag, and a project-relative source path. A file is an attribute, not a
  node.
- **Edges.**
  - `contains`: hierarchy.
  - `requires`: one `.uplugin` `Plugins[]` entry, status `declared`. `Optional` and the allow and deny lists are kept as
    attributes.
  - `depends.public`, `depends.private`, `depends.include_public`, `depends.include_private`, `depends.dynamic`: from the UBT
    export, status `declared`.
  - `depends.rollup`: plugin to plugin, computed from module edges, status `derived`. It is shown beside `requires` and never
    merged with it. A mismatch between the two is a finding: it is shown, never reconciled.
  - M2 adds `inherits`, `overrides` and `calls`.
- **Statuses.** `declared`, `derived`, and in M2 `resolved` and `partial`. Nothing is labelled `verified`.
- **Coverage.**
  - The manifest names every analysis not run.
  - Plugins on disk outside the analysed target appear as `not-in-target`.
  - A level or edge type a profile cannot produce is reported as not analysed, never left out silently.

## Required invariants

1. The analysed project never depends on the tool, and gains no file, configuration, hook, link or ignore rule from it. Writes
   into the project are limited to UBT's rules cache.
2. `GenerateClangDatabase` is treated as mutating. The tool never runs it on an analysed project, only on its own workspace copy
   (M2).
3. Every edge carries provenance: tool, version, target, configuration and status.
4. Absence is never rendered as proof. Scope that was not analysed is marked explicitly.
5. Engine modules and plugins appear as boundary nodes only.
6. The normalized schema is the contract. Raw tool output is not.
7. Each extraction writes a new run folder and then switches `latest.json`, so a failed run leaves the last good graph intact.
8. A run stays fresh only while its recorded build-input hashes match the project. `serve` rechecks them at start and marks a
   stale run. An export naming a different project file is refused.
9. Graph and shards hold project-relative paths. Absolute roots live only in `target.json`.
10. No network at runtime: no CDN, fonts, analytics or update checks. The server binds 127.0.0.1 only.
11. All project data lives under `workspace/`. Tracked fixtures, examples and screenshots come from the synthetic sample only.
12. The pre-push hook and the P7 gate keep project data out of history; the ignore rule is not the guard. The hook refuses:
    - any `workspace/` path, added binaries, and private-pattern matches;
    - running without its patterns file: it fails closed.

    It reports path and line only.
13. Core and viewer contain no language-specific logic. Everything Unreal-specific lives in the `unreal` profile.
14. `requires` and `depends.rollup` stay separate edge types.

## Implementation tasks

- [x] 1. Repository and identity (P1).
- [ ] 2. First push of this plan by the maintainer, after the P7 gate (Q1).
- [ ] 3. Pre-push hook with its tests, before any code or fixture (P6).
- [ ] 4. Tree, schema, sample and fixtures (P2).
- [ ] 5. Red tests, then engine resolution and `extract` (P3-P5).
- [ ] 6. Viewer and `serve` (P5).
- [ ] 7. Validation on a private project (P8).
- [ ] 8. Tag `v0.1.0` once the completion criteria hold.

## Realization

**P1. Identity: done.**
- Local `user.name` and the account's noreply `user.email`.
- `origin` over an SSH host alias bound to the account key, since HTTPS could pick another logged-in account.
- Global `user.useConfigOnly=true`.
- Never copy identity from other clones.

Maintainer checks before the first push:
- GitHub email privacy is on, including "Block command line pushes that expose my email".
- Commit dates are UTC: commit with `TZ=UTC` set, because the local offset is otherwise recorded.
- The private patterns file exists outside the repository (P6).

**P2. Repository tree.**

```text
laniakea/
  README.md  AGENTS.md  CLAUDE.md  LICENSE (Q4)  THIRD_PARTY.md
  laniakea.py                     single entry point
  laniakea/                       core: cli.py, workspace.py, graph.py, shards.py, server.py, profiles.py
  laniakea/unreal/                engine.py (association, .NET launcher), ubt.py, uplugin.py
  schema/graph.v1.schema.json
  viewer/                         index.html, app.js, app.css, vendor/ (Cytoscape.js, pinned 3.x, MIT text beside it)
  sample/SampleProject/           .uproject; plugins SampleCore, SampleGameplay, SampleEditor; Build.cs; small C++
  fixtures/sample.ubt.json        recorded from the sample with a real engine: roots tokenized, engine modules pruned
  fixtures/generic.graph.json     a hand-written non-Unreal hierarchy that proves core and viewer are neutral
  tests/
  .githooks/pre-push
  .gitignore                      /workspace/, __pycache__/
```

The sample contains no engine code and is named only `Sample*`. In the fixtures, absolute roots become `<project>` and
`<engine>`, engine modules are pruned to those the sample references, and a test fails on any absolute path.

**P3. CLI contract.**

```text
python laniakea.py extract <project> [--engine <root>] [--name <id>] [--target <name>]
python laniakea.py serve [--port <n>]
python laniakea.py up <project> [same options as extract]        extract, then serve
```

- `<project>` is a `.uproject` file, its folder, or the id of a project already extracted.
- The first `extract` writes `target.json`, and later runs reuse it.
- `--engine` overrides `EngineAssociation` resolution and is stored.
- `--target` defaults to the project's Editor target from QueryTargets.
- UBT runs through `RunDotnet.bat` on Windows and `RunUBT.sh` elsewhere.
- If another UBT instance is running, `extract` fails and says so; it does not wait.
- `extract` always exports fresh, since the export costs seconds.

**P4. Profile contract.**
- `extract(target)` returns levels, nodes, edges and coverage in schema v1.
- One registry in `profiles.py` owns the list. Adding a language means one adapter and one registry line.
- No dynamic plugin loading.

**P5. Build test-first.** Write the Red cases below first, then `extract`, then the viewer.

The viewer needs:
- a target picker over the workspace;
- project -> plugin -> module scopes;
- typed edge filters;
- a coverage panel, and a stale banner;
- source links `vscode://file/<abs>:<line>`, which `serve` builds from `target.json`.

Layouts are Cytoscape.js built-ins with sorted input. Confirm they are stable across runs; add elkjs only if they prove
insufficient (A2, Q2).

**P6. Pre-push hook.** `.githooks/pre-push`, enabled per clone with `git config core.hooksPath .githooks`.

It checks every outgoing commit:
- author and committer identity, and dates at UTC;
- every path: it refuses `workspace/` and binaries;
- added text and commit messages, against the file named by `git config laniakea.forbiddenPatternsFile`.

On failure:
- It fails closed when that setting is unset, or the file is missing or has no active pattern.
- It strips CR from patterns, because a CRLF patterns file otherwise silently matches nothing.
- It prints path and line, never the matched text.

The patterns file lives outside the repository. It holds the maintainer's private identifiers: real name, personal emails,
private project names and local path roots. It never holds the repository's own account handle, which the repository names
legitimately. It is never committed, since a list of identifiers would leak them.

Tests prove the hook against a planted marker, a CRLF patterns file, a missing file, and a comment-only file.

**P7. Leak gate before every push.** This manual gate is the control; the hook is a convenience, since hooks can be missing,
bypassed or misconfigured.

```bash
p="$(mktemp)"                                                          # outside the repository
tr -d '\r' < "<patterns-file>" | grep -Ev '^[[:space:]]*(#|$)' > "$p"
git log --all --format='%an|%ae|%cn|%ce' | sort -u                     # only the repository identity
git log --all --format=%ad --date=format:%z | sort -u                  # only +0000
git log --all --name-only --format= | sort -u                          # review every path
git log --all --format=%B | grep -c -i -E -f "$p"                      # 0
git grep -l -I -i -E -f "$p" $(git rev-list --all)                     # prints nothing
rm -f "$p"
```

Also review tag metadata with `git for-each-ref --format='%(taggername)|%(taggeremail)|%(taggerdate)' refs/tags`.
Screenshots come from the sample only: no window titles or local paths, and metadata stripped.

**P8. Validation on a private project.** Run `up` against a real project. Its results never enter this repository (D6).

Check isolation:
- the project's `git status --short` is unchanged;
- no file outside `Intermediate/Build/BuildRules/` is newer than the run start;
- the project's makefile hash is unchanged.

## Test-first and verification plan

### Red evidence

Each case captures a wrong behaviour today.

| Case | Wrong behaviour today |
|---|---|
| R1 module drill-down | No tool shows plugin -> module -> build edge together |
| R2 stale build edge | A dependency removed from `Build.cs` must disappear after regeneration |
| R3 stale run | Build inputs change after a run, and the old graph is served without warning |
| R4 not-in-target plugin | A plugin outside the target reads as nonexistent |
| R5 plugin dependency | A declared `.uplugin` dependency has no edge |
| R6 project-side write | Nothing proves the tool left the analysed project unchanged |
| R7 private data in a push | Nothing stops project data reaching public history |

Permanent guards, each observed failing first:
- schema golden test;
- stale edge, and the stale-run banner;
- refusal of an export that names another project;
- `requires` kept separate from `depends.rollup`;
- a failed run keeps `latest.json` on the last good run;
- no absolute path in `fixtures/`;
- the hook cases from P6;
- the viewer renders `fixtures/generic.graph.json` with non-Unreal levels (D3);
- the isolation snapshot on the sample: only `Intermediate/Build/BuildRules/` may change. This needs an engine; without one it
  reports an explicit skip.

Reviewer-checked judgements: the hierarchy feels navigable, and screenshots and README contain no identifying data.

### Green evidence

On the sample with a real engine, then on the private project (P8):

1. Plugins and their modules appear from `.uplugin` and the export.
2. A private module dependency shows as `depends.private`.
3. A plugin shows its declared `requires` edges with their allow lists, apart from `depends.rollup`.
4. Removing a dependency from `Build.cs` removes the edge after `extract`.
5. Editing a `Build.cs` after a run makes `serve` mark the run stale.
6. Plugins outside the target show as `not-in-target`. The manifest names Client and Server as not analysed.
7. Navigation through project, plugin and module scopes, with edge filters and the target picker.
8. Frame time on the private project's largest scope, and on synthetic graphs of 500 and 2,000 nodes labelled as synthetic.
9. Isolation per P8.
10. The P7 gate passes.

Command already proven by hand, with `<dotnet>` being the bundled runtime, `DOTNET_ROOT` set to its folder and
`DOTNET_MULTILEVEL_LOOKUP=0`:

```text
<dotnet> <engine>/Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll -Mode=JsonExport <Target> Win64 Development
  -Project=<project>/<Name>.uproject -OutputFile=<out>/<Target>.json
```

## Documentation plan

At implementation, durable content moves out of this file, and the file is then deleted:

- `docs/architecture/structure.md`: purpose, boundaries, composition, invariants, and decisions D1-D6 with their reasons.
- `docs/architecture/graph-model.md`: the semantics in `## Graph model`. The schema keeps the shapes.
- `docs/architecture/unreal-profile.md`: the engine facts the profile is built around (export fields and defects,
  project-side writes, single instance, .NET launch, engine association, the compile-database hazard).
- `docs/architecture/diagrams/main.md`: the Decision diagram.
- `docs/prior-art.md`: the reuse rationale and sources from evidence.md.
- `docs/publishing.md`: the P6 hook and the P7 gate.
- README: the first minute, `python laniakea.py up <project>`.

Code, tests and stable docs never point at a todo file.

## Rollout and rollback

Nothing outside the clone changes, except UBT's rules cache in the analysed project. Rollback is deleting `workspace/`. A
published repository cannot be fully unpublished, so P7 runs before every push.

## Completion criteria

- Red cases observed failing first, then green; permanent guards pass with `python -m unittest`.
- Green items 1-10.
- P7 passed for every push.
- The documentation plan is done and this file is removed.

## Review record

### 2026-11-03 - Plan published

- **Origin:** an investigation and architecture review on 2026-11-02 against UE 5.8.3 and a private validation project. The
  private receipts stay with that project (D6); this file keeps only their generic results.
- **Change:** D4 replaces the in-project clone with the black-box workspace. Four things go with the old layout: the
  in-project ignore rule, a read-only nested clone, project-side configuration, and the staleness protocol for an export the
  project produced. The tool now runs the export itself and records input hashes.
- **New evidence from source:** UBT writes the project rules assembly after a rules change, QueryTargets writes into the
  project unless given `-Output`, JsonExport is single-instance, and `-Log` moves the UBT log.
- **Carried over from the review:**
  - The build graph comes first, and M1 does not depend on M2.
  - `requires` stays apart from `depends.rollup`.
  - Scope that was not analysed is explicit.
  - Clang facts are never labelled `verified`.
  - Graphviz is the fallback, and elkjs is deferred.
