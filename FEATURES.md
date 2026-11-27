# Laniakea features

**Checks** collect evidence for a selected Unreal Engine C++ build. **Review** applies rules to that evidence.
The **map** shows where relationships and findings occur and lets you follow them to source.

## Contents

- [Analysis and checks](#analysis-and-checks)
- [Explore the architecture map](#explore-the-architecture-map)
- [Review errors and warnings](#review-errors-and-warnings)
- [Read the visual signals](#read-the-visual-signals)
- [Keep a map current](#keep-a-map-current)
- [Work locally and understand coverage](#work-locally-and-understand-coverage)
- [Try the sample](#try-the-sample)

## Analysis and checks

| Check | What it uses | What it records |
|---|---|---|
| **Module architecture** | Unreal Build Tool target discovery (`QueryTargets`) and evaluated rules (`JsonExport`), plus project and plugin descriptors | Project, plugin and module ownership, build dependencies and declared plugin requirements. This is the foundation of every published map. [Build extraction](laniakea/unreal/docs/architecture/build-extraction.md) |
| **C++ usage and references** | Optional LLVM **libclang** indexing from a successful build receipt and isolated compiler inputs | Namespaces, classes, callables, source locations, statically resolved calls, type and function references, inheritance and overrides. [Native C++ analysis](laniakea/unreal/docs/architecture/native-analysis.md) |
| **Duplicated code** | Optional **PMD CPD** over the selected C++ source corpus | Strict matching token sequences and exact source ranges. Comments or line layout can differ. Inactive code and intentional repetition can appear in matches. [Duplication acquisition](laniakea/unreal/docs/architecture/source-duplication.md) |

**Checks** shows what was recorded for the map on screen. For optional checks, **Auto** uses available prerequisites,
**On** requires the check, and **Off** skips it. Failed, incomplete, unavailable, and disabled checks have distinct
coverage states. Check completion describes evidence availability. Review reports the findings in that evidence.
[Check controls and setup](docs/guide.md#run-and-recheck-analysis) |
[Pinned tools and third-party notices](THIRD_PARTY.md)

## Explore the architecture map

### Move from overview to source

- **Zoom through ownership.** Wheel zoom follows the pointer and reveals nearby detail. Open constellations to
  move from project branches into plugins and modules, then into recorded source files, namespaces, types and
  callables. The overview groups references by the visible owners and keeps exact references available on demand.
  [Map and navigation](viewer/docs/architecture/map-navigation.md#continuous-map)
- **Find and open code.** Search names, qualified names, signatures, or source paths. Use breadcrumbs, **Up**, or
  **Fit overview** to return to context. Inspector shows recorded declarations and definitions with source links.
  Public headers and implementation files provide navigation views while C++ declarations keep their recorded owners.
  [Find public contracts and implementations](docs/guide.md#find-the-public-contract-and-its-implementation)
- **Navigate with the keyboard.** Use map focus, arrow keys, and Enter to move between stars and open groups.
  Use `+` and `-` to zoom or `/` to open search. [Map controls](docs/guide.md#read-and-navigate-the-map)
- **Inspect build context.** The project picker identifies the recorded target, platform, and configuration.
  **Project** shows descriptor evidence. Optional outlines identify explicitly listed targets. The map also shows
  referenced external providers such as Unreal Engine and toolchains when owner evidence is available.
  [Project configuration](viewer/docs/architecture/map-navigation.md#centered-overview-and-configuration) |
  [External boundaries](viewer/docs/architecture/map-navigation.md#external-boundaries)

### Trace and arrange

- **Trace a connection.** Hover for direction and counts. Select a wire and page through its original references,
  including their source and target owners and any recorded source locations. On overlapping wires, choose the
  named pair to inspect. **Filters** controls which reference types and external nodes appear.
  [Tracing and inspection](viewer/docs/architecture/inspection-review.md#tracing-and-inspection)
- **Arrange a view.** Choose **Orbit**, **Dependency hierarchy**, or **Grid** and move stars or constellation labels
  to save positions per project and layout. **By connection** uses a bounded layout on eligible overviews.
  **Arrange files** repacks file markers within the current source owner after confirmation.
  [Saved arrangements](viewer/docs/architecture/map-navigation.md#saved-arrangements)
- **Keep large views explorable.** The local **Cytoscape.js** viewer uses a **Flatbush** spatial index to keep
  nearby detail and fold distant branches. A disposable read index serves compact topology and exact-reference pages
  from the canonical graph. Source evidence remains available as levels open and fold.
  [Viewport and memory lifetime](viewer/docs/architecture/map-navigation.md#viewport-and-memory-lifetime) |
  [Graph read index](laniakea/docs/architecture/graph-model.md#read-index)

## Review errors and warnings

Laniakea's built-in Review evaluator checks the original recorded evidence for the selected build. Errors represent a
configured rule violation. Warnings identify evidence to investigate.

| Finding | Severity | Evidence to open |
|---|---|---|
| **Module dependency cycle** | Warning by default. Error when an applicable rule requires acyclic dependencies. | The module cycle and its declared build-dependency witnesses. |
| **Forbidden dependency direction** | Error when a configured rule forbids the recorded relation. | The affected module pair and matching public or private build dependency. |
| **Native call without recorded module access** | Warning when the recorded module-access closure is complete and contains no supporting path. | The static C++ call and recorded access evidence. A legitimate public dependency path can supply access. |
| **Duplicated code** | Warning for a matching token sequence in the configured scope. | Recorded files and line ranges. Review ownership and context before changing the code. |

Open **Exact evidence** from a finding. **Compare matches** opens up to two source ranges, side by side where space allows.
Single-range preview, editor links, and path copy are also available. Preview highlights matching lines only when the
current file matches its recorded hash. A changed or inaccessible file gets an explicit status.
[Finding inspection](viewer/docs/architecture/inspection-review.md#finding-inspection) |
[Source comparison](viewer/docs/architecture/inspection-review.md#source-comparison)

Use **Accept risk** or **Not relevant** to acknowledge a finding with an optional reason. **Show acknowledged** lets you
inspect and reopen it. Edit the target's local Review policy and choose **Refresh findings** to evaluate new constraints
against the same recorded map.
[Rules and evidence](laniakea/docs/architecture/review.md#rules-and-evidence) |
[Review policy](laniakea/docs/architecture/review.md#policy) |
[Review decisions](laniakea/docs/architecture/review.md#finding-evidence-and-decision)

## Read the visual signals

| Signal | Meaning |
|---|---|
| **Star color and constellation tint** | The architectural branch owns the color, and its descendants inherit it in light and dark themes. Glyphs identify kinds such as plugin, module, folder, class, or callable. Expanded surfaces show containment. |
| **Soft halo on the last visited group** | A wider glow marks the most recently exited group when it folds back into a star. |
| **Idle wire colors** | Each half draws from its endpoint's family color, with a muted blend in the middle. Focus strengthens the colors. |
| **Trace arrows and readout** | Cyan means outgoing, amber incoming, and violet within or self, relative to the named focus. |
| **Steady amber triangle or red stop sign** | A star has a Review warning or error. The badge shows the highest displayed severity. |
| **Pulsing star or wire** | Visible affected stars pulse in their family colors. A wire that carries active finding evidence pulses with a severity-colored halo. The halo reflects the highest active finding among the displayed references. |

### Follow the moving light

Eligible focused or selected wires breathe subtly and carry a soft moving highlight from source to destination.
When both directions are visible, two highlights travel in opposite directions. A reciprocal bundle can represent
several distinct module pairs. Open **Details** for the original references and **Review** for a witnessed module cycle.
Flow backed by an active cycle finding uses a stronger amber or red glow.

Camera motion clears directional flow while the view moves. Reduced-motion preferences keep finding cues static and
use direct camera changes.
[Family colors and camera motion](viewer/docs/architecture/map-navigation.md#visual-appearance-and-motion) |
[Connection color and motion](viewer/docs/architecture/map-navigation.md#connection-color-and-motion) |
[Review markers and pulses](viewer/docs/architecture/inspection-review.md#review-markers-and-pulses)

## Keep a map current

- **Recheck in the background.** A live session can run recommended checks, recheck enabled checks, or monitor their
  inputs for automatic rechecks. Progress belongs to the active attempt. The map stays available with its recorded coverage
  while work runs, and a failed attempt leaves the last good map available. [Background analysis](laniakea/docs/architecture/monitoring.md)
- **See what changed.** Input comparison shows added, modified, or removed paths for comparable recorded inputs.
  A new receipt can change build evidence. Limited scope, unavailable comparisons, and unchecked saved views stay visible.
  [Input-change comparison](laniakea/docs/architecture/monitoring.md#input-change-comparison)
- **Adopt a ready map.** The viewer retains camera, pins, filters, and surviving focus as it adopts a validated snapshot.
  Adoption waits during interactions such as dragging, layout saves, or edited Review decisions. A saved-only session
  opens recorded maps without scheduling checks. [Live snapshot adoption](viewer/docs/architecture/live-updates.md#live-snapshots)

## Work locally and understand coverage

- **Local workspace.** The viewer runs on loopback with bundled browser assets. Analysis outputs and user decisions
  live in the ignored workspace. Unreal Build Tool evaluates project build rules and owns its cache writes. Use live
  analysis with trusted projects. [Project setup and trust boundary](docs/guide.md#open-a-project)
- **One recorded build context at a time.** Build declarations, compiler observations, source matches, and visual
  grouping have distinct meanings. Static calls describe recorded targets. Runtime dispatch, other build contexts,
  and unanalysed code are outside the displayed evidence. Read **Coverage** before interpreting a quiet map or an
  empty Review list. [Coverage and evidence limits](docs/guide.md#account-for-missing-information)

## Try the sample

- **Recorded preview.** Open the synthetic relay map with Git and Python on Windows. Review shows the sample's
  two recorded module errors. [Run the preview](sample/README.md#run-the-preview)
- **Live walkthrough.** With Unreal and the optional tools, collect the sample's C++ and duplication evidence.
  Trace reciprocal relationships, open all four finding types, compare matching code, and recheck a boundary repair.
  [Explore the relay sample](sample/SampleProject/docs/walkthrough.md)
