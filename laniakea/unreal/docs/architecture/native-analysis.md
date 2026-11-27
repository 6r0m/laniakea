# Native C++ analysis

Compiler input preparation, isolated indexing and enrichment of the recorded graph.

## Contents

- [Compiler-facing preparation](#compiler-facing-preparation)
- [Native symbol analysis](#native-symbol-analysis)

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
`--symbols` makes one extraction require this path. The [background check policy](../../../docs/architecture/monitoring.md#requested-checks) can
resolve native Auto for a new project; module-only extraction does not load or validate an installed compiler.
An explicit native request without tools or usable build context fails visibly and retains the published run.

With tools and usable build context, `compiler.py` synchronizes a marked, incremental target copy. It refuses an unmarked
destination or a copy overlapping the analysed source tree. Source directories survive the asset/cache denylist; secrets,
Windows device names and large assets are excluded. Only files in the previous copy inventory may be removed. UBT exports
from the original and copy must agree on dependencies, definitions and PCH settings after root normalization.
This incremental scratch copy is not a retained historical build snapshot. Publication still validates the current source
and build context; editing the original during analysis can supersede the copied candidate.
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
[continuous-map contract](../../../../viewer/docs/architecture/map-navigation.md#continuous-map).

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
[dependency_access.py](../../dependency_access.py). Direct dependencies are normal. Indirect access permits
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

The optional [review adapter](../../review.py) consumes those published notes and declared public/private
module dependencies. Its defaults exclude descriptors, include-only/dynamic-load relations, semantic call cycles and
unrecorded boundary internals. Native-note absence does not establish exhaustive coverage. Review interpretation and
decisions are owned by [architecture review](../../../docs/architecture/review.md); this adapter invokes neither UBT nor native tools.

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
