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
- Source duplication
- External dependency ownership
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
- Authored C++ source/header contents participate in freshness for native-symbol runs and explicitly requested source-health
  runs, including declared project plugin junctions. Health-only freshness follows its collected prefixes. Ordinary
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
identities include their logical source path, so equal basenames remain distinct. Class/function IDs continue to derive
from those identities when containment changes. A conflicting identity or parent aborts normalization rather than
silently moving an existing symbol. Source files remain attributes, not canonical graph containers.
Unindexed helper cursors such as aliases can reuse a compiler USR across local scopes. Normalization keeps those
observations in their recorded file/parent context, retaining the original reference identity and declaration location;
they do not become stars. Shared namespaces do not select a reference endpoint's module by an arbitrary observed
namespace location. Published type/callable identities retain the strict collision guard.

`source_context.py` annotates native declarations with optional source partitions. Recorded authored header locations
take precedence over implementation locations; a public header keeps an out-of-line definition on the public surface.
Public/Private here describe observed source organization, independently of C++ member access, DLL exports or runtime
usage. Without a recorded header, an implementation uses its recorded source context; an unrecognized path remains
unclassified. Generated paths outside the module source directory never determine its source partition. Source
organization uses the short Public section label; the read index names exposed source roots from their recorded folder,
including snapshots carrying an older descriptive partition label. This does not restrict that section to headers.
Actual source subdirectories supply folder labels without interpreting names such as Tests or Verify. Only indexed declarations are
represented, not an exhaustive filesystem tree. Namespace partitions aggregate only uniformly classified children;
mixed or unknown namespaces remain visible. These annotations do not change semantic parents or reference identities.
The selected authored header is retained as an optional root-relative file location, independently of a definition's
implementation location. Equal basenames do not merge files. A namespace retains a common header hint only when all
its recorded direct declarations share that header; this does not assert that every reopening or include occurs there.
No association between a private helper and a public header is inferred from a matching basename or caller.
The disposable read index additionally derives concrete implementation-file navigation from recorded definitions
and reference locations. It uses source partition hints for visibility and can identify a definition in a different
file as implementation context without inferring C++ access. A mixed namespace is not assigned wholesale to its first
observed file. File exploration and its one-symbol definition links follow the generic
[continuous-map contract](graph-model.md#continuous-map).

Named, nested and reopened namespaces provide real owners between modules and their declarations. A namespace's new
graph identity combines its compiler identity with the owning module; the same shared namespace cannot merge modules.
Anonymous namespace identities also include the logical file containing that namespace declaration. This keeps equal
basenames in different directories separate and remains stable across separate and unity compilation. Shared-header
declarations retain their existing canonical identity: the map describes declarations, not separate runtime instances
of header-local code in every translation unit. Observed namespace locations select a source within the owning module;
if none was recorded, no namespace source link is invented. Engine-internal namespace trees are not expanded.

Compiler metadata distinguishes structs, unions, classes, callable kinds and lambdas. Where the API supplies them,
access, static/virtual/const properties and return/signature context are recorded. Defined types summarize observed
fields and callables by access after compiler-identity deduplication; fields are not individual stars or part of the
indexed child count. These summaries are observations, not a complete member inventory. Enum/value, local-variable and
statement stars are not indexed. Missing metadata on older runs remains unknown.

Definition promotion preserves the declaration location separately from the definition. Exact target declarations
retain their own coordinates, independently of the referring call/reference location. Macro scratch locations use the
native expansion location. A differing spelling/expansion location establishes macro expansion; otherwise origin is
explicitly unknown. This is provenance, never a reason to suppress a declaration or infer that it is generated.
Observed lambda closures retain compiler-derived IDs and callable ownership. Display labels use the initializer name
when recorded, otherwise a file/line/column label; signatures replace known compiler closure spellings and local roots
without changing identities or source coordinates. Unobserved initializer/unevaluated contexts are not complete coverage.

Call edges require LLVM's call role, an evaluated call-expression range and the indexing reference's compiler-selected callee.
Compiler-linked template specializations may match their originating template. An unresolved overload candidate is
a reference, not proof that its declaration was called; sharing a source range never establishes that identity. Address-taking,
`sizeof`, `noexcept`, requirements and type declarations remain references. Unsupported type/default-argument or initializer
contexts also remain references rather than acquiring an inferred call. Virtual-call targets name the statically selected
declaration; runtime dispatch is not analysed. Engine classes/functions collapse to their owning module/plugin; external
toolchain declarations form provider boundaries. The profile interprets evaluated module compile access in
[dependency_access.py](../../laniakea/unreal/dependency_access.py). Direct dependencies are normal. Indirect access permits
a public or private first dependency, followed by public dependencies; a recorded path is context, not a missing-direct
warning. Public include-only paths propagate include access without implying link dependencies. A virtual interface call
can use that interface access; static calls supplied only through include paths retain unverified linkage. The export does
not prove binary import/link environments, public API exposure correctness or runtime execution.

Only an exhausted, fully recorded compile-access closure with no dependency or include path produces a review note.
Missing boundary records or dependency fields produce unverified context instead, never a missing-dependency assertion.
Exact call inspection retains the access path or missing-coverage explanation. Callable sources require a recorded definition.
Instantiation-only call bodies remain exact references, but do not establish a reverse dependency from the generic
template's module to a type supplied by its consumer. Fixed calls in the authored template definition remain eligible.
These checks do not enforce a convention that every consumed module needs a direct Build.cs entry. Include paths are not
public/private build dependencies, and header availability alone does not prove that an external static function can link.

The optional [review adapter](../../laniakea/unreal/review.py) consumes those published notes and declared public/private
module dependencies. Its defaults exclude descriptors, include-only/dynamic-load relations, semantic call cycles and
unrecorded boundary internals. Native-note absence does not establish exhaustive coverage. Review interpretation and
decisions are owned by [architecture review](review.md); this adapter invokes neither UBT nor native tools.

Native header-tool manifests map generated declarations back to their module, checked against JsonExport ownership.
Observed class/struct definitions are resolved after the translation unit is parsed. A forward declaration in a
consumer does not acquire ownership of an available Engine or other-module definition. This resolves only types
already observed by the compiler; it does not index external implementation internals. A definition that changes an
observed compiler identity refuses publication rather than silently migrating the symbol.
An unrendered field, local or macro-spelled method first retains its nearest recorded class/function ancestor.
Only declarations without a retained semantic ancestor fall back to recorded module/provider ownership. Call-site and
target-declaration provenance remain exact even when the displayed endpoint is an enclosing owner.
References from distinct original source declarations remain distinct when their location and enclosing owner coincide.
Generated-only declarations do not become project stars; their references retain the recorded enclosing owner.
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
Compressed batch files close before their consumers normalize them, so a rejected batch cannot hold a Windows file
handle that prevents the run from being marked failed or masks the original diagnostic.
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

## Source duplication

`cpd.py` runs optional PMD CPD 7.29.0 over an isolated snapshot of source files in recorded in-target project modules.
`SourceTree` constrains physical reads to the project and declared plugin mounts; target excludes remain applicable.
Engine, build intermediates and out-of-target modules are not scanned. Explicit root-relative prefixes bound the corpus;
use target excludes for vendor source inside an otherwise selected module. This is raw-source analysis, independent of
LLVM and of which preprocessing branches compile. It does not infer function ownership from line proximity.

Offline `setup-health` copies the supplied PMD libraries and notices into the ignored workspace and compiles the small
CPD API adapter with a supplied JDK 11+. The installation pins hashes of libraries, adapter and Java executable. No host
installation, network download, source modification or tool invocation occurs during ordinary extraction or map opening.
See [third-party terms](../../THIRD_PARTY.md) and [operator commands](../guide.md#collect-source-duplication).

The adapter uses CPD's own token images for strict-match fingerprints and exports exact line/column ranges without source
text. Identifier/literal normalization is off. It verifies every input was processed and every match's token count and
identity agree. Lexical errors, missing tools, timeout, changing corpus or invalid evidence fail the requested run;
the previous published map remains available. No partial/empty-success fallback is permitted.

One corpus-wide result can be reused only for identical source hashes, membership/owners, scope, threshold and tool
identity. Adding or removing a file invalidates reuse. Compilation changes affect triage context and the selected module
corpus; raw token matching has no additional compiler context. The run records analysis time, file/group counts and reuse.
The Java heap is bounded to 1 GiB, execution to 15 minutes and artifact size to 32 MiB; limits fail visibly and can be
addressed by explicitly narrowing scope. Input snapshots and diagnostics remain in the run's ignored directory.

The manifest binds optional health observations by digest; pipeline validation precedes publication. Absence remains
compatible with older runs. [Review](review.md) interprets observations and owns thresholds/decisions independently of
extraction. Clang-Tidy complexity has not passed its real-context product gate and is not enabled.

## External dependency ownership

The profile owns provider attribution in [external.py](../../laniakea/unreal/external.py); the viewer consumes ordinary
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
module-only isolation and publication refusal remain the native extraction contract above. Provider lookup and declaration
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
