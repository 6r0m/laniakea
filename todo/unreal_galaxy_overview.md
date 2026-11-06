# Centered galaxy overview and trustworthy reference presentation

**Status:** REVIEW REQUIRED  
**Scope:** profile presentation metadata, continuous-map layout, labels and normalized internal references  
**Stable documentation owners:** [graph semantics](../docs/architecture/graph-model.md) and
[Unreal interpretation](../docs/architecture/unreal-profile.md)

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Non-goals](#non-goals)
- [Verified evidence](#verified-evidence)
- [Current architecture and source of truth](#current-architecture-and-source-of-truth)
- [Problem and root cause](#problem-and-root-cause)
- [Decision](#decision)
- [Required invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks)
- [Test-first and verification plan](#test-first-and-verification-plan)
- [Documentation plan](#documentation-plan)
- [Rollout and rollback](#rollout-and-rollback)
- [Completion criteria](#completion-criteria)
- [Review record](#review-record)

## Goal

Make the overview understandable as a continuous constellation map: distinguish project ownership,
configuration and actual references, keep useful names readable, and explore surrounding relationships
through hover and zoom. Investigate the supplied centered-galaxy proposal and game-map illustrations;
produce a plan for approval before implementation (D1).

## Authority register

### Operator decisions

- **D1** Investigate the supplied proposal with investigate-change; deliver a reviewable todo.
  - Effect: investigation only; file existence does not authorize implementation.
  - Reason: not stated.
  - Source: current operator request, 2026-11-06.
- **D2** Keep seamless galaxy navigation with minimal actions; wheel zoom explores layers and hover emphasizes references.
  - Effect: no required selection or separate galaxy switch to retain relationship context.
  - Reason: operator wants intuitive space routing and exploration.
  - Source: earlier operator navigation requests in this conversation.
- **D3** Preserve manually arranged positions across fresh pages and server restarts.
  - Effect: existing modes and stored pins are protected state, including temporarily unavailable native nodes.
  - Reason: operator uses manual arrangement for representation.
  - Source: earlier operator position-persistence requests in this conversation.
- **D4** Engine internals are unnecessary now; project-facing Engine plugin usage is sufficient.
  - Effect: boundary presentation can change, extraction depth cannot expand under this plan.
  - Reason: operator does not need Engine internals now.
  - Source: earlier operator scope instruction; existing deferred Engine task.
- **D5** Windows is the current platform; Rust/Python profiles remain future work.
  - Effect: no new platform or language implementation.
  - Reason: not stated.
  - Source: earlier operator scope instruction.
- **D6** Analyze current sources using the last successful build's target/configuration.
  - Effect: layout work must not change build-context selection.
  - Reason: not stated.
  - Source: operator's explicit build-context answer in this conversation.
- **D7** Keep mouse, drag and zoom optimized; measure interaction behavior in the driven browser.
  - Effect: visual additions must preserve bounded rendering and have before/after interaction evidence.
  - Reason: operator reported CPU load and unreliable navigation on dense maps.
  - Source: earlier operator performance requests.

### Operator gates

No blocking design question identified. Implementation is gated by approval of this todo under D1.

### Working assumptions

- **A1 [ACTIVE]:** Add an optional centered layout; keep the current default and existing layout keys unchanged.
- **A2 [ACTIVE]:** Hide only project-root configuration declarations by default in the new layout, with an explicit toggle/count.
- **A3 [ACTIVE]:** Keep faint cross-constellation reference lines visible; hover emphasizes rather than becoming the only way to discover them.
- **A4 [ACTIVE]:** Treat the supplied game maps as visual inspiration, not an instruction to add territories, simulations or 3D.
- **A5 [ACTIVE]:** Use a repeatable 10% p95 regression threshold in matched browser scenes; absolute stutter still needs reporting.

The attachment's recommendations are proposals, not additional operator decisions.

## Non-goals

- Engine indexing, broader plugin discovery, complete effective-plugin enablement evaluation, new language profiles or platforms (D4-D6).
- New renderer, dependencies, services, database design, compiler/cache redesign or runtime network access.
- Invented Source/Plugins parent nodes, drawn containment wires, or a second authoritative relationship graph.
- Automatic layout migration, copying old mode pins into the new mode, moving pinned nodes to satisfy aesthetics, or animated orbits.
- Persistent mandatory selection, hiding all references until hover, or shrinking names below a readable screen size.

## Verified evidence

### Facts

| Evidence | Observation and consequence |
|---|---|
| [graph builder](../laniakea/unreal/graph.py), `build`, `_folder` | Source modules belong directly to the project; folder nodes represent actual plugin folders. `.uproject` and `.uplugin` enabled references share `requires`, while UBT dependency self-edges are skipped. A global `requires` filter would also hide plugin-to-plugin declarations. |
| [profile](../laniakea/unreal/__init__.py), `extract`; [schema](../schema/graph.v1.schema.json), `manifest`, `edgeType` | Manifest supplies language-neutral viewer metadata, but currently has no layout anchor or project-configuration subset hint. Strict schemas require deliberate contract extensions. |
| [renderer](../viewer/map.js), `galaxyPositions`, `layout` | Existing orbits place project members on one ring and boundary roots outside it. Other modes use projected dependencies. A centered option is a presentation gap, not a missing Engine graph. |
| [renderer](../viewer/map.js), `mapNode`, `readableLabels`, `declutterLabels` | Captions combine names, types and counts. Collision checking hides the whole caption; no primary-name fallback exists. Existing measured hit boxes and gesture settling must remain. |
| [normalizer](../laniakea/unreal/symbols.py), `merge.endpoint` | Unretained generated declarations fall back to module endpoints. Original symbol resolution is available during normalization, but not preserved as a compact-map classification. |
| [native regression](../tests/test_native_symbols.py), `CompilerBoundary.test_generated_references_keep_native_module_ownership_without_generated_stars` | Synthetic generated references legitimately normalize to one module at both ends. The reference is retained without a generated function star. |
| [projection](../viewer/universe.js), `project` | A same-representative reference becomes internal only when projection replaced an endpoint. An already normalized module self-reference remains a visible loop. An in-memory synthetic probe produced one loop and zero internal references for this case. |
| [read index](../laniakea/map_index.py), `build`; [reference groups](../schema/graph.v1.schema.json) | Compact groups retain endpoint/type/count, not compiler provenance. A viewer-only identity test cannot recover distinctions already lost during normalization. |
| [position store](../laniakea/layouts.py); [client](../viewer/positions.js) | Layout names are validated strings, not an enumerated list. A separate mode fits existing storage. Merges retain absent pins; reset has a narrower current-graph scope. |
| [details](../viewer/app.js), `renderDetails`, `followReference` | Exact reference pages and endpoint navigation already exist. Reuse them for folder summaries; do not build another reference browser. |

Primary technical checks support the distinction between configuration and evaluated dependencies:
[Epic's plugin descriptor](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Projects/FPluginDescriptor?lang=en-US)
documents default enablement and plugin references;
[Epic's target rules](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-build-tool-target-reference)
document target-specific plugin controls. Descriptor presence alone is not complete effective enablement evidence.

Commands executed during investigation:

- `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs`: 78 passed.
- `python -m unittest discover -s tests -p test_unreal_graph.py`: 13 passed.
- `python -m unittest discover -s tests -p test_map_index.py`: 6 passed.
- `python -m unittest discover -s tests -p test_native_symbols.py`: 6 passed, 3 skipped without optional native tools.
- Git working tree was clean before investigation. No implementation, extraction or layout writes performed.

### Inferences and unverified areas

An optional centered arrangement should improve orientation; only browser comparison can establish that outcome.
The supplied pictures establish aesthetic intent, not measured usability or actual dependency routes.
No new browser performance or native coverage claim is made by this investigation.

### Refuted or narrowed premises

- The project root's references are not inherently erroneous: it is a real descriptor endpoint. Dataset selection does not remove those facts.
- A module self-loop is not sufficient evidence of recursion or a build self-dependency. Nor is every canonical self-edge safe to hide.
- A plugin folder is not a dependency owner: collapsed wires are descendant summaries already. Improve their explanation, not canonical ownership.
- The full proposal is not purely a layout edit: honest internal-reference classification needs a small normalizer/read-contract change.

## Current architecture and source of truth

Follow [structure and invariants](../docs/architecture/structure.md),
[continuous-map semantics](../docs/architecture/graph-model.md#continuous-map), and
[Unreal normalization](../docs/architecture/unreal-profile.md#from-export-to-graph).
The profile owns Unreal interpretation; schema owns contract shapes; Universe owns projection and world positions;
map owns rendering; app owns controls; the existing store owns saved pins. Canonical runs, disposable read indexes
and user positions retain independent lifetimes. Do not move language-specific decisions into the generic viewer.

## Problem and root cause

The overview gives configuration, dependency bundles and long captions similar visual weight. This obscures project
structure. Whole-caption rejection loses useful names. Separately, normalization can abstract symbol identities to
one module without telling projection that the result describes activity within that owner rather than a self-dependency.
The proposed center is a spatial orientation aid; it must not imply ownership, centrality analysis or complete Engine coverage.

## Decision

Recommend A1-A4, subject to approval. Add one generic centered layout, supplied with a profile-owned anchor and
configuration-subset hint. For Unreal, the anchor names the existing Engine boundary root. Keep it compact and initially
collapsed; reveal only recorded boundary children through existing zoom. Project constellations remain the dominant
colored shapes around it. Distinguish external context with the existing boundary styling, not new facts or invented routes.

Use a small optional manifest overview hint: anchor node id and configuration type ids. Configuration applies only to
edges whose original source is the analyzed project root. Validate the anchor as an existing boundary root and the types
against declared exact types. Missing hints retain ordinary orbits; invalid hints fail visibly before committing a new scene.
The generic viewer must not test Unreal profile names, Engine ids, folder strings or particular level/type names.

Configuration visibility extends the existing filter owner, rather than a second overlay graph. Initialize it shown for
existing modes and hidden for the new mode; keep explicit choices per mode within scene/history state. Typed checkboxes
remain authoritative for types; configuration adds a subset predicate. Its control and filtered count stay visible without
opening details. Following an exact hidden declaration enables the needed predicate and existing type/boundary filters.
The canonical project star remains inspectable/searchable; the control exposes its configuration without implying that it
owns every visible dependency. Plugin-to-plugin declarations stay visible unless their ordinary type filter hides them.

Do not add a synthetic Source parent. Place direct project modules in the outer project band alongside actual folder/plugin
constellations. Names, kind and source breadcrumbs distinguish a source module from the same-named project. Existing
source locations explain logical plugin folders and mounted sources. Preserve canonical ids, parents and reference ids.

Represent an abstracted same-owner reference with an optional, schema-owned `internal_to_owner` marker on the canonical
edge and compact group. The normalizer sets it when both endpoints resolve to one owner and at least one was abstracted
from an unretained symbol/file context. Do not infer it from a label, function spelling, macro, `implicit`, or level in the viewer.
An authored function referring to itself remains an explicit self-edge. Retain original location, symbol and compiler status.
Group by the marker as well as endpoints/type; projection sends marked facts to internal accounting, and exact pages retain
them. Validate marked edges have identical endpoints. Old unmarked runs retain their existing interpretation; no guessing.

Names use a finite fallback ladder: full caption when space permits, primary name with secondary text removed, then a
bounded name-only fit/ellipsis if needed. Preserve the full name on hover, focus, search, details and the accessible list.
Keep readable font size, priority for traced endpoints, actual renderer metrics, and no invisible label hit targets.
Folder summary details must explicitly say "references of descendants" and show endpoint owners/source paths in existing pages.

### Premise / KISS gate

Universe and the current canvas adapter already own the needed lifecycle and data. Add one layout option, one bounded
manifest hint, one reference-classification bit through existing contracts, and caption fallback. Extend existing filters,
paging, cache generation and layout storage. Add no process, port, dependency, cache, polling loop or independent writer.
Remove no reference facts or reliability mechanisms; suppress redundant caption text and false visual dependency loops only.
Give up literal reproduction of the illustrated Source region and ornamental game-map mechanics: neither answers a new
architecture question, and fake containment would make navigation less trustworthy.

### Alternatives considered

| Option | Additions / removals | Assessment |
|---|---|---|
| Change current orbits in place | Layout edit; no mode | Smaller code change, but overrides the established arrangement/default and risks D3. |
| Generic centered mode with profile hints | One mode; small validated metadata; no new owner | Recommended: deterministic Engine anchor without contaminating the generic viewer or disturbing old pins. |
| Guess the center from labels or reference counts | Heuristic; no metadata | Other external roots may be larger; names are profile data. Does not reliably identify the intended anchor. |
| Center a manually chosen star | Selection control and center-choice state | Viable general feature, but adds required action/state without meeting this proposal's predictable initial overview. |
| Hide all requires/self-loop edges in the viewer | Few conditionals; removes visual facts | Reject: loses plugin declarations, recursion and unclassified self/ancestor relationships. |

## Required invariants

1. D2-D7 and the stable architecture's privacy, offline, black-box and language-neutral contracts remain intact.
2. Every reference is accounted exactly once as visible, internal, beyond viewport or explicitly filtered; exact pages keep all facts.
3. No anchor/region/layout creates containment, dependencies, target membership or analysis coverage.
4. Existing graph/node/edge identities and old layout keys remain stable. New mode writes only its own released canonical-node pins.
5. Switching layout, filtering, expanding, fitting, reading details or resizing never rewrites unrelated pins or extraction inputs.
6. True recursion, ancestor references, directions, types and status remain discoverable. Unknown abstraction is not labeled success.
7. No whole-graph compiler payload download, scan per hover/frame, or unbounded caption-search algorithm.
8. Ordinary extraction still needs no LLVM or C++ fingerprint scan; native normalization remains explicitly requested.

## Implementation tasks

1. [ ] Add and observe failing guards for each machine-provable changed contract below before production edits.
2. [ ] Extend schema and existing semantic validation for overview hints and `internal_to_owner`; cover missing/invalid metadata.
3. [ ] In the Unreal profile, emit the anchor/root-configuration hints and classify abstracted internal references during normalization.
       Preserve ids/status/provenance and explicit recursion. Change no discovery, target selection or compiler invocation policy.
4. [ ] Carry classification through the read-index groups, exact pages and projection. Audit shard behavior: retain exact metadata,
       make summary counts honest, and avoid introducing a contradictory second internal-reference interpretation.
       Regenerate disposable caches through generator identity; never patch published graphs in place.
5. [ ] Add the generic mode in the existing selector/layout path; restore its own pins, use the anchor only for unpinned initial
       placement, preserve outer arrangement on zoom, and provide an understandable missing-hint fallback.
6. [ ] Add root-configuration subset visibility to the existing filter path, accounting, controls and exact-reference reveal path.
       Keep A3; don't turn dimming into data removal. Show descriptor/target/unknown state separately in existing details.
7. [ ] Add measured primary-name fallback and descendant-summary wording in renderer/details. Verify hover, keyboard focus,
       label drag and hit boxes after caption changes. Avoid parallel metadata/list renderers.
8. [ ] Run focused checks, then full acceptance below; update existing stable owners in place, inspect final diff and pin evidence.
       Stop for renewed review if evidence requires new hierarchy ownership or extraction depth.

## Test-first and verification plan

### Red evidence

Every permanent guard below must first fail against the unchanged implementation for the stated reason.

| Case and evidence class | Faithful input / owner | Wrong behavior or missing capability to capture |
|---|---|---|
| Centered overview - acceptance + regression | Generic fixture with two external roots, renamed ids, explicit anchor; viewer tests | Current modes cannot choose that anchor at center. A larger unrelated boundary must not replace it. |
| Contract refusal - regression | Schema/profile/pipeline tests | Unknown anchor, non-boundary anchor, undeclared configuration type and non-self internal marker must refuse without replacing last good state. Missing optional metadata remains valid. |
| Root configuration subset - regression | Project->plugin and plugin->plugin references of the same type; Universe/viewer tests | Existing type filtering hides both. New subset must hide/count only root declarations; exact reveal restores them. |
| Abstracted module reference - regression | Extend existing synthetic generated-reference test; compact map and Universe tests | Current normalizer emits an unclassified self-loop. New internal count must retain exact compiler rows and locations. |
| Authored recursion and ancestor refs - regression | Synthetic authored function self-call plus ancestor and parallel refs | Protect against blanket suppression. Marked/unmarked groups must not merge or double-count over expansion/filter/viewport cuts. |
| Primary-name fit - regression + browser acceptance | Long name with secondary metadata and neighboring glyph; current label tests | Full caption is hidden even when its name alone fits. Test actual browser metrics, priority, full-name recovery and hit-target removal. |
| Summary interpretation - reviewer judgment | Synthetic logical plugin folder with multiple contributing plugins | Reader must recognize descendant rollup, identify exact owners, and follow references without assuming folder dependency ownership. |
| Pin isolation/restart - regression + E2E acceptance | Synthetic multi-mode pins with unavailable native nodes; copied layout store | New mode must save independently; bare URL reload and server restart restore its last drag, older modes are byte/value unchanged. |
| Usability/performance - before/after acceptance | Same served synthetic dense graph and local real-project map, viewport/display/scenes | New center/name policy must improve orientation without increasing sustained gesture work or growing retained scene data across flights. |

### Green evidence

- Repeat the same guards. Use `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs`.
- Run focused Python discovery for `test_unreal_graph.py`, `test_native_symbols.py`, `test_map_index.py`, `test_shards.py`,
  `test_layouts.py`, `test_pipeline.py`, and `test_server.py`; then `python -m unittest discover -s tests` as final integration gate.
  Report optional Engine/native skips explicitly; enabled native tests are required for changed normalization acceptance.
- Exercise [synthetic browser checks](../tests/viewer.browser.js) on an isolated sample workspace/server, not live user pins.
  Add E2E cases for mode switching, configuration reveal, caption hit boxes, bare address reload and a real server restart.
- Drive trusted wheel/hover/pan/drag interactions at 12 distinct places across folders, plugins, modules, classes/functions and
  recorded external children. Test one same-named project/module, one long caption, one empty region and exact reference navigation.
  Record whether a fresh reader can identify ownership, external context and reference direction without required clicks.
- Use [performance probe](../tests/viewer.performance.js) plus trusted drag-release timing in matched foreground browser scenes.
  Record frame p50/p95/max, long tasks, projection/settle cost, renderer element counts and reference-cache retention before/after.
  Repeat representative flights three times. Under A5, reject a reproducible >10% increase in p95 gesture/settle cost or progressive
  retained-data growth; distinguish noisy runs from repeatable regression. Report remaining absolute stutter, not just averages.
- Before touching real-project UI, record layout hash and all per-mode coordinate values privately. Use a disposable copy for
  intentional save/reset/restart tests. Real-project visual/performance exploration must not change original stored pins.
- Publish new native facts only through a validated requested native run, with elapsed normalization/extraction time recorded.
  Existing raw caches do not justify guessing classification or editing an immutable run. Module-only extraction must still work
  without native tools; view the old native run until a replacement is validated. Restart serving after publication and probe it.
- Use only synthetic tracked fixtures/artifacts. Keep diagnostic evidence in ignored workspace and real-project screenshots
  outside the clone per AGENTS.md. Run privacy checks and inspect the final diff, ASCII and local documentation links.

## Documentation plan

- **Authoritative semantics:** update [graph-model.md](../docs/architecture/graph-model.md) for anchor presentation, subset filters,
  internal classification, absent metadata, name fallback and unchanged accounting/pin lifetimes.
- **Unreal interpretation:** update [unreal-profile.md](../docs/architecture/unreal-profile.md) for descriptor versus evaluated-target
  meaning and generated endpoint abstraction. Don't claim complete effective enablement or Engine-internal coverage.
- **Schema:** owns field shapes; prose links it rather than copying a second field specification.
- **Navigation:** root [README](../README.md) describes how to choose the new option/control; do not copy normalization rules there.
  Existing architecture routes suffice. Add this task to the todo router only during approved implementation if still needed;
  remove completed task routing when durable knowledge has migrated.
- **Duplication avoided:** preserve structure.md as the boundary owner; adjust its existing overlapping label/root descriptions
  only where inconsistent, and point detailed presentation semantics to graph-model.md. No new architecture/report document.
- Stable docs, code, tests and comments must not reference this transient file.

## Rollout and rollback

Offer the new mode explicitly under A1. Do not migrate or reset user positions. Old manifests/graphs remain usable under
documented missing-metadata behavior. A newly classified native map requires a fresh validated run; normalization cannot be
retroactively inferred by the browser. Measure that cost and keep the previous published run available until successful promotion.
If acceptance fails, retain existing modes and last good run; discard only new disposable read artifacts, never layout data.

## Completion criteria

- Approved scope implemented with no language-specific viewer branch, invented parent, lost fact or implicit compiler run.
- Center is understandable and optional; project remains visually dominant; useful names precede metadata; folder summaries
  expose real contributing owners; generated internal references cannot look like module self-dependencies in newly classified runs.
- Required guards, native normalization evidence, browser journeys, matched performance measurements and restart/pin comparisons pass.
- All legacy mode coordinates remain intact, including unavailable symbols. Failures remain observable and last good state survives.
- Durable docs agree with code, public artifacts contain only synthetic evidence, and unrelated changes remain untouched.
- Report bounded verified results and remaining coverage limits; migrate durable knowledge before removing the completed todo.

## Review record

### 2026-11-06 - investigation

- D1-D7 recorded from attributable operator requests; A1-A5 remain recommendations.
- Verified renderer/filter/normalizer boundaries and the current test baseline. Identified the lost abstraction distinction;
  narrowed the visual-only proposal accordingly. No implementation approval or production changes in this round.
