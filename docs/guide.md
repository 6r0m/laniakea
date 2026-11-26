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

Use the [Make shortcuts](../Makefile) (`make help`) to build a map, then open the saved result. For Python commands,
options and defaults, run `python laniakea.py --help` or `python laniakea.py <command> --help`.

`up` opens the saved map immediately and monitors the selected target. For a new project, the initial build records
recommended checks and can already collect duplication evidence; `up` starts the remaining available C++ checks in the
background. Tools must be installed locally, and native indexing needs a usable successful-build receipt. Laniakea does
not automatically build your project or install tools. A saved run does not prove current sources compiled.

On first opening, **Checks** explains the displayed map's recorded coverage, optional checks that are Off and the next action.
It waits while you read another panel or interact, and remembers presentation or dismissal for that project in this browser.
**Recorded checks** lists coverage for the displayed map. Expand a check to see its mode, setup and diagnostics.
Hover over or focus the question mark beside a description to open a popup about why the check matters and how it collects evidence.
On a touchscreen, tap the question mark.
During a run, the panel shows the active phase, progress and
elapsed job time. C++ unit counts measure
that phase only; duplication and validation use an indeterminate bar. The Checks control retains progress when the panel closes.
Recorded coverage stays beside the attempt phase and describes the displayed map.
The first-opening guide offers **Back to map**. **Skip for now** or **Stop checks** pauses owned background work and
retains the previous map. These controls do not interrupt the earlier foreground build command.
Choose **Recheck enabled checks** to resume when inputs have settled. Later source edits or build changes can still supersede a long
scan. **Retry** retries a failed attempt; unchanged failures otherwise remain recorded.
Auto uses available prerequisites; On makes a check required; Off explicitly skips it. Choices apply only when a validated
map publishes. Failed or cancelled attempts keep the previous saved settings. Existing projects retain their recorded
choices; **Run recommended checks** explicitly applies Auto and requests checks using available prerequisites. It does not
install tools, build the project or guarantee completion. Off checks have not verified their prerequisites.
In live mode, expand an optional check to change its mode. **Apply and run** submits edited choices.
**Recheck enabled checks** keeps the current modes and appears below the recommended action when Auto is available.
**Recheck enabled checks automatically** monitors enabled checks. A saved-only view shows recorded modes as text.
Open **Review** from the toolbar to inspect recorded findings.

Keep exploring the recorded map while editing. The footer change summary opens **Checks**, where live **Input changes**
shows comparable inputs and **Show paths** lists added, modified and removed files. It also explains unmonitored or unavailable
source coverage; **Changes: limited scope** does not mean all C++ files were checked. **Build evidence** can mean a rewritten
receipt, not edited code or a successful build. These are recheck
hints, not architecture findings. Recheck or Retry when ready; paging does not start checks or enable Off modes.

The project picker shows the active project's recorded build target, platform and configuration. The scope path starts at
**Overview**. Use **Browse** to inspect stars and constellations in the current scope, **Filters** to choose which
connections and outside nodes appear, and **Fit overview** to return to Overview.
**Up** appears inside a scope. **View** groups map display and arrangement settings. Selecting a star or connection
opens Inspector directly. The map readout offers **Inspect selection** when the selected item is still active and Inspector
is closed. Use the readout's close button to clear the selection or trace.
The footer opens input changes and coverage details.

For duplicated code, choose **Compare matches** in the selected finding to read two ranges together. A file row's eye icon
previews just that range. The editor and copy icons open VS Code or copy its path. Comparison temporarily covers the central
workspace, keeping the selected finding in Inspector. The comparison shows the total code locations and the matches currently
displayed. Use **Previous match** / **Next match** or each pane's selector to reach other locations. **Back to map** or Escape
returns to the same view. Code is read-only; matching lines are highlighted only when the current file matches its recorded
hash. Changed or unavailable files explain why code cannot be shown.

