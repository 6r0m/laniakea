# Unreal profile

How `laniakea/unreal/` reads a project, and the engine behaviour it is built around. Engine citations are paths under
`Engine/Source/Programs/UnrealBuildTool/` unless stated, read at UE 5.8.3.

## Contents

- Inputs
- Build context
- Finding the engine
- Running UBT
- What UBT writes into the project
- Compiler-facing preparation
- Native symbol analysis
- From export to graph

## Inputs

- The `.uproject`: its `Modules[]`, `Plugins[]` and `EngineAssociation`.
- Every `.uplugin` under `<project>/Plugins`. A folder that holds a descriptor is not searched deeper, as in the
  engine.
- Unreal Build Tool's evaluated module graph of one target, from `-Mode=JsonExport`.
- The project's targets and their types, from `-Mode=QueryTargets`.
- Project-owned `Binaries/Win64/*.target` receipts select build context as described below.
- Build inputs for freshness: the `.uproject`, each `.uplugin`, and every `*.Build.cs` and `*.Target.cs` under `Source/`
  and `Plugins/`.
- Authored C++ source/header contents participate in freshness only for native-symbol runs, including code reached through
  declared project plugin junctions. Module-only runs fingerprint build inputs and receipt metadata without scanning C++ bytes.
- Native jobs hash the compiler's actual input buffers, including generated and external headers. External hashes enter
  manifest freshness; conflicting bytes for one external input abort normalization.

## Build context

`builds.py` chooses the newest usable receipt of a known project target, or the newest matching receipt when `--target`
is fixed. Its target, Win64 platform and configuration are passed to JsonExport. Validation checks project identity, target
type, engine major/minor/patch/changelist, a supported configuration and nonempty linked products, including a project product.
Every linked product must exist, be nonempty, stay in the project/engine logical namespace and be no newer than the receipt.
Project plugin junctions retain their logical project-relative paths. Equal timestamps across different contexts are refused
rather than arbitrarily selecting a target/configuration. Changing, adding or removing a receipt affects run freshness.
Receipt fingerprints include JSON bytes and modification time, since time participates in selection; ordinary build-rule
inputs use their file-content hashes. A receipt changing during fingerprinting is refused.

The manifest's `target.build_context` records the selection, root-relative receipt path, digest, receipt timestamp, engine
version and observed linked-product sizes/timestamps. Only a successfully published run retains this evidence. The pipeline
passes its previous manifest to the profile; the Unreal adapter can reuse its receipt-backed context if the engine, target and
linked-product metadata still match. A partial or unreadable replacement receipt remains a coverage limitation, not new success.
Retention covers the preceding published context; it cannot reconstruct a successful receipt overwritten before observation.

Without usable native or retained evidence, M1 keeps the explicit target or the existing Editor/Development default and
reports the missing successful-build context. This is not eligible evidence for class/function parsing. Receipt time is
metadata provenance, not proof of the exact time a full build finished; post-build steps may fail. Product metadata is an
availability/change check, not a binary content identity. A receipt does not bind current source, generated headers, response
files or compiler flags to the historical build. JsonExport describes current evaluated rules in the selected configuration;
it is not a historical source/dependency snapshot. M1 needs no rebuild to display those current rules.

Engine evidence: `Configuration/UEBuildTarget.cs`, `PrepareAndWritePartialReceipt`, writes to the normal receipt path with
empty build products on failure. Normal receipt generation is a write-metadata action depending on target outputs;
`Modes/WriteMetadataMode.cs` writes it after those prerequisites. `System/TargetReceipt.cs` owns field and path-variable formats.

## Finding the engine

1. `--engine <root>`, which is stored in the target.
2. Otherwise `EngineAssociation`, resolved the way `Engine/Source/Developer/DesktopPlatform/Private/Windows/` does:
   - launcher engines from `%PROGRAMDATA%\Epic\UnrealEngineLauncher\LauncherInstalled.dat`;
   - source builds from the `SOFTWARE\Epic Games\Unreal Engine\Builds` registry key.
3. An empty association means the project sits inside an engine tree, which is searched upward.

UBT needs the engine's bundled .NET; a system `dotnet` fails. The profile runs
`Engine/Binaries/ThirdParty/DotNet/<version>/win-<arch>/dotnet.exe` with the environment the engine's
`GetDotnetPath.bat` sets, choosing the newest bundled version. It calls `dotnet` directly rather than through `RunDotnet.bat`,
which would re-parse every argument through `cmd.exe`.

## Running UBT

- Every path passed to UBT is absolute: UBT changes its working directory before it writes outputs.
- Each call passes `-Log=<run>/ubt/<name>.ubt.log`. UBT also writes a structured `<name>.ubt.json` beside the log, so
  a log may never share a stem with an output.
