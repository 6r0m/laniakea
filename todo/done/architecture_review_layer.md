# Architecture review layer

**Status:** DONE

**Scope:** optional, evidence-based review of a published graph

**Stable documentation owner:** `docs/architecture/review.md`

## Contents

- [Goal and authority](#goal)
- [Evidence and research](#verified-evidence)
- [Current owners](#current-architecture-and-source-of-truth)
- [Recommended design](#decision)
- [Invariants](#required-invariants)
- [Implementation](#implementation-tasks)
- [Verification](#test-first-and-verification-plan)
- [Documentation and closure](#documentation-plan)

## Goal

Help a developer find architectural concerns, inspect the recorded evidence and retain a review decision without
leaving the continuous galaxy. Support familiar, configurable dependency constraints without pretending to grade
an entire architecture automatically.

## Authority register

### Operator decisions

- **D1 [SUPERSEDED IN PART by D7 - investigation-only execution boundary]:** Investigate automatic architecture checks with configurable patterns used by programmers, using the
  supplied proposal and `investigate-change`. Effect: one reviewable plan, not runtime implementation.
  Reason: not stated. Source: current request, 2026-11-12.
- **D2:** Preserve seamless zoom, hover and exploration with minimal actions and visual noise.
  Effect: review information must coexist with the accepted galaxy. Reason: intuitive exploration.
  Source: earlier operator requests in this session.
- **D3:** Windows is the supported platform; Engine internals and additional languages remain separate future work.
  Effect: this change neither expands indexing nor adds another language adapter. Reason: enough Engine context is
  available to understand the plugins used. Source: earlier operator scope decision.
- **D4:** Analyse current sources using the last successful build's target/configuration.
  Effect: evaluate the published run's actual context; do not replace the accepted build-selection policy.
  Reason: not stated. Source: operator clarification earlier in this session.
- **D5:** Preserve saved arrangements and archive completed todos rather than deleting them.
  Effect: neither pins nor completed plans are migrated or removed. Reason: retain arrangements and task history.
  Source: earlier operator requests in this session.
- **D6:** Evaluate the supplied audit against the code and apply valid in-scope corrections.
  Effect: revise the investigation contract; the proposed runtime feature still requires implementation approval.
  Reason: not stated. Source: operator review request, 2026-11-12.
- **D7:** Implement this approved plan using `implement-approved-change`.
  Supersedes: D1's investigation-only execution boundary; its investigation goal remains historical scope.
  Effect: implement and verify A1-A5 within the existing invariants; no commit or publication authorized.
  Reason: not stated. Source: current operator skill invocation, 2026-11-12.
- **D8:** Run the three Engine integration cases now in one additional focused attempt.
  Effect: resolves Q1's retry authorization; no broader rerun or source change authorized by this decision alone.
  Reason: not stated. Source: operator reply "do now" to the pending retry question, 2026-11-12.
- **D9:** Evaluate the implementation audit against current code and fix valid in-scope findings.
  Effect: correct rule applicability and triage semantics, verify affected paths and update their existing owners.
  Reason: correctness and future scalability. Source: operator audit request, 2026-11-12.

### Operator gates

- Implementation approved by D7.
- **Q1 [RESOLVED by D8 - additional focused attempt]:** The initial whole-suite run and the focused replacement both stopped all three
  Engine integration cases at UBT's conflicting-instance guard before their assertions. May one additional focused
  attempt run when UBT is idle, or should closure retain this explicit verification gap? The operator authorized the
  additional attempt under D8; runtime success still requires the resulting assertions to pass.

### Working assumptions

- **A1 [RESOLVED by D7]:** The three MVP checks below are enough to prove a useful review workflow. Other checks are excluded.
- **A2 [RESOLVED by D7]:** Severity distinguishes explicit constraint violations from review candidates; no universal quality score.
- **A3 [RESOLVED by D7]:** Review is opt-in and on demand. Rules are local JSON; changing them requires explicit Recheck,
  not extraction, file watching or a policy editor.
- **A4 [RESOLVED by D7]:** Start at module/build-dependency granularity; preserve exact native calls as evidence. Do not
  implement arbitrary class-level policies or a configurable rule language in the MVP.
- **A5 [RESOLVED by D7]:** Triage follows the rule's module-level semantic concern. Location drift refreshes exact evidence
  without reopening an otherwise unchanged acknowledged finding.

The attachments are design input; D7 supplies implementation authority for A1-A5.

## Non-goals

- Source edits, automatic fixes, build/CI enforcement, universal quality grades or red findings from metric thresholds.
- New parser, graph database, renderer, service, port, dependency or plugin framework.
- Engine-internal indexing, other targets inferred from this target, or changed native extraction behavior.
- Fan-in/out scoring, public-dependency demotion, runtime-to-Editor restrictions, Git mining or machine learning.
- Historical trend dashboards and automatic live reanalysis. These are not needed for the first review workflow.

## Verified evidence

### Repository facts

| evidence | consequence |
|---|---|
| [Native dependency notes](../../laniakea/unreal/symbols.py), `_dependency_reviews`, annotate cross-module `calls` with `dependency_review`, `transitive_path` and `public_exposure_path` | Reuse these notes; do not duplicate dependency-path inference in the generic evaluator. The note explicitly says it is not a violation. |
| [Native reference identities](../../laniakea/unreal/symbols.py), `merge`, include source path, line and column in the reference key | Raw reference IDs and locations are exact-evidence locators, not semantic triage fingerprints. Moving an unchanged call can change its ID. |
| [Unreal graph construction](../../laniakea/unreal/graph.py), `DEPENDENCY_FIELDS` and `build` | Public/private build dependencies, include paths, dynamic loads and descriptor requirements are different facts. Only project modules have exported outgoing dependencies; Engine boundaries are incomplete. |
| [Unreal manifest](../../laniakea/unreal/__init__.py), `extract` | The run records profile, selected target/platform/configuration, compiler source when enabled and coverage limitations. Native analysis remains opt-in. |
| [Read index](../../laniakea/map_index.py), `build`, `MapIndex.references` | SQLite retains exact canonical edge payloads. Its `seq` is the run's edge ordinal; reference groups and cursors are run-bound, not durable issue identities. |
| [Publication](../../laniakea/pipeline.py), `extract` | A validated run becomes latest only after successful extraction. Optional review must not become another extraction/publication gate. |
| [Profile registry](../../laniakea/profiles.py) | One existing registry owns adapters; there is no review framework to extend or replace. |
| [Workspace writer](../../laniakea/workspace.py), `write_json`, `writer_lock`; [layout writer](../../laniakea/layouts.py) | Atomic replacement does not serialize concurrent read/merge/write. Triage needs its own coordinated writer, separate from layouts. |
| [Inspection](../../viewer/app.js), `renderDetails`; [reference retention](../../viewer/references.js) | Reuse Details, exact paging and request cancellation. A late review response must not reopen closed inspection. |
| [Projection](../../viewer/universe.js); [source sections](../../viewer/sections.js) | File representatives are navigation abstractions. Findings must originate in canonical entities, then map onto the visible frontier. |

Search found no existing rule evaluator, triage store or competing active review-layer todo. Existing native notes are
the reusable feature, not an implementation of the proposed review workflow.

### Research and what to borrow

These sources support explicit intent and evidence. None supplies a validated threshold for declaring an Unreal
architecture bad.

| primary source | useful result and limit |
|---|---|
| [Software Reflexion Models, 1995](https://www.cs.ubc.ca/labs/spl/projects/reflexion.html) | Compare a developer's intended structural view with observed interactions; mappings are supplied, not discovered design intent. |
| [SEI ATAM](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/) | Assess quality trade-offs. It is an evaluation method, not an automatic defect detector. |
| [Fitness-function-driven development](https://www.thoughtworks.com/en-us/insights/articles/fitness-function-driven-development) | Turn explicit architectural goals into repeatable checks; a project must choose the goals. |
| [ArchUnit guide](https://www.archunit.org/userguide/html/000_Index.html) | Layer/cycle constraints and stored legacy violations are established patterns. Its baseline is not a Laniakea resolved-state model. |
| [Dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md) | Named source/target constraints and scoped exclusions explain findings. Borrow the approach, not its JavaScript runtime or full rule language. |
| [Architecture-smell evolution, 2024](https://www.sciencedirect.com/science/article/pii/S0164121224002152) | Across 485 releases of 14 systems, cycles can merge and smells evolve differently. This does not make every cycle a defect. |
| [Google complexity study, 2025](https://research.google/pubs/understanding-architectural-complexity-maintenance-burden-and-developer-sentiment-a-large-scale-study/) | Associations across 1,200+ C++/Java projects support prioritization, not causal diagnosis or a portable severity threshold. |
| [Smell co-location study, 2026](https://www.boa.unimib.it/handle/10281/620223) | Correlations in 782 Java/Python projects do not establish an individual C++ project's design intent; reported associations often have low support. |
| [ArchJIT, 2026](https://www.mdpi.com/2079-9292/15/12/2682) | Incremental warnings were studied on Java histories. Useful future direction; its learned prioritization is unnecessary here. |
| [CodeScene coupling documentation](https://helpcenter.codescene.com/help/articles/1844075-how-to-assess-coupling-health-in-codescene) | Change coupling needs history and component context; it differs from recorded static dependencies. Do not infer it from the current graph. |
| [Epic module documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-modules) and [module properties](https://dev.epicgames.com/documentation/en-us/unreal-engine/module-properties-in-unreal-engine) | Public/private dependencies and circular-dependency declarations have specific build meaning. Include paths and Editor target membership are not substitutes for those facts. |

### Inferences, unknowns and rejected premises

- The graph is sufficient for positive dependency witnesses and the existing native candidates. A full absence claim
  needs stronger coverage than a positive witness; missing Engine edges cannot prove an acyclic whole project.
- Existing coverage includes prose and has no universal machine-readable completeness certificate. Do not parse prose
  to manufacture one. Older/native runs without recognizable notes cannot establish that direct-dependency review passed.
- Useful signal volume, first-review cost and badge readability on a real native map remain unverified.
- Refuted: a cycle, hub, large component, line crossing or high metric alone proves bad architecture. Research does
  not establish that conclusion. Refuted: target membership proves a runtime-to-Editor violation; the current graph
  and selected build context do not establish every restriction needed for that rule.

## Current architecture and source of truth

The [structure](../../docs/architecture/structure.md), [component view](../../docs/architecture/diagrams/main.md),
[graph contract](../../docs/architecture/graph-model.md) and [Unreal profile contract](../../docs/architecture/unreal-profile.md)
own the existing boundaries. The [guide](../../docs/guide.md) currently describes architectural judgement as manual.

The published graph/manifest own recorded facts and context. The read index is disposable. The server advertises a
pinned run; the viewer projects it without changing ownership. Positions belong to a separate mutable store.
Configuration declarations stay out of architecture wires, while exact references remain inspectable.

## Problem and root cause

Developers can explore dependencies but cannot ask the tool to check explicit boundaries, list witnessed cycles,
collect existing native review notes, or remember why a finding was accepted. This is a capability gap, not evidence
that the current renderer or graph model is defective.

## Decision

### Premise / KISS gate

Use the existing server's pinned snapshot and read index. Add an on-demand deterministic evaluator, disposable report
cache and independent triage writer. The viewer receives bounded findings and decorates the current projection.
The existing HTTP server is needed to read private local evidence and persist decisions; no additional process,
port, watcher, compiler run or network service is needed. A3 deliberately gives up instant policy/source updates.

The read index owns access to exact payloads. Add a read-only streaming iterator there rather than loading another
complete native graph or letting review code duplicate SQLite internals. It must not rebuild the index on each review.
The evaluator retains module adjacency, summaries and bounded witnesses, not another symbol/reference graph.

### MVP checks and severity

| check | input and grouping | result |
|---|---|---|
| Forbidden dependency direction | Explicit named source/target module selectors, build-edge family and target context; one finding per rule and directed module pair | Red only for an exact recorded dependency forbidden by the configured policy. No configured policy means no such claim. |
| Module dependency cycle | Declared module dependencies; one finding per cyclic strongly connected component, with a deterministic witness loop | Yellow by default. Red only when an explicit acyclic policy covers that component and its edge family. Do not enumerate every elementary cycle. |
| Native call without a direct build dependency | Existing profile-owned annotations on canonical calls; one candidate per directed module pair, with exact call witnesses and recorded dependency paths | Yellow only. No native source means unavailable; incomplete/older notes mean limited coverage, not zero problems. |

Red means a recorded violation of the stated constraint, not a proven runtime failure. A fully evidenced positive
witness can remain valid under partial overall coverage; that same partial coverage cannot establish conformance.
Missing or contradictory facts required by the witness make it unavailable, not red.

Per-check status distinguishes disabled, evaluated-on-recorded-scope, partial, unavailable and error. Zero findings
is displayed as "No findings in recorded scope", with that scope and coverage, never "Architecture is correct".
Severity and triage are separate. An acknowledged red finding remains a red finding.
Out-of-box analysis supplies yellow candidates only; red requires an explicitly configured applicable constraint.

### Configurable patterns and profile boundary

- Keep one per-target `review/rules.json` under the ignored workspace. Ship synthetic examples, not a policy inferred
  from the analysed project's names or folders. No writes into the analysed repository.
- A missing rules file uses disclosed candidate-only defaults: cycles and available native notes, no prohibitions.
  An unreadable or invalid file is an error, never absence. Show the policy location, loaded identity and Recheck action.
- Provide stable rule IDs, enabled/disabled state, a rationale, selected target context, module selectors and applicable
  dependency types. Start with exact IDs or case-sensitive label globs, optional recorded source-root/path-prefix
  scoping and explicit exclusions. Show the resolved module set before interpreting results.
- These selectors cover layered direction, forbidden peer dependencies and an acyclic module set. A layered preset
  is an editable example, not a universal rule that every Domain/Application/Infrastructure project must follow.
- Reject unknown fields/types, duplicate IDs, contradictory selector fields and malformed paths. Empty required
  selectors are "no applicable modules", not success; unmatched/ambiguous labels are disclosed. Bound policy size
  and matcher count. No executable expressions, arbitrary regexes, imports or user scripts.
- The generic evaluator handles explicit typed edges, selectors and cycle detection. The existing profile registry
  may expose one optional review-input adapter; the Unreal adapter owns build-edge categories, eligible modules,
  native-note interpretation and applicability. No hardcoded Unreal labels/types in the viewer or generic evaluator.
- Unreal defaults inspect in-target project modules and `depends.public`/`depends.private` declarations. Exclude
  descriptor `requires`, summary/include/dynamic-load edges, native call cycles, normalized owner-local references
  and boundary internals from that default. Exclusions and exact edge families remain visible in the report.
- A cycle rule emits one severity for its finding; an applicable acyclic constraint replaces its yellow classification
  with red rather than adding a duplicate candidate. Distinct policy findings keep their own identities.
- An explicitly scoped boundary dependency can witness a forbidden edge if its identity and declaration are recorded.
  It never grants complete knowledge of the supplier. Existing circular declarations are shown as context, not
  silently treated as an approved exception to a user policy.
- Native candidates reuse recorded annotations; do not infer a missing direct dependency from an absent edge in an
  arbitrary partial graph. Existing runs remain readable without a schema or extraction migration.

### Report lifecycle, evidence and cost

1. Opening Review requests analysis of the server's advertised run and a validated rules snapshot. Display Loading;
   keep ordinary map interaction available. Recheck reloads policy explicitly without invoking extraction or LLVM.
2. Cache generated reports under that target's `review/cache/`, keyed by graph/read-index identity, relevant manifest
   context, full policy digest and evaluator/profile version. Triage is not part of this cache. Repeated requests share
   one in-process evaluation; coordinate cache publication across servers using existing workspace locking patterns.
3. Stream indexed canonical references once per uncached analysis. Restrict build adjacency to the selected relation
   family and memoize ancestor ownership. Cycle detection is linear in that graph. Do not calculate all-pairs paths,
   all cycles or scan native references per rule, pointer move, zoom frame or rendered representative.
4. Reports retain exact counts, affected canonical IDs, applicability, limits, evidence fingerprints and bounded
   witnesses. Serve finding lists in bounded pages, not all native call sites. Preserve weighted exact-reference
   counts separately from the number of findings and affected modules.
5. Reuse existing exact-reference queries. A run-bound witness locator can use its source/target, cursor and limit;
   verify the returned original edge ID before presenting it as evidence. Other calls between the pair are contextual
   references, not automatically additional offending witnesses. Do not create a second exact-reference store.
6. Corrupt/incompatible caches rebuild from the pinned read index. Invalid policy or failed analysis is visible as
   unavailable/error; never substitute an old successful report as current or prevent module exploration/publication.
   Do not return or cache a truncated analysis as a complete result when a resource limit is reached.

### Map and inspection

- Add one optional Review control with active violation/candidate totals, a separate acknowledged count and a paged,
  keyboard-accessible list. Default off. Keep the existing trace colors and reference filters unchanged.
- By default, exclude acknowledged findings from active badges and the active list. Show acknowledged includes them
  with their original severity and explicit acknowledgement state, providing inspection and Reopen. This presentation
  control does not change policy, triage or evidence. An acknowledged-only entity has no active badge.
- Map affected canonical IDs to their current representatives and show small passive red/yellow badges with a
  symbol/count, not color alone. Deduplicate finding IDs per collapsed representative and in global totals. One
  cycle is not counted again for every participant or file alias. Review findings hidden by map filters remain in
  the list and are described as off-view; filters never change the verdict.
- Badge placement must not enlarge node geometry, add graph nodes/edges or introduce another pointer interception
  layer. With Review enabled, the existing click/keyboard inspection of a marked entity puts its findings immediately
  below the entity heading, before metadata and reference lists. A single finding shows its explanation, evidence and
  acknowledgement actions inline in that one gesture; multiple findings use a compact, paged summary with actions.
  The Review list is an alternative route. Preserve node/label/wire hit priority and ordinary entity inspection.
- Details show rule/rationale, focused entities, target/context, evidence, limitations, likely impact and one or two
  conditional investigation steps. For a cycle, inspect the witness and consider a boundary/interface change; do not
  prescribe breaking an intentional cycle. For native notes, inspect the call and build chain before editing rules.
- Reuse source links and exact-reference paging. Closing Details, Clear, Escape or empty-space click cancels review
  inspection too; late requests cannot reopen it. Opening evidence may deliberately navigate, but hover never fits,
  unfolds or moves the scene. Selecting a finding is not a source modification.
- Fetch a compact affected-entity index once per report; use incident-finding lookups on projection changes. Bound
  retained report pages and clear pending work on target/report switches. Review off adds no per-frame graph scans.

### Durable triage

- Store Accept risk and Not relevant, with an optional bounded reason, under the target's `review/triage.json`.
  These are the two acknowledgement categories; dismiss is not a third permanent hiding mechanism. Reopen returns
  a finding to the active list and badges. Acknowledged findings remain inspectable through Show acknowledged and
  counted separately, never labelled fixed. A successful acknowledgement removes the active marker/list entry and
  updates collapsed-group/global counts; a refused write leaves the displayed state unchanged and reports the error.
- Stable finding identity uses rule ID, finding kind and canonical subjects (directed pair or sorted cycle members),
  scoped to the compatible profile/target/platform/configuration. Never use screen position, file aliases, reference
  group numbers, witness ordinal or run ID as the cross-run identity.
- Bind a decision to the rule's effective semantic definition/evaluator version and a semantic fingerprint at A4's
  granularity: affected modules, constraint-relevant typed dependency relations, cycle membership/internal relations
  or the native candidate's missing-direct-dependency state and relevant build context. Changed rule semantics,
  affected modules or those relationships reopen the finding with an explanation. Unrelated rule edits do not.
- Exclude raw reference/symbol IDs of individual call sites, line/column drift, selected witness choice, display text
  and input order from that fingerprint. Source paths matter only where they change policy applicability or module
  ownership. Additional call sites/count changes for the same module-pair concern do not alone reopen it; this MVP
  reviews that module relationship, not every call. Do not add fuzzy symbol matching or alter canonical IDs.
- Keep report cache identity and exact witness validation content-sensitive. A location-only edit regenerates the
  report and supplies current reference IDs/source links while preserving matching triage; never reuse stale pages
  or weakened exact-reference checks to make acknowledgement persist. A5 does not freeze evidence or infer coverage.
- Preserve acknowledgements across compatible runs only when semantic bindings can be established. Unknown
  compatibility cannot silently reuse a decision. An absent finding is "not observed in this report", not automatically
  resolved, especially under reduced coverage. ArchUnit's line-insensitive baseline supports avoiding location noise;
  Laniakea still keeps explicit user triage and current exact evidence separately.
- One triage owner serializes read/validate/merge/atomic replacement, including other local server processes. Validate
  target, report digest, finding, state, reason and revision; reject stale writes rather than losing another tab's decision.
  Unknown/unavailable triage is an error, not an empty store. Do not discard records for temporarily absent findings.
- Reuse localhost, Host/origin, JSON/body limits and safe text-rendering protections. A rejected request or interrupted
  write must preserve the previous valid triage, rules, canonical data and every layout byte.

### Alternatives and future limits

- A browser-only detector avoids a backend report route, but downloads/scans exact evidence and cannot efficiently
  reuse profile facts or coordinate durable triage. A static extraction-time report makes policy edits require analysis
  reruns or introduces a second evaluator path. Neither meets the current need as simply as on-demand indexed review.
- External architecture tools offer useful rule patterns, but require another parser/dependency pipeline and cannot
  directly preserve this graph's exact provenance. No new runtime dependency is justified for three checks.
- Compatible-run evolution is a separate later capability: compare profile/tool semantics, target/platform/configuration,
  rules, subject identities, relation families and coverage before saying introduced/removed/worsened. Acknowledge
  persistence in this MVP is not proof of historical improvement. Never compare module-only and native runs as equals.
- Git change coupling needs repository/history access and its own evidence contract. No Git scanning, history retention,
  hotspot scoring, learned ranking or metric-based escalation in this change.

## Required invariants

1. Findings reference canonical facts; no invented dependencies, ownership, public-interface hops or declaration IDs.
2. Configuration, build dependencies, semantic calls, real recursion and generated owner-local references stay distinct.
3. Rule applicability and sufficient positive evidence precede a red result; unknown coverage never becomes conformance.
4. Profile meanings stay in the profile; generic fixture behavior requires no Unreal assumptions.
5. Optional review cannot trigger native analysis, alter target selection, replace latest or block an ordinary map.
6. Inspection cancellation, label/wire priority, gradual wheel navigation and saved positions remain unchanged.
7. Findings are regenerable, policy and triage are separate durable local input; no parallel graph or source-of-truth store.
8. All learned data and decisions stay ignored, local and offline; tracked examples use only synthetic projects.
9. Acknowledgement changes active presentation, not severity or facts. Semantic changes can reopen a finding;
   location-only changes refresh exact evidence without invalidating the decision under A5.

## Implementation tasks

- [X] Establish failing acceptance cases below against existing synthetic fixtures; record baseline map/pin hashes and
  matched scene timings. Add the smallest policy/report contracts and validators under the review owner, not graph v1.
- [X] Extend the read index with bounded streaming access to canonical references. Implement the generic forbidden-edge
  and SCC checks plus the optional Unreal adapter consuming existing native notes; test applicability and limitations.
- [X] Add on-demand report generation/caching and paged local routes to the existing server. Keep failure independent of
  serving/extraction. Add the coordinated triage writer with stale-write and no-mutation refusal tests.
- [X] Add the Review list, passive projection badges and existing-Details integration. Verify exact witnesses and late
  response cancellation, direct marked-entity inspection and active/acknowledged visibility before presentation polish.
  Do not add pointer targets or a second scene layer.
- [X] Prove semantic-versus-location triage reuse, reopen/restart/cross-run behavior, bounded retention, generic
  compatibility, privacy and saved pins.
- [X] Run the real Unreal walkthrough and matched performance checks; fix only demonstrated gaps in this scope.
- [X] Migrate contracts to the stable owners below, inspect the complete diff, then record evidence/limitations and archive
  this plan per the todo lifecycle. No automatic commit or publication.
  Contracts and implementation evidence are migrated; the D8 Engine run closes Q1's acceptance gap.

## Test-first and verification plan

### Red evidence required before implementation

This is a feature, not a reproduced renderer bug. Existing tests establish a baseline; they do not prove these outcomes.
Observe each permanent guard fail for its missing contract before implementing it. Use recorded sample-shaped build
edges and compiler annotations; no private project material in fixtures.

| case and evidence type | currently missing behavior; required discriminating assertion |
|---|---|
| Policy witness - permanent guard | A configured `SampleDomain -> SampleUI` prohibition yields one red directed-pair finding and exact declaration evidence; allowed direction, explicit exclusion and an unrelated pair yield none. |
| Cycle semantics - permanent guard | Three build modules yield one SCC candidate and a real closed witness. A diamond, legitimate Engine hub and ordinary calls/recursion do not. An explicit applicable acyclic rule changes the result to red. |
| Scope/coverage - permanent guard | Boundary-only/partial inputs never imply clean results; unknown selectors, unsupported families, missing native facts and malformed policy have distinct observable outcomes. Recorded positive witnesses remain valid despite unrelated missing coverage. |
| Existing native notes - permanent guard | Collect annotated calls by module pair, keep counts and exact paths/locations; ignore unannotated calls and compiler/SDK providers. No native run means unavailable; old notes never imply exhaustive coverage. |
| Determinism/scale - permanent guard | Edge/node reorder and an alternative valid witness preserve finding identity, semantic fingerprint and decisions. A large synthetic SCC does not enumerate all cycles; paged findings preserve totals and witnesses without emitting every call. |
| Evidence route - permanent guard plus browser acceptance | Every witness resolves to its exact canonical ID in the pinned run. A stale locator, late page or wrong pair cannot be shown as offending evidence. Contextual pair pages are labelled separately. |
| Triage semantics - permanent guard | Acknowledge/reopen persists across restart and matching runs. Rule semantics, affected module/typed relation, SCC internal-edge or relevant context changes reopen; unrelated rules and ordering do not. Missing/disabled rules do not erase decisions or label findings fixed. |
| Location drift - permanent guard plus browser acceptance | Insert a line above an unchanged annotated call, change its line/column and raw reference ID, and verify matching triage stays acknowledged while current exact paging/source links resolve the new location. Adding another call to the same pair alone stays acknowledged; changing the affected module relationship reopens. Include location-sensitive lambda IDs without fuzzy matching. |
| Acknowledged visibility - permanent guard plus browser acceptance | Accept risk/Not relevant removes the finding from the active list and every aggregated active badge, preserves severity and increments the acknowledged count. Show acknowledged exposes inspection/Reopen; Reopen restores active badges. A refused write changes none of those counts. |
| Failure/concurrency - permanent guard | Two-tab/process updates serialize or conflict explicitly; stale/malformed/foreign-origin writes and interrupted publication leave prior bytes intact. Corrupt stores are not silently replaced. Analysis failure leaves the map usable. |
| Projection - permanent guard plus browser acceptance | Collapsed modules, namespaces and contextual files aggregate unique findings; aliases/participants do not multiply global totals. Filtering changes visibility, not rule results. |
| Direct explanation - browser acceptance | One click or keyboard inspection of a marked entity reveals a single finding's explanation, evidence and triage actions above metadata/paging. Aggregated multiple findings remain reachable; node/label/wire priority and ordinary Details still work. Review off does not fetch analysis through node clicks. |
| Operator workflow - browser acceptance | Open Review, inspect a marked entity or use the list by keyboard, inspect exact source, acknowledge, Show acknowledged, Reopen, close and reload. No late reopen, blocked wire hit, zoom jump, new graph elements or pin movement. |
| Readability - reviewer judgement | A fresh C++ developer can distinguish violation, candidate, acknowledgement and unavailable analysis; understand the evidence and next investigation step without reading a manual. |

### Green evidence and runtime acceptance

- Run focused new evaluator, report/cache, triage and projection tests first, then the existing commands in
  [verification entrypoints](../../tests/README.md). Run documentation/privacy checks after final doc migration.
- Extend existing browser functions for the affected controls, then run all existing browser suites with disposable
  synthetic targets. Test keyboard, narrow viewport, Escape/Clear, overlapping wires, gradual inward/outward wheel,
  target switches and delayed responses. These are real input tests, not only direct JavaScript calls.
- On a real local Unreal project, compare module-only and native snapshots in their own recorded contexts. Prove a
  configured boundary check, inspect one genuine candidate if present, and disclose checks with no applicable facts.
  Never manufacture a real-project violation or run a costly extraction solely to fill a screenshot.
- Hash all existing layouts before/after review, navigation, triage, restart and policy recheck. Require byte identity;
  use disposable synthetic layouts for drag/reset regression suites. Canonical run/index data also remain read-only.
- Use [the existing performance harness](../../tests/viewer.performance.js) with matching graph, scope, camera, filters,
  expansions, machine/load and repeated trials: Review off versus on, cold generation, cache hit and first hover after
  pan/zoom. Record wall time, analysis phases, peak memory, payload/page size, interaction/frame p95 and maximum.
  Reject repeatable materially worse interaction; do not claim a fixed 10% threshold or compare different scenes.
- Confirm no per-frame analysis, unbounded browser page retention, project writes, runtime network or native-tool
  loading in the module-only path. Keep raw timings and observations in ignored scratch, real screenshots outside
  the clone, and public test evidence synthetic.

## Documentation plan

- **New authoritative concern:** `docs/architecture/review.md` owns rule meaning, applicability, evidence, triage and
  report lifecycle. No existing stable document owns this capability. Executable field shapes belong to its validators,
  configuration examples and tests; do not hand-copy them into multiple documents.
- **Navigation:** add one route in `docs/architecture/README.md`. Add the review component to `structure.md` and its
  relationships only to `diagrams/main.md`; link the concern instead of restating its contracts there.
- **Consumers:** `graph-model.md` owns projection/inspection effects only; `unreal-profile.md` owns adapter fact
  requirements only; `docs/guide.md` owns the operator workflow and distinguishes implemented checks from questions
  that still need manual review; `tests/README.md` routes to new checks. Keep research rationale in the review concern
  only where it explains a choice.
- **Capability wording:** describe automatic candidates versus configured policy violations only after implementation.
  Current README/guide correctly describe exploration and manual judgement; do not advertise the pending review layer
  or automatic hard Unreal diagnoses. Runtime/Editor constraint detection remains outside this MVP.
- **Lifecycle:** no stable file links to this todo; no task routing added to `todo/README.md`. On completion record the
  outcome here and move to `todo/done/`, rebasing links and preserving decisions/history under D5.

## Rollout and rollback

Review ships disabled by default. A bad policy/cache disables review with a diagnostic, not the explorer. Discard only
disposable report caches when rebuilding; preserve policy, triage, pins and immutable runs. Disabling/removing the
feature must leave those local decisions intact. No graph schema or identity migration is planned.

## Completion criteria

- All three checks produce the specified positive/negative/unknown outcomes with exact, inspectable witnesses.
- Acknowledgement clears active clutter, Show acknowledged/Reopen works, marked entities explain findings in one
  gesture, and harmless coordinate drift preserves triage while meaningful module-relation changes reopen it.
- Real-use walkthrough proves useful explanation and durable triage; synthetic UI regressions and matched timings
  pass without damaged pins, extraction coupling or materially worse navigation.
- Stable owners describe implemented behavior, no unverified whole-architecture claim remains, and this plan is archived.
- Approval of this investigation alone does not establish implementation or runtime acceptance.

## Review record

### 2026-11-12 - Investigation

- Repository boundaries and primary research checked. Recommendation is A1-A4; no runtime feature implemented.
- Existing baseline: 159 JavaScript tests passed; 38 focused Python read-index, Unreal graph, external-dependency,
  documentation and privacy tests passed. No Engine/native extraction or browser feature acceptance was run here.
- Existing uncommitted contributor/documentation work is outside this task and remains untouched. Only this todo
  is an intended repository edit; investigation diagnostics are ignored.

### 2026-11-12 - Product-contract audit

- F1-F3 accepted under D6: active/acknowledged visibility, semantic triage bindings and direct marked-entity Details
  are specified with discriminating acceptance cases. A5 added; this remains a plan, not implemented behavior.
- F2 is supported by the native reference-key construction. Exact evidence stays location-sensitive; triage does not.
- Clarifications: the audit introduces "two" corrections but lists three. Its product-warning point is future guidance,
  not a current README defect: the published guide explicitly requires manual judgement for the listed checks.
- Verification: all four existing documentation/privacy tests passed; ASCII and diff whitespace checks passed.
  No runtime code changed. The new semantic/UI acceptance cases remain requirements for future implementation.

### 2026-11-12 - Implementation under D7

- Implemented the three bounded module-level checks, optional Unreal interpretation, local JSON policy, on-demand
  checksum-verified report cache and coordinated revision-checked triage. Canonical graph/schema/extraction and pins
  are unchanged. Generic checks operate on indexed recorded facts; no parser, database, dependency or service added.
- Review starts off. Existing icons receive passive counts; the paged list and marked-entity Details expose exact
  evidence and decisions. Acknowledgement removes active clutter. Recheck failure clears stale presentation while
  ordinary exploration remains usable. Background updates preserve the ordinary Details reader and keyboard focus.
- Durable contracts migrated to the planned stable owners. The todo README remains lifecycle-only.

#### Discriminating bug evidence

- `tests/review.browser.js`, delayed initial-analysis case: keeping focus on the ordinary inspection control failed
  because analysis completion rebuilt all Details. Updating only its findings slot passes the same guard. A keyboard
  acknowledgement guard also failed when the removed action lost focus; completion now returns focus only when the
  initiating action disappeared and the operator has not moved elsewhere.
- `python -m unittest test_server.Server.test_post_refusal_delivers_response_with_an_unread_body`: the baseline
  server response method, replayed unchanged in an isolated probe, fails with Windows connection-aborted error 10053
  when a finite rejected POST body arrives late. The bounded refusal drain passes and preserves layout bytes.
  Host/origin refusal remains enforced. This adjacent fix makes existing refusal checks reliable on Windows.
- The source-surface browser camera assertion failed identically against baseline and changed code. Its inward
  pointer positions changed between nested centres, while outward inputs held the last position. Reverse the actual
  integer-CSS pointer sequence; retain the original strict camera assertion. No production camera behavior changed.

#### Final execution evidence

| command or route | result and boundary |
|---|---|
| `node --test tests/icons.test.cjs tests/sections.test.cjs tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs tests/review.test.cjs` | 163 passed |
| `python -m unittest test_review` with `PYTHONPATH` including `tests` | 20 passed; includes location-sensitive callable identity drift, exact current evidence, policy exclusions and retained decisions |
| Whole non-Engine suite via ignored selection runner, LLVM enabled | 177 executed: 173 passed, four optional skips; only the three previously blocked Engine cases excluded |
| `python -m unittest discover -s tests` initial run | Three Engine failures at the UBT conflicting-instance guard; no Engine assertions reached |
| `python -m unittest test_engine_integration` focused replacement | Same three pre-assertion refusals; Q1 governs another attempt |
| `python -m unittest -v test_engine_integration.RealEngine` under D8 | Three passed, none skipped; project-write boundary, recorded export and dependency regeneration assertions reached |
| Eight existing Playwright browser functions plus two Review scenarios | All ten passed through live Chromium and ordinary disposable pipeline/index/server fixtures; no JavaScript runtime errors |
| Real local published native map, ordinary localhost route | Genuine candidate inspection and exact source evidence verified; module-only fixture explicitly reports native analysis unavailable |
| Existing performance harness, three matched off/on pairs in each of two real scenes | No repeatable material interaction regression established; occasional long frames remain. Cold lookup is a cost proxy, separate from full input settling |
| Isolated uncached real-index review worker and warm pages | Cold/warm time, payload and worker lifetime peak working set recorded; no LLVM module loaded. Main-server sampling was only a bounded observation window |
| Layout and canonical/index checksum comparisons | All pre-existing layout bytes unchanged; served canonical graph and index still match their publication marker |
| Documentation/privacy tests and local hook-pattern worktree scan | Passed; no staging, commit, push or remote writes |

Raw execution logs, measurements and diagnostics remain in ignored `workspace/tmp/architecture-review/implementation/`;
real screenshots remain outside the clone. No analysed-project identifiers, counts or timings are copied here.

#### Final acceptance

The feature is implemented and available from Review in the local server. The D8 focused run passed all three
Engine cases after UBT became idle. Combined with the separate non-Engine run, Python evidence covers 176 passing
tests and four optional skips; skipped paths are not claimed verified. No further code change or costly native
re-extraction was needed for this read-only review feature. Optional analysis remains evidence-limited, and
occasional long frames remain a measured usability limit. Completed plan archived under D5; no commit or push.

### 2026-11-12 - Implementation audit corrections under D9

- F1-F3 confirmed against the committed implementation. Empty forbidden selectors implicitly matched all modules;
  native fingerprints included unrelated outgoing dependencies; advertised graph types bypassed profile applicability.
  No finding required refutation. Default cycle scope and explicit wildcard selectors remain intentional all-module cases.
- Three focused regression methods failed before production changes, including false violations, unavailable status
  becoming partial and an acknowledged native pair reopening after an unrelated dependency. All now pass. Corrected an
  existing regression that had treated an unrelated outgoing edge as a meaningful native-context change.
- Empty forbidden selectors produce unavailable checks. An unavailable selector cannot become applicable merely
  because another selector matches a boundary module. Unsupported or mixed unsupported families are unavailable;
  supported Unreal build dependencies and explicitly configured generic imports retain their positive controls.
- Native fingerprints use the directed pair's typed build relations and recorded reachability states. Direct dictionary
  lookups replace scanning every build relation for each native pair. A native-only semantic version invalidates
  incompatible acknowledgements without changing cycle/boundary fingerprints or deleting stored decisions.
- Updated the existing stable review contract. No new graph, parser, schema, renderer or task document was introduced.

Verification:

- `python -m unittest test_review`: all 23 passed. `python -m unittest test_server test_review test_documentation
  test_privacy`: all 47 passed, including live HTTP availability and explicit-positive controls.
- Whole non-Engine suite with available LLVM: 181 executed, 177 passed, four optional skips. The three Engine cases
  were not rerun for these read-only evaluator changes; D8's execution remains historical evidence, not a new result.
- Existing JavaScript suite: 163 passed. Both Review Chromium scenarios passed on the final run. An earlier run
  timed out on entity inspection; an isolated repeat and the combined final run passed. Its cause was not established,
  so no unrelated pointer or rendering behavior was changed to fit that observation.
- Restarted the local server; real snapshot review regenerates under current code, module-only analysis stays explicit
  about unavailable native facts, and canonical/index checksums remain valid. Existing layout, policy and triage bytes
  are unchanged. No private project values or measurements are copied into this record.
- Documentation, syntax, whitespace and local privacy checks passed. No staging, commit or publication performed.
