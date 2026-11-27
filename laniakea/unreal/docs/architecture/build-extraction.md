# Build extraction

Build inputs, target selection, Unreal Build Tool and normalization of the module graph.

Engine citations are paths under `Engine/Source/Programs/UnrealBuildTool/` unless stated, read at UE 5.8.3.

## Contents

- [Inputs](#inputs)
- [Build context](#build-context)
- [Finding the engine](#finding-the-engine)
- [Running UBT](#running-ubt)
- [What UBT writes into the project](#what-ubt-writes-into-the-project)
- [Input comparison domains](#input-comparison-domains)
- [External dependency ownership](#external-dependency-ownership)
- [From export to graph](#from-export-to-graph)

## Inputs

- The `.uproject`: its `Modules[]`, `Plugins[]` and `EngineAssociation`.
- Every `.uplugin` under `<project>/Plugins`. A folder that holds a descriptor is not searched deeper, as in the
  engine.
- Unreal Build Tool's evaluated module graph of one target, from `-Mode=JsonExport`.
- The project's targets and their types, from `-Mode=QueryTargets`.
- Project-owned `Binaries/Win64/*.target` receipts select build context as described below.
- Build inputs for freshness: the `.uproject`, each `.uplugin`, and every `*.Build.cs` and `*.Target.cs` under `Source/`
  and `Plugins/`.
- Authored C++ source/header contents participate in freshness for native-symbol runs and explicitly requested source-health
  runs, including declared project plugin junctions. Health-only freshness conservatively includes out-of-target source
  under the requested prefixes. Ordinary
  module-only runs fingerprint build inputs and receipt metadata without scanning C++ bytes.
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

A receipt change is an input event, not a confirmed successful-build notification. IDE tooling can refresh receipts without
a normal compilation, as reported in Epic's [UBT skip-build receipt discussion](https://forums.unrealengine.com/t/ubt-rewrites-the-target-receipt-on-every-skipbuild-run-breaking-buildgraph-timestamp-checks/2776175).
Native Auto eligibility uses validated receipt/product context; source changes and explicit requests remain independent
reconciliation triggers.

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

## Input comparison domains

Live change inspection compares recorded build rules, descriptors and receipt fingerprints independently of C++ coverage.
Receipt fingerprints include modification time, so a byte-identical rewritten receipt is a **build evidence** change;
it proves neither edited source nor a successful compilation. Added/modified/removed counts describe input paths, not modules.

C++ comparison requires a recorded native or completed duplication corpus and the same currently monitored prefixes,
exclusions and project/Engine roots. Off choices, unavailable tools, absent baselines and changed scopes do not manufacture
file additions or removals. Native comparison includes previously recorded external inputs, not every potentially reachable
header. Only proven absence is removal; unreadable inputs remain failures. Known files use existing root-relative navigation;
removed or unmapped files have no source link.

Configuration and tool/environment values participate in monitoring identity but lack a per-input published baseline.
They remain explicitly unattributed context rather than invented file edits. Guidance says recorded architecture/references
or duplication evidence may need rechecking; changed inputs are not new dependency facts or Review findings.
The [monitoring owner](../../../docs/architecture/monitoring.md#input-change-comparison) defines lifecycle, limits and cached reads.

## External dependency ownership

The profile owns provider attribution in [external.py](../../external.py); the viewer consumes ordinary
containment and reference metadata. Exported module directories and owning plugin descriptors take precedence. A
module physically under Engine stays under its Engine/plugin owner. Referenced directories under
`Engine/Source/ThirdParty` retain that folder context, including a vendor folder for a header without a known module.
Engine folder identities occupy a separate namespace from project plugin folders. A foreign exported module does not
become Engine-owned merely because it has no plugin descriptor.

UBT compiler actions can identify compiler and Windows SDK roots in their recorded root table. The explicitly selected
LLVM resource directory identifies compiler-supplied headers. Referenced providers appear under Toolchains & SDKs,
shared by all consumers. Attribution follows those roots, not include spelling, a namespace or a header basename.
Missing provider evidence retains an explicitly unclassified external boundary. Provider directory nodes are not build
modules and do not create missing-module-dependency review notes for ordinary compiler facilities.

Normalization preserves each original target declaration's identity and recorded source coordinates before abstracting
its endpoint. Semantic relations deduplicate repeated observations by their original identities, so two external bases
do not merge merely because their displayed owner is the same. Calls and other references retain their project call-site
coordinates separately. Declaring locations can be inline definitions; the native compiler owns the recorded location.
This records only declarations reached by project analysis, not an index of external implementations or their dependencies.

Additional source-root aliases belong to the immutable run and remain in the ignored workspace. Serving advertises them
with that run so exact declaration links do not depend on a later toolchain selection. Unknown or absent roots remain
explicit and unlinked; older runs are not reclassified in the viewer. Input/tool validation, successful-build selection,
module-only isolation and publication refusal belong to the
[native analysis contract](native-analysis.md#native-symbol-analysis). Provider lookup and declaration
metadata reuse are scoped to one normalization, not a second persistent ownership database.

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
  [the viewer contract](../../../../viewer/docs/architecture/map-navigation.md#centered-overview-and-configuration).
  Descriptor discovery, explicit enable/disable declarations, `EnabledByDefault`, evaluated module presence and observed
  code references describe different evidence. Project configuration is not the exhaustive list of enabled or available
  plugins: target rules and defaults can also participate. The profile does not infer complete effective enablement;
  content-only and otherwise unobserved target membership remain unknown.
- **Summaries.** The profile writes no summary edges; each scope makes `depends.rollup` and `requires.rollup` from the
  declared edges ([graph-model.md](../../../docs/architecture/graph-model.md)). The profile only labels them.
- **Status.**
  - A project module or plugin absent from the export is `not-in-target`.
  - A plugin without modules is `not-analysed`.
  - The export has no plugin field, so a content-only plugin's presence in the target cannot be told.