- QueryTargets gets `-Output` and `-DontIncludeParentAssembly`. Without `-Output` it writes
  `<project>/Intermediate/TargetInfo.json` (`Modes/QueryTargetsMode.cs`).
- JsonExport is single-instance. Exit code 10 (`ConflictingInstance`) means another UBT is running; `extract` then
  fails with that reason instead of waiting.
- Exit 0 without the expected output file is a failure.

## What UBT writes into the project

Any UBT call with `-Project` refreshes these, measured on a fresh copy of the sample on 5.8.3. A project that has
been built once already holds them, and a run against such a project changed no file at all.

- `Intermediate/Build/BuildRules/<Project>ModuleRules.dll`, `.pdb` and `...Manifest.json`: the compiled rules
  (`Configuration/Rules/RulesCompiler.cs`).
- `Intermediate/Build/XmlConfigCache.bin`: the build-configuration cache (`Configuration/Xml/XmlConfig.cs`).
  `-XmlConfigCache=` can only load an existing cache, so it cannot be redirected.
- `Saved/UnrealBuildTool/BuildConfiguration.xml`: created empty when missing (`XmlConfig.cs`).

The engine integration test fails on any other change. A launcher engine's `-Mode=GenerateClangDatabase` is different
and destructive: `UEBuildTarget` forces the default intermediate environment on installed engines, so the mode
rewrites the project's live response files, and the next normal build recompiles. Laniakea never runs it on an
analysed project.

## Compiler-facing preparation

The Unreal adapter's `clangd.py` prepares tokenized forced-include arguments for text analysis. It does not run tools or
own graph publication. `commands.py` expands native Windows response files, preserves argument case, removes binary-PCH
and output-only options, and makes include paths absolute. Text PCH inputs retain their ordered generated definitions and
the include-search paths from their native PCH compilation action.

LLVM's driver can replace a forced header with an adjacent binary PCH. clangd-indexer subsequently disables binary PCH
use, which can silently discard that header's declarations. Preparing forced headers as direct cc1 text includes avoids
this substitution without renaming files or changing an analysed project. Argument case and ordering matter: `/FI` forces
a header, `/Fi` names preprocessing output, and `/fp:` controls floating-point behavior. The native regression reproduces
the lost-symbol failure with a synthetic adjacent PCH before checking restored symbols and references.

Compiler diagnostics and symbol/reference checks remain necessary even after successful tool exit. clangd's callable
reference flag alone is not proof of an actual call; the version-pinned SymbolCollector sets it from symbol kind.
Native AST validation is needed before such references can be labelled as statically resolved calls.

## Native symbol analysis

`tools.py` installs supplied LLVM 21.1.8 `libclang.dll` and resource headers into the workspace. Setup is explicit and offline;
extraction never downloads a tool. The installation records content hashes and checks them before use. Python uses LLVM's
stable C indexing API through `ctypes`, without a Python package dependency or a C++ parser in Laniakea.
`--symbols` opts one extraction into this path. Ordinary extraction does not load or validate an installed compiler.
An explicit native request without tools or usable build context fails visibly and retains the published run.

With tools and usable build context, `compiler.py` synchronizes a marked, incremental target copy. It refuses an unmarked
destination or a copy overlapping the analysed source tree. Source directories survive the asset/cache denylist; secrets,
Windows device names and large assets are excluded. Only files in the previous copy inventory may be removed. UBT exports
from the original and copy must agree on dependencies, definitions and PCH settings after root normalization.
`source_tree.py` constrains descriptor discovery, source fingerprints and copy reads to the physical project root plus
descriptor-owning plugin mounts under its logical `Plugins/` tree. Logical paths remain project-relative. An unrelated
external directory or file link, including a nested escape inside an otherwise declared plugin, is refused before its bytes
are read or copied. Unreadable retained directories fail visibly; containment cycles are not traversed repeatedly.

Inside that copy only, UBT `-Mode=Build -WriteOutdatedActions` exports current native unity/PCH actions without compiling or
linking. The target/configuration comes from the successful-build context; `-DisableAdaptiveUnity` avoids treating every
writable copied source as an edited working-set file. This changes batching, not the selected target/configuration.
`-NoUBA` disables distributed execution. The adapter checks the marker before starting UBT. It never generates a compiler
database or native build actions against the analysed checkout. The effective commands and tool identities stay in the run.

`native_index.py` collects compiler identities, declarations, references, base classes and overridden methods. File-local
identities include their logical source path, so equal basenames remain distinct. Macro scratch locations use the native
expansion location. A declaration's definition replaces its header location when available.

Call edges require both LLVM's actual call role and a matching native evaluated call-expression range. Address-taking,
`sizeof`, `noexcept`, requirements and type declarations remain references. Unsupported type/default-argument or initializer
contexts also remain references rather than acquiring an inferred call. Virtual-call targets name the statically selected
declaration; runtime dispatch is not analysed. Engine classes/functions collapse to their owning module/plugin; external
toolchain declarations form a separate boundary. Cross-module calls without a direct build dependency carry a review note
with transitive and public-exposure paths; this is not reported as a violation.