Saved changes appear without fitting the camera or losing pins, filters or surviving focus. Updates wait during drags,
position saves, Check edits and Review drafts. Other registered targets stay inactive until explicitly activated in Checks;
browsing a deep link alone does not activate them. Stop the foreground viewer with Ctrl+C or `make down`.
`python laniakea.py up --no-watch` opens saved maps without scanning sources or starting checks.

For C++ depth, register LLVM 21.1.8 tools locally:

```text
python laniakea.py setup-symbols --libclang <llvm>/bin/libclang.dll --resources <llvm>/lib/clang/21 --compiler <llvm>/bin/clang-cl.exe
```

The optional compiler enables preprocessing-validated reuse. Use Checks for background acquisition, or `--symbols` on a
build for immediate required native extraction. Native work uses an isolated copy and can be expensive. See
[native analysis](architecture/unreal-profile.md#native-symbol-analysis) for isolation and coverage.

## Read and navigate the map

In **View**, choose **Orbit** for a ring arrangement or **By connection** to place related stars closer together. The map
reports when By connection uses Orbit because the overview is too large or has no connections between stars. Orbit
uses the project's declared center for a new arrangement when available. Existing modes keep separate saved positions,
and **More layouts** offers Dependency hierarchy, Grid and the other orbit mode. **Map guide** explains star shapes, type icons,
trace colors and controls.

| action | result |
|---|---|
| Wheel over a group or file | Zoom around the pointer and reveal or fold detail one layer at a time |
| Drag empty space | Fly through the map |
| Hover a star or connection | Trace references without selecting |
| Click a star or wire | Inspect source context and exact references |
| Double-click a group | Open or close it directly |
| `/`, then a name, qualified name, signature or header path | Find entities; arrows choose, Enter opens |
| Arrow keys with the map focused, then Enter | Navigate stars and open groups |
| `+` or `-` with the map focused | Zoom; Ctrl+wheel remains browser zoom |
| Breadcrumbs or Up | Return through navigation contexts; earlier ancestors have a disclosure |
| Close inspector, Escape or the map readout's close button | Close inspection; the inspector close button stays available while scrolling |
| Drag a star or its name | Arrange it; a constellation moves its contents too |
| Fit overview | Return to the overview without moving stars |
| Reset saved positions | Confirm before clearing the current layout's saved positions |

Search results, Follow, Fit overview and presentation-group breadcrumbs ease to the destination and can be interrupted by
wheel, drag, clearing the selection, Escape or a newer selection. Wheel and drag themselves remain immediate. Ordinary scope
breadcrumbs open the target scope directly. With reduced motion enabled, navigation jumps directly.

Hover colors are relative to the card's named focus: cyan outgoing, amber incoming, violet within/self. Wire focus
can change near the opposite endpoint. Idle wires take the colors of the stars at their ends. Find reference types
in **Filters** and in the connection inspector. Crossings are
not junctions; click overlapping wires to choose a named pair and inspect both directions.

**Inspector** has two tabs. **Review** lists related findings and opens the selected finding's evidence. Expand **Review
decision** to record or reopen a decision. **Details** provides source actions, declaration context and recorded relationships.
Switching tabs retains scroll, loaded pages and unfinished reasons. Use arrow keys, Home or End between tabs.
**Unsaved decisions** in Review lets you resume, copy or discard draft reasons after leaving an inspection. Drafts stay in
the current viewer session and survive refreshing findings. If an action would hide the draft, Review asks before discarding it.
On narrower windows, the findings list and inspector share the available space; reopening either retains the inspection.

**Project** inspects source/configuration context. **Outline project-listed targets** outlines explicitly listed targets, without
implying compilation or runtime use. Plugin-to-plugin dependencies remain wires.
Positions save in the workspace per project/layout mode and survive reload, extraction and restarts while IDs remain
stable. Distant detail is released without losing arrangements. Exact references use Previous/Next pages.
If saved file markers overlap, the toolbar reports the count. **Arrange files** repacks the current source owner into
Public and implementation bands after confirmation; other scopes and layout modes stay fixed.

## Trace a dependency to its cause

Open the synthetic project with the [Unreal sample walkthrough](../sample/SampleProject/docs/walkthrough.md). It also shows cross-branch
dependencies, review policy and duplicate source.

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
Known supporting paths are ordinary context. A complete recorded access closure without a path can produce a Review
warning. Incomplete or legacy evidence and include-only static linkage remain unverified. See Review's Policy &
availability. This does not prove binary linkage, runtime behavior or public API correctness. Runtime/editor and coupling
judgements still require manual investigation.

For UE rules, see Epic's [module guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-modules)
and [module properties](https://dev.epicgames.com/documentation/en-us/unreal-engine/module-properties-in-unreal-engine).
Apply them to the project's intended boundaries and actual target conditions.

## Use architecture review

1. Review runs automatically. Its button shows active errors and warnings for the recorded project.
   When findings are unavailable, the button identifies the Review state. Recorded Checks describe analysis coverage.
   Open it for findings grouped by severity. Closing the list keeps markers visible. **Review settings** contains coverage
   and the **Show Review findings** checkbox.
2. Red stop signs on stars and red connection halos mark errors against configured rules. Amber triangles and
   amber halos mark warnings to investigate. Hover explains the finding, including when the other endpoint is
   off-screen. Click the wire, a marked star or a finding in the Review list. The **Review** tab shows the rule, original
   affected modules, limits and guidance. Its count applies to the current inspection; Review shows the project total.
   Open **Exact evidence** for source links, or switch to **Details** for ordinary references and endpoint navigation.
3. Use **Accept risk** or **Not relevant**, optionally recording a reason. The finding leaves active markers/list.
   Open **Review settings** and turn on **Show acknowledged** to inspect or reopen the finding.
4. For project constraints, find the local JSON path under **Review settings > Policy & availability**. Edit that file
   and use **Refresh findings**.
   Adapt the [synthetic policy](../fixtures/review.rules.json); inspect its resolved modules before trusting results.

See [rule meaning, coverage and saved decisions](architecture/review.md).

## Collect source duplication

Supply the unpacked [PMD 7.29.0 distribution](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_installation.html)
and a JDK 11+ locally. Ordinary builds collect strict C++ duplication once those tools are registered:

```text
python laniakea.py setup-health --pmd <pmd-bin-7.29.0> --java <jdk>/bin/java.exe
make build
make up
```

Recorded check choices are retained on subsequent builds. Use `--symbols` for immediate required native acquisition.
Use the build command's health-scope options to bound the scan and its minimum-token option to choose the collection floor.
An omitted floor uses the provider default. `--health-heap-mib` overrides the Java heap ceiling; insufficient host headroom
refuses a fresh JVM without reducing coverage. A valid unchanged result can still be reused without launching Java.
With `--health duplication`, failed tools or source processing retain the last good map and identify the diagnostic log.
The default `--health auto` publishes a valid architecture map even if duplication acquisition fails; coverage and Review report
the failed, incomplete, unavailable or disabled check instead of claiming zero findings. `--health off` skips collection.
Narrow scope explicitly rather than silently ignoring a failed file.

Amber **Duplication** warnings mark recorded files or modules. Click a marked item or Review-list entry, then open
**Exact evidence** for paged source ranges and editor links. These matches can be intentional or in inactive branches;
inspect ownership before refactoring. A stale snapshot warns that current coordinates may have moved. No duplication
wires are invented. Accept/reopen decisions use the existing Review workflow.

Checks can run PMD in the monitored background. Missing tools remain visible as unavailable; no runtime tools are downloaded.
Use Off in Checks or `--health off` during a build to skip duplication.
See [collection boundaries and costs](architecture/unreal-profile.md#source-duplication).

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
