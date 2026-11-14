# Explore and review a project

Trace dependencies to source, explore public contracts and inspect the evidence behind a connection.

## Contents

- [Open a project](#open-a-project)
- [Read and navigate the map](#read-and-navigate-the-map)
- [Trace a dependency to its cause](#trace-a-dependency-to-its-cause)
- [Find the public contract and its implementation](#find-the-public-contract-and-its-implementation)
- [Investigate a suspicious relationship](#investigate-a-suspicious-relationship)
- [Use architecture review](#use-architecture-review)
- [Collect source duplication](#collect-source-duplication)
- [Account for missing information](#account-for-missing-information)

## Open a project

Run `python laniakea.py up path/to/YourProject.uproject` for module dependencies and plugin descriptors.
Later, `python laniakea.py up` or `make up` extracts the newest project again; `python laniakea.py serve` reopens published maps and
checks freshness without extracting. The default address is **http://127.0.0.1:8737/**. Use `--port <n>` to change it,
or `--port 0` for a free port if the default is occupied.

The latest usable successful-build receipt selects target/configuration; `--target <name>` fixes the target.
Without a usable receipt, module extraction uses Development with the explicit target, or Editor by default.
Receipts select build context, not historical sources: the graph describes current rules and sources. See
[build-context selection](architecture/unreal-profile.md#build-context).

For namespaces, classes, functions and static references, supply local LLVM 21.1.8 tools and request native analysis:

```text
python laniakea.py setup-symbols --libclang <llvm>/bin/libclang.dll --resources <llvm>/lib/clang/21 --compiler <llvm>/bin/clang-cl.exe
python laniakea.py up --symbols
```

Setup copies tools into `workspace/` without downloading. The optional `--compiler` enables preprocessing-validated
reuse. Pass `--symbols` for every native extraction. Native analysis uses an
isolated copy, reports timings/diagnostics and can be expensive. Failed tool/build-context checks or compiler errors
leave the previous map available. Omit `--symbols` for module exploration. See
[native analysis](architecture/unreal-profile.md#native-symbol-analysis) for isolation and coverage.

## Read and navigate the map

Choose **galaxy** for the Engine-centered overview. Rings are expandable groups, filled markers are leaves, boxes
are source organization and diamonds are external boundaries. The **Type icons** key distinguishes modules, plugins,
namespaces, classes and callables. Other layout modes keep separate saved arrangements.

| action | result |
|---|---|
| Wheel over a group or file | Reveal or fold detail gradually, one layer at a time |
| Drag empty space | Fly through the map |
| Hover a star or connection | Trace references without selecting |
| Click a star or wire | Inspect source context and exact references |
| Double-click a group | Open or close it directly |
| `/`, then a name, qualified name, signature or header path | Find entities; arrows choose, Enter opens |
| Arrow keys with the map focused, then Enter | Navigate stars and open groups |
| `+` or `-` with the map focused | Zoom; Ctrl+wheel remains browser zoom |
| Breadcrumbs or Up | Return through navigation contexts; earlier ancestors have a disclosure |
| Close inspector, Escape or Clear selection | Close inspection; the close button stays available while scrolling |
| Drag a star or its name | Arrange it; a constellation moves its contents too |
| Fit map | Return to the overview without moving stars |
| Reset layout | Confirm before clearing the current mode's saved positions |

Hover colors are relative to the card's named focus: cyan outgoing, amber incoming, violet within/self. Wire focus
can change near the opposite endpoint. Idle wire colors describe types listed in **Browse & filters**. Crossings are
not junctions; click overlapping wires to choose a named pair and inspect both directions.

**Inspector** has two tabs: **Review** explains findings and decisions; **Details** shows source information and
all references. Switching retains scroll, loaded pages and unfinished reasons. Use arrow keys, Home or End between tabs.
On narrower windows, the findings list and inspector share the available space; reopening either retains the inspection.

**Project** inspects source/configuration context. **Config marks** outlines explicitly listed targets, without
implying compilation or runtime use. Plugin-to-plugin dependencies remain wires.
Positions save in the workspace per project/layout mode and survive reload, extraction and restarts while IDs remain
stable. Distant detail is released without losing arrangements. Exact references use Previous/Next pages.
If saved file markers overlap, the toolbar reports the count. **Arrange files** repacks the current source owner into
Public and implementation bands after confirmation; other scopes and layout modes stay fixed.

## Trace a dependency to its cause

Open the [synthetic sample](../sample/SampleProject/SampleProject.uproject) with
`python laniakea.py up sample/SampleProject/SampleProject.uproject` when its Engine resolves.

1. Open the `SampleGameplay` module and hover its connection toward `SampleCore`. Read the direction and reference types.
2. Inspect the public module dependency. Open its `Build.cs` link and check the evaluated declaration.
3. With `--symbols`, find `FSampleGameplayProcessor::Process`. Its implementation calls `FSampleProcessor::Process`
   in `SampleCore`; inspect the exact call and source location.

Follow an exact row to reveal original owners behind a grouped connection. Native rows distinguish the referring
location from the target declaration. Build declarations and static calls are different evidence; neither is a runtime trace.

## Find the public contract and its implementation

In `SampleGameplay`, open **Public** -> `SampleGameplayTypes.h` -> `FSampleGameplayProcessor` -> `Process`.
The header exposes `FSampleProcessor` and `FSampleId` from `SampleCore`, explaining this public dependency.
Inspect the member's declaration and definition links to reach its header and private `.cpp` implementation.

Files organize navigation; namespaces and classes retain C++ ownership. A method remains one symbol across its
header declaration and `.cpp` definition. Private helpers stay with their recorded owners and remain explorable.
**Public** and **Private implementation** describe source organization, not member access or abstract interfaces.
Recorded signatures and access appear on hover or in Details.

## Investigate a suspicious relationship

Inspect original endpoints, reference type, source and selected build context before judging a connection.
The sample's `SampleEditor` legitimately depends privately on `UnrealEd`: its descriptor records an Editor module.
High connection counts can reflect an intended integration point.

| question | evidence and limits |
|---|---|
| Is there a module cycle? | Follow original module build-dependency edges back to the start; crossings and reciprocal calls do not prove a build cycle |
| Does runtime code depend on Editor code? | Check descriptor kinds and target conditions; an Editor-target snapshot does not establish a Game-build dependency |
| Should a public dependency be private? | Inspect public headers and rules; private-only observations may miss other headers/configurations |
| Is module access supported? | Inspect the exact call and evaluated dependency path; public exposure can legitimately supply access without a direct entry |
| Is a hub over-coupled? | Inspect incoming/outgoing owners and responsibilities, not counts alone |

Descriptor `kind` (Runtime/Editor) differs from UBT `type` (CPlusPlus/External). Check the descriptor if kind is missing;
do not infer it from a name. Native exact-call rows explain recorded module access and public/include-only paths.
Known supporting paths are ordinary context. A complete recorded access closure without a path can produce a candidate,
not a violation. Incomplete or legacy evidence and include-only static linkage remain unverified; see Review's Policy &
availability. This does not prove binary linkage, runtime behavior or public API correctness. Runtime/editor and coupling
judgements still require manual investigation.

For UE rules, see Epic's [module guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-modules)
and [module properties](https://dev.epicgames.com/documentation/en-us/unreal-engine/module-properties-in-unreal-engine).
Apply them to the project's intended boundaries and actual target conditions.

## Use architecture review

1. Review runs automatically. Its button shows checking, failure or finding counts across the recorded project.
   Open it for the list and coverage; closing the list keeps markers visible. Uncheck **Review this snapshot** to disable it.
2. Follow amber triangle badges / `?` wires for candidates, or red stop signs / `!` wires for policy violations.
   Hover explains the concern, including when the other endpoint is
   off-screen. Click the wire, a marked star or a finding in the Review list. The **Review** tab shows the rule, original
   affected modules, limits and guidance. Its count applies to the current inspection; Review shows the project total.
   Open **Exact evidence** for source links, or switch to **Details** for ordinary references and endpoint navigation.
3. Use **Accept risk** or **Not relevant**, optionally recording a reason. The finding leaves active markers/list.
   **Show acknowledged** retains inspection and **Reopen**; acknowledgement never means fixed.
4. For project constraints, open **Policy & availability**, edit the shown local JSON path and use **Recheck**.
   Adapt the [synthetic policy](../fixtures/review.rules.json); inspect its resolved modules before trusting results.

Defaults produce yellow review candidates. Red violations need applicable configured constraints; the tool does not
decide a project's intended architecture. See [rule meaning, coverage and saved decisions](architecture/review.md).

## Collect source duplication

Supply the unpacked [PMD 7.29.0 distribution](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_installation.html)
and a JDK 11+ locally, then explicitly request strict C++ duplication:

```text
python laniakea.py setup-health --pmd <pmd-bin-7.29.0> --java <jdk>/bin/java.exe
python laniakea.py up --health duplication
```

Add `--symbols` to retain native classes/functions in a newly extracted map. Without it, the new map is module-only.
Use repeated `--health-scope Source --health-scope Plugins/Example` to limit the scan. The default collection floor is
100 tokens per occurrence; `--health-minimum-tokens <n>` changes that floor. Failed tools or source processing retain
the last good map and identify the diagnostic log. Narrow scope explicitly rather than silently ignoring a failed file.

Yellow **Duplication** candidates mark recorded files or modules. Click a marked item or Review-list entry, then open
**Exact evidence** for paged source ranges and editor links. These matches can be intentional or in inactive branches;
inspect ownership before refactoring. A stale snapshot warns that current coordinates may have moved. No duplication
wires are invented. Accept/reopen decisions use the existing Review workflow.

Opening a map never runs PMD. Later extractions must request health again; ordinary module exploration needs neither
Java nor LLVM. See [collection boundaries and costs](architecture/unreal-profile.md#source-duplication).

## Account for missing information

Check **Analysis coverage**, target/configuration and freshness. Other targets are outside a run; regenerate stale
snapshots before drawing conclusions about newer sources. No recorded incoming references does not mean unused code.
Outside-target or unanalysed status does not prove that configuration disabled a plugin.

Hover separates current-view counts from all recorded totals. Configuration is a numerical subset; internal,
beyond-view and filtered references remain separate in the summary. Engine internals stay at module/plugin boundaries.
Engine ThirdParty follows recorded Engine ownership; Toolchains & SDKs follow build/toolchain roots. Unknown suppliers
remain unclassified.

Calls resolve static declarations, including for virtual calls; runtime/indirect dispatch is not analysed.
Enum/value and local-variable stars are not indexed. Member summaries and macro provenance are observations, not
complete coverage. See the [coverage contract](architecture/graph-model.md#coverage) and
[Unreal profile](architecture/unreal-profile.md).