Native header-tool manifests map generated declarations back to their module, checked against JsonExport ownership.
Generated-only declarations do not become project stars; references to them keep their module endpoint.
If normalization maps both ends of a reference or semantic relation to the same owner and at least one original
symbol was not retained, it marks the reference internal to that owner. A retained class referencing its own type
is also internal: aliases, own-type fields and macro-expanded definitions describe that class rather than another entity.
Authored function recursion and function self-address references keep their resolved function endpoints and remain explicit.
References between distinct classes remain explicit. Canonical identities and compiler location/status are unchanged by this classification.
Module metadata distinguishes native compilation units, declarations reached through other units, and modules with no observed symbol
analysis. Execution, diagnostics and observed symbols do not establish complete relationship correctness.

Native compilers run in disposable, hidden processes with bounded timeouts. Concurrency is capped by available memory.
Each job retains compressed facts, diagnostics, elapsed time and peak working-set measurement. A worker failure, compiler
error, changed tool identity or copy-fidelity failure aborts publication and retains the previous published run.
Module-level exploration remains available without requesting symbols, with explicit missing-symbol coverage.

Native acceptance distinguishes execution, diagnostics, symbol ownership and relationship correctness. Synthetic compiler
controls cover calls versus references, inheritance, overrides and source coordinates. A selected real-project proof path
checks expected definitions and exact call sites; per-module coverage, worker diagnostics, extraction/repeat timings, peak
memory and artifact sizes remain in the ignored workspace. Passing viewer tests or parsing without errors cannot establish
complete relationship coverage. Private proof names, paths and identifying counts never enter tracked documentation.

Optional matching `clang-cl.exe` enables `symbol_cache.py`. Every reuse runs native preprocessing again, including header
search and negative `__has_include` probes. The key binds flags, tools, native adapter code and relevant compiler environment;
reuse also requires the same preprocessed output, an intact clean payload and identical bytes for every compiler input.
This retains exact source coordinates after comment-only edits. Volatile date/time macro expansion disables reuse. Long
Windows commands use response files; no expanded source dump is retained. Cached facts stay target-local in the workspace.
Scope normalization still runs against the current module graph. Cache misses fall back to native analysis; preparation
and write I/O failures are reported in worker metrics. Compiler errors never produce reusable facts.

## From export to graph

- **Owners.** A module's owner is the descriptor that lists it in `Modules[]`. A module the export has but no
  descriptor lists is placed by the nearest `.uplugin` above its folder. Engine modules are placed under their engine
  plugin the same way, or directly under the engine.
- **Folders.** Each folder between `<project>/Plugins` and a plugin's own folder becomes a `folder` node, nested as
  on disk; a plugin directly under `Plugins/` sits under the project. A folder is `in-target` when any plugin inside it
  is.
- **Dependency fields.** `PublicDependencyModules`, `PrivateDependencyModules`, `PublicIncludePathModules`,
  `PrivateIncludePathModules` and `DynamicallyLoadedModules` become the `depends.*` types.
  - UBT adds every public dependency to `PublicIncludePathModules` (`Configuration/UEBuildModule.cs`,
    `RecursivelyCreateModules`). An include-path edge is therefore drawn only where no dependency edge exists.
  - The export writes `InternalIncludePaths` from `PublicIncludePaths`, so that field is not consumed.
- **Descriptor dependencies.** Each `Plugins[]` entry with `Enabled` true becomes a `requires` edge carrying `Optional`
  and the platform, target and configuration allow and deny lists. An entry with `Enabled` false switches a plugin off,
  so it is recorded on the node as `disables` instead.
- **Overview presentation.** The profile names the existing Engine boundary as the optional layout anchor and identifies
  `requires` as configuration only when its original source is the project root. Plugin-to-plugin `requires` edges remain
  dependency declarations. This changes no node ownership or extraction depth; generic presentation behavior belongs to
  [the graph model](graph-model.md#centered-overview-and-configuration).
  Descriptor discovery, explicit enable/disable declarations, `EnabledByDefault`, evaluated module presence and observed
  code references describe different evidence. Project configuration is not the exhaustive list of enabled or available
  plugins: target rules and defaults can also participate. The profile does not infer complete effective enablement;
  content-only and otherwise unobserved target membership remain unknown.
- **Summaries.** The profile writes no summary edges; each scope makes `depends.rollup` and `requires.rollup` from the
  declared edges ([graph-model.md](graph-model.md)). The profile only labels them.
- **Status.**
  - A project module or plugin absent from the export is `not-in-target`.
  - A plugin without modules is `not-analysed`.
  - The export has no plugin field, so a content-only plugin's presence in the target cannot be told.
