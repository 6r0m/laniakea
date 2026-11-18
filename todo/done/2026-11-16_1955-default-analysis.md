# Continuous useful analysis with safe reuse

**Status:** DONE - Gates 1-3 verified; Gate 3 review corrections accepted

The investigation and plan preserve their original evidence. The final review record documents implementation and closure.

**Scope:** continuous monitoring, default code-health collection, safe reuse and validated live map updates  
**Stable documentation owners:** [Unreal profile](../../docs/architecture/unreal-profile.md),
[Review](../../docs/architecture/review.md), [viewer](../../docs/architecture/viewer.md), [guide](../../docs/guide.md)

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Non-goals](#non-goals)
- [Verified evidence](#verified-evidence)
- [Current architecture and source of truth](#current-architecture-and-source-of-truth)
- [Problem and root cause](#problem-and-root-cause)
- [Decision](#decision)
- [Acquisition outcomes and failure policy](#acquisition-outcomes-and-failure-policy)
- [Monitoring and snapshot handoff](#monitoring-and-snapshot-handoff)
- [Required invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks)
- [Test-first and verification plan](#test-first-and-verification-plan)
- [Documentation plan](#documentation-plan)
- [Rollout and rollback](#rollout-and-rollback)
- [Completion criteria](#completion-criteria)
- [Review record](#review-record)

## Goal

Give developers useful recorded code-health and architecture concerns through normal Laniakea use, without needing
to select expert analyzer flags. Source edits should update the map and findings during exploration without losing user
state. Missing coverage and ongoing work remain visible; unchanged analysis is reused safely.

## Authority register

### Operator decisions

- **D1:** Investigate default problem analysis so Laniakea gives users more understanding out of the box.
  - Effect: default collection and its coverage must be evaluated together, rather than merely adding another analyzer.
  - Reason: the operator wants more understanding without expert setup choices.
  - Source: operator request, 2026-11-16.
- **D2:** Investigate reusable caching with correct invalidation; a changed module was an example, not a prescribed cache unit.
  - Effect: choose invalidation from each analyzer's actual dependencies and prefer existing or upstream mechanisms.
  - Reason: not stated beyond avoiding unnecessary analysis.
  - Source: operator request, 2026-11-16.
- **D3:** Continuously monitor changes and investigate delta analysis using industrial practice appropriate to Laniakea.
  - Effect: revise the build-only recommendation to cover background work and safe live snapshot adoption.
  - Reason: not stated beyond the requested continuous, delta-based behavior.
  - Source: operator answer to Q1, 2026-11-16.
- **D4:** Implement this approved plan with implement-approved-change.
  - Effect: implement and verify the three delivery gates, respecting their value and safety gates.
  - Reason: not stated.
  - Source: explicit operator implementation request, 2026-11-17.
- **D5:** Investigate the actual CPD bottleneck before choosing the default. Do not accept 100 as a fallback for the
  failed short-clone gate; profile the same complete corpus at 50 with bounded 1/2/4 GB heaps, and 8 GB only if safe.
  - Effect: preserve strict/global matching and exact evidence, examine pinned PMD and upstream work, check output limits,
    and return measured cause/resource costs/solution for review before proceeding with Gates 2-3 or enabling defaults.
  - Reason: a hard-coded heap cap and upstream matching scalability may be the limit; lower-quality fallback is not approved.
  - Source: operator answer to Q2, 2026-11-17.
- **D6:** Evaluate the Gate 1 closeout review and apply valid functionality/scalability corrections.
  - Effect: verify memory-admission usability, ordinary-build automatic collection and relevant native integration;
    preserve the accepted architecture and independently gated monitoring/adoption work.
  - Reason: the operator requested correction against actual code and prior agreements.
  - Source: operator review-and-fix request, 2026-11-17.

### Operator gates

- **Q1 [CLOSED by D3]:** Should automatic source collection run on build, on opening, or continuously after edits?
  - D3 selects continuous monitoring; the lifecycle, publication and acceptance sections below now cover it.
- **Q2 [CLOSED by D5]:** Retain 100 tokens as the automatic
  default, or investigate a larger bounded CPD budget before selecting the default? The full real corpus completes at
  100 after the isolated-input newline correction, while 50 exhausts the existing 1 GB Java heap. D5 selects investigation;
  it does not authorize the fallback. Gates 2-3 wait for the requested evidence review.

### Working assumptions

- **A1 [RESOLVED by D3 - not selected]:** Collect automatically on `build`; keep `up` a reader of saved runs. Source watching and background
  publication during viewing are outside this delivery, preserving the accepted build/view separation.
- **A2 [ACTIVE]:** Automatically use the validated local CPD installation when present. Missing optional tooling is
  visible unavailability, not an instruction to download or install host software automatically.
- **A3 [VERIFIED FOR THE MEASURED CORPUS]:** The strict 50-token floor passed complete frozen-corpus and independent
  short-clone controls. Ordinary CLI builds use that provider default through automatic collection.
  Findings still require human review, and this evidence does not establish universal scalability or acceptable noise.
- **A4 [ACTIVE]:** Identifier normalization is a separately labelled, opt-in collection mode only after a real usefulness
  gate. It is not an additional simultaneous default scan; literal normalization is excluded.
- **A5 [ACTIVE]:** Preserve explicit native indexing and defer Clang-Tidy implementation. Its real Unreal context,
  actionable findings and cost remain unproved. Installed executables are not automatically supported providers.
- **A6 [ACTIVE]:** Use Windows directory notifications through a narrow Python standard-library adapter. Events mark
  inputs dirty; content verification, not event history or timestamps, controls reuse. Reconcile missed events explicitly.
- **A7 [REJECTED by evidence - F5]:** `up` owns monitoring for registered targets with saved maps, with globally bounded, fair work. No
  unrelated project discovery or background lifetime after `down`. Provide an explicit saved-only opening mode.
- **A8 [ACTIVE]:** Keep one effective analysis recipe per target. Automatic jobs retain previously selected native
  depth, target/configuration policy and health options instead of silently downgrading a symbol map to modules.
- **A9 [ACTIVE]:** Monitor one launch-selected target by default. Historical registrations remain available as saved maps;
  further targets require explicit session activation. Activation is not inferred from registration or an old browser tab.

## Non-goals

- Detecting every bug, proving SOLID compliance, deciding intended architecture or automatically modifying source.
- A separate daemon, persistent service, new port, pointer-triggered analysis or a full Unreal game build on save.
- Per-keystroke analysis, whole-volume tracking or portable watcher backends.
- Replacing the parser, renderer, canonical graph, read index, layout store or Review system.
- Rewriting native caching, restricting cross-module analysis to the edited module, or introducing a generic cache service.
- Engine-internal expansion, other languages, host-wide installation or runtime downloads.

## Verified evidence

Baseline: `05d96ae`; the working tree was clean before this investigation. Experiments use synthetic sources and the
existing local tools. No production code, stable docs, tests or analysed-project sources were changed.

### Facts and controlled results

1. [CLI](../../laniakea/cli.py) makes health explicit; `up` does not collect source facts. Review already starts automatically
   for a supported saved target through [viewer/review.js](../../viewer/review.js).
2. [CPD](../../laniakea/unreal/cpd.py) collects strict matches with a default floor of 100. Its Java bridge uses PMD tokens
   for exact ranges and fingerprints. [Review defaults](../../laniakea/review_policy.py) independently specify 100, and
   [the evaluator](../../laniakea/review.py) also falls back to 100.
3. A real PMD 7.29.0 probe used four small C++ files: A/B share a readiness loop, C renames its local identifiers, and D
   implements different control flow. All four files were processed in each of eight runs:

   | mode | floor | result |
   |---|---|---|
   | strict | 100 | no match |
   | strict | 50, 40, 30 | one 50-token A/B match; C and D excluded |
   | ignore identifiers | 100 | no match |
   | ignore identifiers | 50, 40, 30 | one 52-token A/B/C match; D excluded |

   Java invocation times were 0.609-0.723 seconds on this tiny corpus. This is mechanism evidence, not a real-project
   throughput or precision claim. [Probe](../../workspace/tmp/default-analysis-investigation/probe.py),
   [namespace-aware output reader](../../workspace/tmp/default-analysis-investigation/read_probe.py),
   [results](../../workspace/tmp/default-analysis-investigation/probe.json).
4. The current real pipeline collected the short pair at 50, but default Review emitted no duplication finding because
   its threshold remained 100. An unchanged repeat launched no Java process; one source edit invalidated reuse:

   | synthetic pipeline case | Java jobs | reuse | total seconds |
   |---|---|---|---|
   | cold | 1 | no | 0.826 |
   | unchanged | 0 | yes | 0.115 |
   | one file changes, eliminating the match | 1 | no | 0.677 |

   [Reproduction](../../workspace/tmp/default-analysis-investigation/pipeline_probe.py),
   [results](../../workspace/tmp/default-analysis-investigation/pipeline-probe.json).
5. [Existing CPD reuse](../../laniakea/unreal/cpd.py) compares the complete selected source inventory, owners, scope, tool
   identity and threshold with the immediately preceding run's validated artifact. It is corpus-wide, not per module,
   and does not search arbitrary historical runs after an intervening run without health evidence.
6. [Native cache](../../laniakea/unreal/symbol_cache.py) already works at compiler-job scope. It binds command/tool/code/
   environment identity, rechecks preprocessing and exact input bytes, including newly appearing optional headers.
   It avoids repeated indexing, not all preprocessing, copy, export or normalization work.
7. [Review cache](../../laniakea/review_store.py) is disposable and keyed by the read index, manifest, policy and evaluator
   code. Triage remains separate. Global dependency cycles can change through another module; they are not a safe
   independently cached per-module property.
8. The [existing baseline command](../../workspace/tmp/default-analysis-investigation/baseline.py) ran 21 tests with no
   skips or failures, including real CPD reuse/refusal and native preprocessing/negative-header controls. Results:
   [baseline-tests.json](../../workspace/tmp/default-analysis-investigation/baseline-tests.json).
9. [Server](../../laniakea/server.py) checks freshness before serving and pins its target index, views and Review owners
   at startup. Reference URLs carry a read-index identity; manifest/shard and layout URLs do not pin a run. Merely noticing
   a new latest pointer would not safely refresh these consumers.
10. [Navigation](../../viewer/app.js) treats only a target-id change as a new map; [scene restoration](../../viewer/scene.js)
    refuses a different run. [PositionCache](../../viewer/positions.js) deliberately retains failed writes. Automatic adoption
    needs a same-target/new-run route, not a call to existing navigation or a page reload.
11. A standard-library Windows probe received a notification after atomic replacement and drained a cancelled pending
    directory watch. This proves local API availability, not event decoding, overflow recovery or production performance.
    [Probe](../../workspace/tmp/continuous-monitor-investigation/native_probe.py),
    [result](../../workspace/tmp/continuous-monitor-investigation/native-probe.json).
12. [Unreal collection](../../laniakea/unreal/__init__.py) fingerprints requested health sources before collecting the graph;
    a later CPD error also propagates through the whole pipeline. [Coverage schema](../../schema/graph.v1.schema.json)
    presently has prose lists and counts, not structured acquisition outcomes. Existing fail-closed behavior is correct for
    explicitly required analysis, but cannot become the default optional-provider policy unchanged.
13. [UBT](../../laniakea/unreal/ubt.py), [CPD](../../laniakea/unreal/cpd.py) and
    [native workers](../../laniakea/unreal/compiler.py) use blocking subprocess calls with 900-second timeouts. Native
    preprocessing has its own [180-second timer](../../laniakea/unreal/symbol_cache.py); cancelling a future does not stop a
    running child. [Service stop](../../laniakea/service.py) waits up to 10 seconds after the stop acknowledgement for lease
    release. These are different limits; the current analysis paths cannot promise bounded viewer shutdown.
14. [CLI target selection](../../laniakea/cli.py) writes registration/settings before health-option validation and extraction.
    [Workspace publication](../../laniakea/workspace.py) later replaces the latest pointer separately. A failed extraction
    can therefore leave new settings beside the old map. The prior recipe paragraph did not resolve crash consistency.
    A [synthetic CLI probe](../../workspace/tmp/default-analysis-review/check.py) reproduced registration after an invalid
    health-option request returned 2 without publishing a map: [result](../../workspace/tmp/default-analysis-review/settings-probe.json).
15. The [Review isolation contract](../../docs/architecture/review.md#lifetimes-and-failure-isolation) makes evaluation
    independent of map serving/publication. Current Review construction binds a run/index; evaluation happens later in
    [Review.load()](../../laniakea/review_store.py). [Browser startup](../../viewer/app.js) currently resolves no-URL selection
    through remembered target state. [Startup target indexing](../../laniakea/server.py) checks freshness for registrations;
    saved-map viewing today is not a guarantee of no source scanning.

### Upstream evidence and reviewer assessment

- PMD's pinned [CPD documentation](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd.html) confirms C++ identifier
  and literal normalization. It is correct to reuse CPD before selecting another duplication analyzer.
- PMD's [incremental analysis documentation](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_incremental_analysis.html)
  concerns PMD rule analysis. The installed `cpd --help` exposes no `--cache` option. This does not establish a reusable
  persistent incremental CPD cache; do not pass PMD's rule-analysis cache options to CPD.
- LLVM's [21.1 complexity check](https://releases.llvm.org/21.1.0/tools/clang/tools/extra/docs/clang-tidy/checks/readability/function-cognitive-complexity.html)
  supports contributor diagnostics and a default threshold of 25. That validates the candidate tool, not its Unreal
  integration, comprehensive bug coverage or an automatic SOLID verdict.
- **Correction:** lowering only the CPD collection threshold does not make default Review show short clones; item 4
  demonstrates the missing end-to-end change. A universal 30-50 threshold is not established by an approximate count.
- **Correction:** zero findings in an unseen real scene cannot be explained conclusively by the flags alone. Review is
  already automatic; absent observations, partial scope, acknowledged findings and thresholds must be distinguished.
- Windows [ReadDirectoryChangesW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)
  supplies subtree notifications, but not changes to the watched directory itself. Overflow discards detailed events and
  requires enumeration. [CancelIoEx](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelioex)
  requests cancellation without waiting; completion must drain before request storage is released.
- [VS Code watcher internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals) describe deduplicated
  watches, exclusions and missing-path recovery. Those principles apply; its Electron/Node process architecture does not.
- [watchfiles 1.3.0](https://watchfiles.helpmanual.io/) provides notifications and batching, but requires Python 3.10+
  and a Rust-backed dependency. It is not a drop-in under this repository's Python 3.9+/stdlib core contract.
- Windows [change journals](https://learn.microsoft.com/en-us/windows/win32/fileio/change-journals) track volume changes.
  Startup reconciliation meets the present downtime requirement without a volume journal cursor or whole-volume access.
- **Qualification:** the reviewer's monitoring direction fits D3, but is not already supported. It changes reader-only
  opening and restart-to-adopt behavior while retaining separate acquisition, publication and viewer responsibilities.
  A watcher alone does not provide incremental analysis or safe browser adoption.

### Unverified areas

Gate 1 proves the selected strict collection floor on the measured real corpus, ordinary CLI acquisition and real
LLVM-plus-CPD integration over synthetic build inputs. Admission on 16/32 GiB hosts is scenario-tested, not a benchmark on
physical machines of those sizes. Lower collection floors, identifier normalization and Clang-Tidy remain outside that proof.
Continuous monitoring, directory-notification reconciliation, owned-process shutdown and live adoption remain unimplemented;
the earlier notification API probe does not prove them. Gates 2-3 retain their independent acceptance requirements.

## Current architecture and source of truth

| concern | existing owner |
|---|---|
| build requests, optional collection and publication | [CLI](../../laniakea/cli.py), [pipeline](../../laniakea/pipeline.py), [Unreal adapter](../../laniakea/unreal/__init__.py) |
| server lifetime and authenticated stop | [service](../../laniakea/service.py), [CLI](../../laniakea/cli.py) |
| target settings, writer lock and latest publication | [workspace](../../laniakea/workspace.py) |
| pinned reads and local layout writes | [server](../../laniakea/server.py), [layouts](../../laniakea/layouts.py) |
| bounded source corpus and tool identity | [source inputs](../../laniakea/unreal/source_inputs.py), [SourceTree](../../laniakea/unreal/source_tree.py), [CPD tools](../../laniakea/unreal/cpd_tools.py) |
| duplication collection and reuse | [CPD collector](../../laniakea/unreal/cpd.py), [Java adapter](../../laniakea/unreal/CpdBridge.java) |
| immutable source observations | [health](../../laniakea/health.py), [manifest schema](../../schema/graph.v1.schema.json) |
| findings, applicability and decisions | [Review contract](../../docs/architecture/review.md) |
| availability and finding presentation | [viewer contract](../../docs/architecture/viewer.md#review-presentation) |

Acquisition validates data; Review interprets it. Do not reintroduce a lower-layer dependency on Review policy to share a
numeric default. D1 and D3 change explicit-only acquisition and reader-only opening, not the ownership of facts.
No monitor or live-adoption owner exists in current code; the bounded coordinator below is a real new concern.

## Problem and root cause

Useful collection is hidden behind expert flags, and collection/display floors can disagree. The compact Review button
can show zero findings while checks are unavailable. Cache correctness already exists; a new module cache would not
solve discovery or coverage and could suppress cross-module evidence.
Events alone cannot refresh the pinned server/browser state. Treating events as exact deltas would also miss shared-header
effects, dropped notifications and cross-file duplicates.

## Decision

Under D1-D3, recommend automatic strict CPD collection when supported local tooling is present, continuous monitoring
owned by `up`, and safe adoption of validated updates. Show the last good map before background freshness scanning.
Reuse existing compiler, corpus and Review caches. Add A4 only after its value gate; A5 remains deferred.

### Premise / KISS gate

The operator needs saved edits reflected during exploration; A1 cannot meet D3. Reuse the existing viewer lifetime for
one bounded coordinator; the pipeline keeps publication authority and profiles keep dependency knowledge. Add a small
Windows notification adapter, coalesced work and a safe snapshot handoff, not a separate service, queue database, analyzer
framework or cache store. Brief local HTTP status polling lets browsers discover updates; source changes use OS events.
Give up per-keystroke immediacy and monitoring while the viewer is stopped. `build` remains one-shot; proposed
`up --no-watch` opens saved maps only; `down` stops the owned lifetime.

### Alternatives considered

| option | moving parts / trade-off | assessment |
|---|---|---|
| keep explicit collection, improve its button text only | no new mechanism, but still requires expert flags | insufficient for D1 |
| build-time defaults using current providers/caches | fewest parts, but no updates during viewing | A1 not selected by D3 |
| Windows notifications inside viewer lifetime | one adapter, bounded coordinator and safe snapshot handoff; no package/service | recommended under A6, A8-A9 |
| watchfiles or watchdog | external dependency lifecycle; watchfiles latest also raises Python floor | not selected under current core contract |
| periodic full source scans as primary trigger | no OS adapter, but recurring hash cost even when idle | recovery only, not primary trigger |
| Windows USN journal / external watch service | volume cursors, permissions or another runtime owner | unnecessary for session-scoped monitoring |
| per-module CPD reports | requires extra cross-module reconciliation and risks missed clones | reject; module boundaries do not partition clone relationships |
| new generic analyzer/cache framework | duplicates existing ownership without a second proven provider | reject |

## Acquisition outcomes and failure policy

Extend the existing manifest coverage contract, not a provider registry or second report store. The schema owns structured
outcome shapes; the profile produces them, the pipeline validates them, and CLI/Review/viewer consume them. Prose coverage
and summaries derive from the same outcomes. Health continues to own artifact validation only, not Review interpretation.

For each supported requested provider, record effective acquisition mode, requested scope/options, status and a bounded
reason code. Bind completed results to tool/input identity and their validated artifact. Reuse is a completed result with
reuse provenance, not another status. Diagnostic links stay root-relative within the private run; do not expose raw logs
as status messages. Do not invent successful identities for inputs that could not be read.

| outcome | evidence and presentation contract |
|---|---|
| completed | complete validated requested corpus; counts and findings available, including a genuine zero |
| unavailable | supported tool genuinely absent or capability unsupported; no claimed findings or clean result |
| disabled | explicitly off; no provider work or implied source coverage |
| failed | classified provider-local acquisition failure; reason/retry route, no successful health artifact |
| incomplete | requested scope was not fully processed; no partial findings accepted as a complete result |

Older manifests without outcomes remain readable: show unrecorded status where coverage cannot be established; do not
guess disabled from a missing health artifact. Runtime queued/running/cancelled states belong to the coordinator, not a
completed immutable artifact. Cancellation or superseded inputs abort that candidate, regardless of provider mode.

| acquisition mode / failure | publication policy |
|---|---|
| automatic CPD, classified tool/corpus/lexical/size/timeout failure | publish an otherwise validated current graph with explicit failed/incomplete CPD outcome; no current CPD findings |
| automatic CPD, missing tool | publish graph with unavailable outcome |
| explicitly required CPD or native analysis fails | retain the complete previous publication and its effective settings/recipe |
| health off | publish graph with disabled outcome; skip CPD |
| core build inputs, source boundary, graph/schema validation or unknown internal failure | fail the candidate; no reduced-success fallback |

This deliberately changes the previous blanket-failure proposal, not the required-mode safeguard. Isolate only typed,
provider-local failures; never catch every LaniakeaError as optional absence. An invalid tool inventory must refuse tool
execution, even in automatic mode. Corrupt published artifacts still fail validation rather than being silently discarded.
Separate CPD-only input capture from mandatory graph/native inputs so an optional unreadable CPD file cannot abort the
graph before the provider boundary. Core or physical-boundary failures still abort. Recheck mandatory inputs before commit.

Never attach an older health artifact to a new graph. Keep its exact evidence available only through its original run,
clearly historical. New failed/unavailable outcomes must invalidate current health findings without erasing triage. The
Review summary must say health failed/unavailable, not just zero candidates. Monitoring follows the requested recipe even
when no health artifact was produced. Unknown provider input identity is neither a cache hit nor fresh coverage.
Do not republish identical failures on every reconciliation tick; retry rules are owned below.

## Monitoring and snapshot handoff

### Lifecycle and input identity

The coordinator belongs to the existing CLI/service lifetime, not HTTP request handlers. It invokes the pipeline and never
writes canonical facts itself. Separate the OS adapter from scheduling so deterministic synthetic events can test the
coordinator while Windows tests exercise notification delivery.

Serve cached maps first. Until reconciliation finishes, freshness is `checking`, not `fresh`. Arm watches before taking
the baseline and retain intervening dirty generations to close the startup scan gap. Reconcile on restart because events
are not a persistent log. The first project still needs an explicit `build` to register source/engine context; do not infer
projects from the browser or discover unrelated repositories.

### Active targets

Use A9 instead of A7. Proposed `up <target-id>` activates that registered target; without an argument, select the existing
workspace.last() target and open that target by default. Print/show which target is monitored. All other registrations
remain cached browsing only: no source scan, watchers, UBT, Java or LLVM merely because they exist or a bookmark opens them.
Allow explicit same-origin activation/pause through existing target controls; selecting a cached map alone does not opt it
into analysis. Additional activation is deliberate and session-local, deduplicated across tabs. Closing a tab does not
silently change activation; `down` clears the session. No persistent subscription registry or per-tab lease protocol.
Activation accepts only registered target IDs under existing host/origin validation, never arbitrary source paths.
Pass the launch-selected ID through existing server startup metadata to the browser. For initial opening, a valid explicit
deep link wins, then the launch-selected ID, then valid remembered state/default fallback when no launch choice is present.
Do not let stale browser-local memory override launch selection. Preserve the deep link's scope and subsequent Back/Forward
behavior; displaying another explicitly linked target does not silently activate it. Test launch A with remembered B,
and an explicit deep link to B while A remains the monitored target. Show that monitoring/display distinction clearly.
When several targets are explicitly active, share physical watches and apply global fairness/resource limits. A refused
activation leaves it inactive with a reason. Pause cancels that target's pending/owned work; it does not delete its map.

### Effective settings and recipe commit

The workspace owns one committed extraction request: effective target settings plus collection recipe, selected by the
same latest pointer as its graph. Stage that request with the immutable candidate run; validate it before publication.
The recipe records intent, including auto/off/required and native depth; acquisition outcomes record actual coverage.
Do not persist proposed settings through CLI _target()/register() before validation or extraction succeeds.

Under the existing per-target writer lock, validate request, identity collision and tool options, build the candidate,
validate all required artifacts, then rename the run and atomically replace the latest pointer once. That pointer is the
commit point for run, settings and recipe. An automatic CPD failed outcome may be a successful graph publication under
the preceding policy; a required-provider failure is not. No second authoritative target.json or recipe write follows it.
Existing target.json may remain a legacy registration input or derived projection, never override a newer committed
request. Update Workspace load/targets/last/find_project, CLI, server and freshness consumers to resolve the same committed
state. New targets become registered/visible only at successful publication; failed attempts may leave ignored diagnostics.

Seed older targets from validated legacy settings and the latest manifest when unambiguous, preserving native depth and
health scope; otherwise require explicit refresh configuration. Migrate on the next successful publication, not on read.
Crash before pointer replacement leaves old state authoritative; after replacement all readers resolve new state.
Unreferenced candidate runs are not committed registrations. Validate this with failure/crash injection around both renames,
reopening Workspace after each case. Atomic pointer replacement is not a claim of a multi-file or power-loss transaction.

### Watch inputs

Profiles derive physical watch roots and input classes using existing boundary owners: authored sources, descriptors,
build rules, selected context inputs and declared plugin mounts. Watch recorded external compiler inputs and tool markers
narrowly or reconcile them explicitly; do not recursively watch the Engine, disk, Content, generated outputs or workspace.
UBT's intermediate churn must not trigger an endless loop; a new successful receipt is a legitimate context change.
Choose filters from the effective recipe and available providers. If neither native nor health collection consumes a C++
body, editing it must not trigger a useless module extraction; expose the missing source coverage instead.

Deduplicate physical roots while retaining target subscribers. Events cannot authorize following a new external link:
revalidate through SourceTree before reads. Retargeted/deleted mounts require rediscovery and boundary validation. Detect
replacement of a watched root through a bounded parent watch or missing-root reconciliation. Filter broader parent events
before source reads. Resource limits must not silently drop targets.

### Dirty work and safe reuse

Batch saves with trailing debounce; start with a measured 0.5-1 second quiet period rather than a promised latency SLA.
Bound dirty-path memory: overflow becomes a scope-rescan marker. Start with one running job and one coalesced pending
generation per target, and one heavy job globally. Ensure fairness and a bounded maximum batching delay; continuous edits
remain visibly pending instead of repeatedly killing and restarting analyzers.

| verified input change | required action / reuse boundary |
|---|---|
| duplicate events, touch or save with identical bytes/membership | no analysis or new run; timestamps alone cannot prove equality |
| source body in selected corpus | validate complete CPD corpus and rescan on a miss; retain native compiler-job cache guards |
| shared header, add/delete/rename or newly satisfied optional include | invalidate affected jobs; uncertain closure requires broader preprocessing/reconciliation |
| descriptor, build rule, receipt, target/configuration or source mount | refresh profile context and corpus; do not assume module independence |
| tool binary, options, recipe or adapter identity | invalidate provider reuse using its complete identity |
| Review policy/triage only | refresh Review, not source extraction |
| layout, camera, hover, ignored asset or generated churn | no source analysis |

Do not add another authoritative file database. Maintain dirty inventory in memory against validated manifest inputs;
content identities and existing caches decide reuse. Stat hints may narrow immediate reads but cannot prove unchanged
content. Reconcile periodically at a measured low duty cycle for missed events and unobserved external drift, never by
full recursive hashing on each status request.

UBT export is not proved safely cacheable from current fingerprints: arbitrary build rules can read additional inputs.
Initially rerun required profile/build preparation per settled batch and reuse CPD/native facts. Measure that cost
separately. Skip a phase only after proving its input contract; do not promise changed-module-only analysis or remove
native preprocessing/negative-header guards for speed.

On overflow, malformed events or root loss, mark affected input freshness unknown and reconcile that scope. Distinguish permission
and unsupported-filesystem failures from absence. Surface degraded monitoring; bounded low-frequency reconciliation may
recover unavailable notifications. Provide explicit pause/retry if recovery is too costly, not silent stale success.

### Publication, readers and user state

Manual and background jobs share the existing target writer lock. A known busy owner means visible waiting, not another
writer or a tight retry loop. Capture recipe/input generations and validate inputs before promotion. Edits during work
coalesce into the next generation. Do not present a known superseded candidate as fresh; keep the last good map and
reconcile again. Filesystem edits cannot be globally locked: record captured input identity and show pending/stale when
later changes are observed.
Do not repeatedly retry deterministic failure for identical inputs. A new relevant source/tool/request change or explicit
retry may schedule it again; periodic reconciliation alone must not create a failure loop. A bad target must not starve others.

Publish through the existing validated partial-run/latest path. Validate the canonical graph/read index and prepare an
immutable read context containing manifest, shards, topology and exact references before advertising it as ready. Bind a
lazy Review owner to that generation; do not require successful policy loading, cache generation, triage reading or Review
evaluation for publication, context readiness or browser adoption. Review errors remain explicit in Review while the new
map stays usable. Even Review-owner preparation failure must not gate the canonical map. This preserves the existing
[failure-isolation contract](../../docs/architecture/review.md#lifetimes-and-failure-isolation); required acquisition artifact
validation still belongs to publication and is not bypassed by this rule.

Pin all multi-request reads to one generation; old in-flight readers finish on that context. Never return new reference
IDs through an old URL. Expired contexts return explicit stale/reload responses. Validate layout and triage writes against
their originating context, preserving independent user state when nodes temporarily disappear. A late old-generation
Review response/error cannot overwrite the new context or reopen closed inspection.

The browser polls only small status/latest metadata at a modest bounded interval, reducing polling in hidden tabs. Stage
the new run before swapping live state; invalidate reference/search/Review pages and ignore late responses. Reuse scene/
layout owners to preserve camera, surviving expanded IDs, filters, selection and layout mode. If focus disappears, use
its surviving recorded ancestor with an explanation. Do not auto-fit or reload the whole page.

Defer adoption during dragging, pending/failed position writes or unsaved inspection decisions. Retain failed moves and
existing recovery routes; do not reopen closed inspection or discard drafts. Present compact updating/ready/failed/
degraded status with coverage access and the last good map; zero findings never stands in for unknown coverage.

Bound read contexts, queues and disposable automatic artifacts. Protect active requests, latest good run and recovery
predecessor. Never automatically delete manual history or positions/policy/triage. Tag new automatic artifacts so cleanup
ownership is unambiguous; retire unpinned contexts explicitly, allowing slow tabs to request adoption again. Measure disk
growth over repeated edits before accepting retention limits.

### Cancellation and external contention

The 900-second execution timeout is not a cancellation budget. Keep the existing 10-second post-acknowledgement stop wait;
plan internal cleanup to finish within 8 seconds, leaving headroom. On stop, acknowledge promptly, expose stopping, prevent
new starts/publication, signal cancellation and discard queued work. Check cancellation between bounded copy/hash/index
chunks as well as subprocess waits; a long source read or native executor shutdown cannot be allowed to hold the viewer.

Run potentially blocking background preparation/extraction/index construction in one disposable owned job process. Contain
it and its descendants in a Windows Job Object with no breakaway and kill-on-close. Worker code must not execute before
successful assignment, not merely before it spawns children. Prefer assignment as part of process creation on supported
Windows; another launch sequence must prove equivalent pre-execution and controller-death safety or refuse background work.
Assignment failure must leave no executable or orphaned suspended worker.

The controller alone owns the controlling Job Object handle: create it non-inheritable, exclude it from inherited-handle
lists and never duplicate it into worker/descendant handle tables. Job membership does not require such inheritance.
Close temporary controller-side duplicates so final handle
closure on controller death can trigger kill-on-close. Redirect only explicitly permitted I/O handles. Use a narrow
standard-library process owner shared by UBT/Java/native cancellation, not a worker service.
Allow at most 2 seconds cooperative grace; terminate the owned job if still running, then drain/reap children, worker futures
and watch I/O within the remaining internal budget. Do not rely on Future.cancel() or executor shutdown(wait=False).
Cancellation never becomes an optional-provider failure publication. If containment cannot be established, refuse background
work visibly. If cleanup cannot be confirmed, keep truthful stopping/failed status; down must not claim success or kill a
foreign process. The runtime gate must prove lease release within the existing stop wait on supported Windows.

Represent UBT's existing CONFLICTING_INSTANCE result as a typed busy outcome, not prose matching. Keep the dirty request
coalesced and show waiting for the external build. Retry at most three times after cancel-aware delays of 2, 5 and 10 seconds;
then retain the pending request with Retry guidance. A new relevant receipt/context change or explicit retry starts another
budget; polling alone does not. Other exit codes/timeouts are failures, not contention. No source/Engine rebuild, mutex
bypass, or termination of an externally started UBT. Check cancellation before any retry can create a child.

The worker stages/validates artifacts; it never replaces latest or committed settings. The pipeline parent retains the
target writer lock and permits the single commit only after successful worker completion and input/request generation
checks. Cancellation before that short commit leaves the old state. Do not acquire a second conflicting lock in the child.

Microsoft documents [Job Object containment](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
including descendant handling and last-handle termination. The
[process-creation Job List attribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)
supports assignment during creation on Windows 10+. Do not silently raise the platform baseline; background work must
refuse visibly if equivalent safe admission cannot be established, leaving saved-map exploration available.
Python documents that [executor cancellation](https://docs.python.org/3.9/library/concurrent.futures.html#concurrent.futures.Executor.shutdown)
does not stop running work. These support the proposed mechanism; real UBT/Java/native containment and nested-job behavior
remain implementation gates. No production process-owner or monitoring capability is claimed by this plan.

## Required invariants

1. No edits to analysed sources or project configuration; preserve the existing declared-source physical boundary.
2. Under D3, only the owned coordinator launches background analysis; hover/wheel handlers and HTTP status reads never
   launch analyzers. Native indexing remains explicit initially, and automatic jobs preserve the effective recipe.
3. Validate options before work. Use the acquisition-mode table: auto CPD failures leave explicit failed coverage on an
   otherwise valid graph; required-provider, core and validation failures retain the previous publication. Never substitute
   an empty successful health artifact. Off avoids CPD scans, not native-required scans. Saved-only opening avoids all source
   scanning/monitoring. Required native depth cannot be silently dropped. No old health evidence becomes current by copying.
4. Health observations remain independent of graph edges, canonical identities, user positions and Review policy.
5. Default Review must display evidence collected at the effective default floor. Explicit user policy remains authoritative;
   a policy below collected coverage is unavailable and requires recollection. Define the acquisition floor once in the
   provider; an omitted Review floor can use recorded collection coverage rather than importing provider configuration.
6. Preserve prior strict-artifact interpretation and acknowledgements when effective semantics remain the same, including
   a previous implicit 100-token policy. Canonicalize effective policy before fingerprinting; do not reopen decisions just
   because an implicit default was represented differently.
7. CPD reuse binds complete corpus membership, ownership, raw bytes, scope, effective options/mode and full installed tool
   identity. Cross-module matches and newly added/deleted/renamed files must remain correct. Comments can invalidate the
   artifact for fresh coordinates while leaving semantic acknowledgement intact. Keep native job and Review cache guards.
8. If A4 passes, use the same configured PMD lexer for matching and normalized fingerprints. The existing strict-only
   fingerprint helper is insufficient. Keep strict and normalized identities separate; bind normalized decisions to the
   original token content of participating occurrences as well as the normalized pattern, excluding source coordinates.
   Meaningful content changes must not remain acknowledged solely because their normalized shape is unchanged.
9. Unavailable, disabled, failed, incomplete and evaluated states remain distinguishable from zero findings. Use existing
   coverage and Review-check status owners; do not parse prose into a second capability registry or invent dependency wires.
10. Keep source evidence pages bounded, pins stable, processing offline and previously validated runs usable.
11. Events are hints, not an authoritative log. Recover lost notifications, source-root replacement and downtime through
    reconciliation; identical content does not trigger publication. Freshness, job state and analyzer coverage are distinct.
12. One extraction writer per target and bounded global work. New edits never disappear behind an in-flight job. Validate
    input/recipe generations at publication and never advertise a known superseded result as current.
13. All served artifacts and pending pages bind to one immutable run. Adoption preserves user work and camera; stale
    requests cannot mutate a new context or reopen closed inspection. Automatic cleanup never deletes independent user data.
14. Committed target settings, recipe and run resolve through one publication pointer. A failed request changes none of them;
    structured optional failure is a successful graph publication only under the declared acquisition policy.
15. Only explicitly session-active targets consume monitoring resources. History and mere cached browsing never activate work.
16. Review evaluation is run-bound and independent of canonical map readiness. Its failures cannot block publication,
    serving or adoption; stale Review callbacks cannot affect another generation.

## Implementation tasks

Each gate has independent acceptance evidence. Passing one does not imply the later stages work. Keep monitoring opt-in
until Gate 3 passes; do not enable a half-working automatic refresh path. D4 owns implementation authorization; D5-D6
constrain its value/review checkpoints.

### Gate 1 - Default analysis and committed requests

- [x] Promote A/B/C/D into independent real-provider fixtures. Under D5, compare strict 100/50 and gate the selected 50-token
  floor on the complete authorized real corpus, useful logic versus boilerplate, lexical failures and exact ranges. Record
  cold/reused/edit costs privately. Lower 40/30 floors are not promoted or required by D5's selected target.
- [x] Add schema-validated acquisition outcomes through existing manifest/coverage owners. Ordinary CLI builds request auto;
  tool absence stays visible without downloads, explicit off avoids collection and required retains its publication gate.
  Implement auto/off/required
  behavior at the profile boundary, including CPD-only input failures before graph collection. Required failures keep their
  existing gate; automatic failures produce explicit failed coverage without a bogus health artifact or stale evidence.
- [x] Stage effective settings/recipe with the immutable run and use one latest-pointer commit. Remove CLI's pre-extraction
  target mutation; adapt all workspace consumers and prove old registrations remain readable. Inject failure/crash at each
  promotion boundary and prove target settings, recipe and graph always resolve to the same committed version.
- [x] Align default Review floor and triage semantics with invariants 5-6. Expose structured unavailable/failed/disabled/
  incomplete status in existing CLI/Review controls, including older runs. Test complete build-to-Review, not just CPD XML.
- [x] Verify current native/corpus/Review reuse, required-mode refusal, ordinary exploration without LLVM/Java, unchanged
  user state and the real default corpus. Finish the relevant stable-owner updates. Gate 1 may retain current up behavior:
  it serves saved maps but may hash sources for startup freshness. It must not claim scan-free opening, continuous monitoring
  or live adoption. Guaranteed no-source-scan saved-only mode is delivered in Gate 2.

### Gate 2 - Monitoring, cancellation and publication

- [x] Add A9 activation, profile-derived roots and Windows notifications with SourceTree enforcement. Test actual atomic
  saves/renames/root replacement and deterministic event-loss/overflow recovery. Inactive history consumes no watch or
  analysis resources. Add guaranteed no-source-scan no-watch recovery and explicit session activation/pause/retry semantics.
  Carry launch selection in startup metadata and prove it overrides remembered state without overriding explicit deep links.
- [x] Prove the owned process boundary before enabling jobs: worker plus descendants, UBT/Java/native/preprocessor waits,
  blocked copy/hash/index stages, nested-job refusal and stop within the existing 10-second confirmation wait. An unrelated
  sentinel process remains alive. Prove assignment before the worker's first instruction, parent-only non-inherited job
  handle ownership and forced controller-death cleanup; assignment failure leaves no suspended orphan. Include a deliberate
  leaked-handle or early-execution negative control that the containment test rejects. Do not use future cancellation or
  900-second timeouts as shutdown proof.
- [x] Implement bounded debounce/generations, one coalesced pending request, global fairness and typed UBT contention with
  the bounded retry contract. Preserve the writer lock; the worker stages and the pipeline parent alone commits.
- [x] Serve cached maps before freshness scanning, prepare immutable read contexts and expose small status/latest metadata.
  Pin manifest/shards/references and write validation to the same context; bind lazy Review without waiting for evaluation.
  Block/fail Review during testing and prove canonical context readiness/serving still work. Both background and manual
  publications use that handoff. Protect active readers and user data during bounded automatic-artifact retention.
- [x] Run failure/race/stop tests and real Windows save/context/header changes. Measure idle cost, queue stability and
  repeated-edit disk/memory/handle growth. Browser adoption is not yet claimed; existing tabs remain consistently pinned
  until Gate 3, with the new run available through its explicit context. Monitoring remains opt-in at this gate.

### Gate 3 - Browser adoption and default activation

- [x] Adopt a staged ready context through existing scene/position/navigation owners, deferring for drag/pending saves/
  failures/drafts. Preserve camera, surviving IDs, filters, selection and Inspector intent. Cancel obsolete pages; test
  deep contextual files, removed focus fallback, multiple tabs and old/new writes without cross-run evidence mixing.
  A blocked or failed Review evaluation must not delay adoption; show Review's error separately on the usable new map.
- [x] Show monitored target, job state and provider coverage without new permanent panels. Historical browsing stays
  inactive until explicit activation. Run affected Chromium scenarios and the real save-to-visible-update walkthrough.
  Preserve useful narrow-screen map space: the existing viewer acceptance fails its map-height check on the unchanged
  baseline as well as this patch. Resolve that demonstrated limitation when adding compact live status/controls.
- [x] Measure interaction p95/max while analysis runs; compare protected state and exact references. Only after Gates 1-3
  pass may normal up enable A9 monitoring and safe adoption by default. Update stable docs, report limitations and archive.

A4 is a separate optional extension after its real usefulness gate, not required for the three delivery gates. If adopted,
version its artifact/lexer/fingerprint semantics and prove old strict reading and acknowledgement stability; do not add a
second default scan. A5 remains outside this delivery. No historical cache/token-store shortcut is justified without
measured need and complete-corpus equivalence proof.

## Test-first and verification plan

### Red evidence

| case | wrong behavior today / required proof before production edits |
|---|---|
| no expert flags, trusted CPD installed | CLI does not request source health; capture default build-to-Review behavior |
| short exact clone | A/B is absent at 100; collection at 50 still yields zero default Review findings |
| different logic and boilerplate | D must remain unmatched; real boilerplate inspection is a reviewer-checked value gate |
| missing tools | automatic behavior does not exist; require visible unavailability and successful module-only publication |
| auto versus required CPD failure | auto must publish an explicit failed outcome on a valid graph; required must retain old run/settings/recipe |
| unreadable CPD-only versus mandatory/native input | isolate the optional input failure; never weaken mandatory or physical-boundary checks |
| new settings plus invalid options or failed extraction | CLI currently persists registration early; require no committed setting/recipe change |
| crash between run promotion and pointer update | reopening must resolve old or new complete request+run, never a mixed target configuration |
| inactive historical targets | require no source scans/watchers/analyzers until explicit activation, even when browsing a saved bookmark |
| busy UBT and stop during a 900-second child | typed contention retries are bounded; owned descendants exit within the existing stop wait, foreign process survives |
| incomplete Review coverage | button can say zero findings while a check is unavailable; require an explicit availability cue |
| blocked/failed Review while a new graph is ready | graph publication, context readiness and adoption must proceed; Review alone reports its error |
| remembered target B, launch target A | ordinary opening shows A; an explicit deep link to B retains B and its scope without activating it |
| worker execution or leaked job handle before containment | reject early execution and inherited/duplicated controller handles; controller death must reap owned workers |
| source edit while viewing | no monitor or live adoption exists; require saved edit -> validated run -> visible update |
| same-target/new-run adoption | existing show/restore paths retain old map or reject the scene; require consistent replacement |
| event loss or root replacement | synthetic lost events and actual Windows root replacement must recover by reconciliation |
| busy job/manual build and a later edit | one writer, bounded backlog and no lost generation; obsolete result cannot appear fresh |
| pending save/draft and late old reference page | adoption must defer or cancel safely without lost pins, mixed evidence or reopened inspection |
| normalized alternative, only after A4 gate | C is absent in strict mode; normalized matching must retain precise original ranges and mode identity |
| stale normalized acknowledgement | same normalized shape with changed original tokens must trigger reconsideration |

Permanent guards must use the real pinned provider when they claim CPD behavior. Keep a negative control and assert
all intended input files were processed. Reviewer judgements of usefulness are not converted into filename allowlists.

### Green evidence

- Existing owners: `python -m unittest discover -s tests -p test_cpd.py`, `test_health.py`, `test_review.py`,
  `test_pipeline.py`, `test_commands.py`, `test_symbol_cache.py` and `test_documentation.py` through the same discovery shape.
  Supply the documented optional local-tool variables; a skip does not prove the provider path.
- Assert no Java on an unchanged corpus, recomputation on content/membership/tool/mode/threshold changes, exact cross-module
  clones, preserved negative-header native controls and no changed pins. Compare cold/reused results for equality.
- Test missing tools versus corrupt/extra-library installations, explicit off, invalid options, lexical failure, partial
  output, timeout, edits during collection, prior-run retention, v1 strict artifacts and prior acknowledged findings.
- Assert structured outcome/artifact consistency, CLI and Review presentation, no old artifact copied to a new failed run,
  unchanged triage after unavailable coverage, and completed-zero versus failed/unrecorded distinctions. Test auto and
  required mode separately; do not change the existing required-failure regression into a universal fallback test.
- Inject failure before/after run rename and pointer replacement, then reopen workspace/CLI/server/freshness consumers.
  Compare committed settings/recipe/run and test failed first registration, new engine/target options, identity collisions
  and simultaneous manual/background requests. A lock-only test does not prove crash consistency.
- Existing Node suites and the affected Review/health/viewer Chromium scenarios: default status, source ranges, strict versus
  normalized labels if enabled, acknowledgement/reopen, cancellation, late close and bounded pages.
- New deterministic coordinator regressions plus actual Windows integration: startup gap, event storms/overflow, missing
  root return, unauthorized junction retarget, same-size/timestamp content edit, negative optional headers, duplicate events,
  manual/background contention, fair scheduling and stop during watch/copy/Java/native work. Stop/refusal leaves last good
  publication and user data unchanged. Root deletion/link fixtures must follow the repository's local test permissions.
- Prove owned child/grandchild containment and stop timings for hung subprocess and Python preparation stages, pool work
  already running, timeout, parent death, no Job Object support, and stop during UBT backoff. Verify no children survive a
  successful stop, no queued retry spawns after cancellation, and no commit occurs from a cancelled worker. Busy exit 10
  must differ from ordinary failures; retry exhaustion preserves dirty state without a polling retry loop.
- Inject controller death around worker creation/assignment and after descendants start. Assert the worker's first
  instruction cannot run outside its job, assignment refusal leaves no suspended orphan, and the controlling job handle
  is neither inherited nor duplicated into children, including with redirected standard I/O. A deliberate handle leak or
  early-execution control must falsify the claimed guarantee; successful graceful cleanup alone is insufficient evidence.
- Register several unrelated historical targets; instrument input reads, watch creation and process starts. Default up
  touches source only for the launch-selected target. Browsing, activation refusal, explicit additional activation, pause,
  duplicate tabs and restart must obey the session policy; cached artifacts remain available for inactive targets.
- Test startup metadata and real browser memory together: launch A/remembered B/no URL opens A; valid deep link to B opens
  its exact scope; absent launch selection retains the existing fallback behavior. Back/Forward and cached browsing must
  not change monitoring activation. Gate 2 no-watch must refuse any call to profile inputs/freshness or source traversal;
  building disposable views from saved artifacts remains allowed.
- Server/browser tests: cached opening before blocked freshness scan, consistent generation URLs for every artifact,
  old/new reference and triage requests, context expiry, multiple tabs, manual build adoption, failed read-index preparation,
  drag/save-error/draft deferral, deleted focus fallback and closed Inspector retention. No automatic camera fit.
- Hold Review evaluation unresolved, then fail policy/cache/triage/evaluation separately. Validate/publish the new graph,
  serve its topology/references and complete browser adoption without waiting for Review. Show a run-bound Review error;
  recover through Review's existing retry/recheck path without source extraction or map rollback. Inject a late old report
  and error to prove neither changes the new context. Canonical index/graph failures must still block readiness.
- Real walkthrough: normal build needs no health flag when tools exist. Open the saved map, edit an authorized source,
  observe updating then validated adoption, inspect exact evidence and confirm exploration state remains. Repeat with shared
  header and descriptor/context edits, a provider failure and recovery, absent tools, saved-only opening and `down`/restart.
  No unrelated Engine rebuild is required for CPD. Keep all real-project evidence private.
- Record actual cold/warm/edit costs on matching corpora. Reject repeatable material usability regressions, not a guessed
  percentage. Measure idle CPU/I/O, opening, dirty reconciliation, UBT preparation, reused/recomputed provider work, publication,
  adoption and pointer p95/max while analysis runs. Include repeated edits for disk/memory/handle growth and queue stability.
  Do not claim real-project throughput from the four-file probe or notification delivery time as analysis latency.

## Documentation plan

- [CLI help](../../laniakea/cli.py) owns options; [Makefile](../../Makefile) remains a shortcut. Update runtime recovery hints only
  where their required explicit-health wording changes.
- [Guide](../../docs/guide.md) owns default live use, saved-only opening, optional setup, coverage, pause/retry and stop.
- [Unreal profile](../../docs/architecture/unreal-profile.md#source-duplication) owns automatic/off/required acquisition,
  source boundaries, provider failure classification and reuse. The [schema](../../schema/graph.v1.schema.json) owns structured
  coverage shapes; [graph model](../../docs/architecture/graph-model.md) owns their generic semantics. Replace explicit-only
  statements after implementation; do not duplicate outcome shapes in the guide or Review policy.
- [Review](../../docs/architecture/review.md) owns effective display policy, mode meaning and decision stability;
  [viewer](../../docs/architecture/viewer.md#review-presentation) owns availability and snapshot-adoption behavior.
- The coordinator introduces a distinct durable lifecycle contract. During implementation, give input generations, bounded
  work, activation, cancellation and publication handoff one owner at `docs/architecture/live-analysis.md`, routed from the existing
  architecture README. [Structure](../../docs/architecture/structure.md) and the main diagram retain only component boundaries;
  do not repeat the lifecycle in the guide, profile or viewer. Do not create separate watcher/cache/scheduler documents.
- Preserve [third-party terms](../../THIRD_PARTY.md); no new dependency is proposed. [Verification](../../tests/README.md) owns commands.
- Stable docs/code must not link to this task. Archive it under the existing todo lifecycle after approval and completion.

## Rollout and rollback

Change defaults only after the value gate. Provide explicit fast/off behavior while keeping required-mode failure visible.
Follow the three delivery gates: one-shot defaults first, opt-in monitor/publication second, default live adoption last.
Do not automatically activate historical registrations during migration. Enable defaults only after shutdown, failure,
adoption and real-cost gates pass. Retention affects only newly tagged automatic artifacts under the protected-state contract. Preserve
existing validated runs, user decisions and hidden pins. Version normalized evidence if enabled and prove old strict reading.
Disabling monitoring must leave manual build/up/down and stored maps usable; rollback never resets layouts or triage.

## Completion criteria

Default use demonstrates useful recorded concerns, explains unavailable coverage and reuses unchanged analysis safely.
Continuous edits update the visible map through a consistent immutable snapshot without lost work, camera jumps, unbounded
jobs or repeated identical runs. Missed notifications and restart recover; stop releases owned work promptly. Measured real
cost supports the chosen debounce/reconciliation/retention policy, with remaining expensive phases disclosed.
The lower-floor decision has real value evidence or a reviewed replacement before completion; normalized mode is optional
under A4. All three delivery gates and relevant source/boundary failure, cancellation, committed-request, activation,
browser, privacy and stable-owner checks pass. Unimplemented scope remains explicitly unverified, not a completion claim.
Only changes authorized after this review are implemented; no new services or speculative analyzer/cache infrastructure.

## Review record

### 2026-11-16 - Investigation and architectural assessment

- D1-D2 captured; Q1 remains open and A1-A5 are recommendations, not operator decisions.
- Existing ownership and reuse are suitable. The reviewer correctly prefers CPD and a separate complexity gate; its
  threshold advice omitted the independent Review floor, and automatic source-change publication is not already supported.
- Eight real PMD probes established short/renamed-token behavior and a negative control. The existing pipeline demonstrated
  the collection/display mismatch and 1/0/1 Java jobs across cold/repeat/edit. Baseline: 21 tests passed, no skips.
- Production code, stable docs and tests remain unchanged. This file is the sole intended repository edit; implementation
  remains subject to review.

### 2026-11-16 - Continuous monitoring direction

- D3 closes Q1; A1 is resolved and not selected. A2-A5 remain recommendations; A6-A8 describe the proposed monitor, not
  implemented capability. No blocking operator question remains for this investigation.
- Primary Windows/VS Code/watchfiles sources support notifications, batching and explicit reconciliation. The local native
  probe confirms atomic-save notification and drained cancellation only; production correctness/performance remain unproved.
- Repository inspection exposed pinned server state, same-target navigation and run-specific scene restoration as required
  adoption work. Merely adding a watcher or polling the latest pointer is insufficient.
- Preserve whole-corpus CPD and native preprocessing guards; no safe per-module or UBT-export shortcut has been established.
- Documentation checks: 2 passed. ASCII, contents consistency and the local worktree privacy check passed. The earlier
  21-test provider/cache baseline is unchanged evidence, not execution proof for the proposed monitor.
- Only this todo is changed. Implementation awaits approval of the expanded monitoring and snapshot-adoption scope.

### 2026-11-17 - F1-F5 planning corrections and scope accounting

- F1 accepted: the prior automatic-failure proposal could block ordinary maps. Replace it with explicitly failed optional
  acquisition on an otherwise valid graph; preserve required-provider and core refusal. Never reuse old health as current.
- F2 accepted: prose coverage cannot reliably drive the new behavior. Extend existing schema/manifest coverage with
  structured outcomes and direct consumers; no separate capability registry or source-observation policy owner.
- F3 accepted with qualification: the current 10 seconds is a confirmation wait, not a proved analysis cancellation
  guarantee. Blocking 900-second calls and running futures require owned process containment plus bounded shutdown tests.
- F4 accepted and reproduced on the synthetic sample: invalid health options return 2 after registration is written,
  without a map. Commit effective request and graph through one pointer; verify crash states, not merely shared locking.
- F5 accepted: D3 never required all historical registrations. A7 is rejected and A9 proposes one active target by default
  plus explicit session activation. Required runtime and browser behavior is split into Gates 1-3.
- Scope accounting: the later naming pass renamed this task and changed todo/README.md to record immutable creation-time
  prefixes. Earlier dated entries describe their own stages and are preserved. The current supplied change set therefore
  includes that README change; this review pass edits only the existing timestamped todo. Its filename/prefix stay unchanged.
- Verification: 33 existing pipeline/commands/service/documentation/explicit-CPD-isolation tests passed, no skips. Results:
  [checks.json](../../workspace/tmp/default-analysis-review/checks.json). These establish current safeguards, not the future
  monitor, process owner, outcome model or transaction. No real-project extraction was required for these planning fixes.
- Implementation remains unapproved. Production code, tests and stable docs were not edited in this review pass; the Git
  index was preserved. The revised contracts and actual Windows runtime costs remain acceptance work after approval.

### 2026-11-17 - Review isolation, process handles and launch handoff

- Accepted the three localized findings and gate-wording correction. Current Review construction is lazy, so the prior
  readiness wording was ambiguous rather than evidence of a current eager-evaluation bug. Explicitly require canonical
  validation while making Review evaluation/failure independent of readiness, publication and adoption.
- Require worker assignment before any worker code executes and controller-only, non-inherited Job Object handles.
  Gate 2 proves controller-death cleanup and rejects handle-leak/early-execution controls; OS documentation alone does not
  establish those runtime guarantees for Laniakea.
- Carry launch target through startup metadata and test precedence against browser-local memory and explicit deep links.
  Gate 1 retains current freshness-on-open behavior; guaranteed no-source-scan saved-only mode begins at Gate 2.
- Only this todo is edited. Historical entries, task timestamp and operator decisions remain intact. Implementation is
  still unapproved; no permission to begin Gate 1 is inferred from the reviewer's recommendation.
- Verification: 2 documentation tests and the existing unavailable/invalid-policy Review regression passed, no skips.
  ASCII, contents, historical-entry preservation, privacy and unchanged-index checks passed. These checks validate this
  planning revision/current Review behavior; they do not prove future Windows containment or browser adoption.

### 2026-11-17 - Partial Gate 1 implementation and D5 measurement checkpoint

- D4 authorized implementation. Gate 1 changes bind effective target settings and collection intent to the immutable run;
  latest-pointer promotion commits them together. Explicit auto/required/off acquisition records structured coverage,
  distinguishes provider failure from graph failure, and prevents older observations being presented as current.
  Review uses the recorded collection floor when policy omits one and exposes unavailable checks. Ordinary builds remain
  module-only without health collection; neither the production heap nor collection default has changed.
- Regression-first proof: invalid CLI options and failed target selection previously wrote registration/settings before
  successful publication. Focused regressions now pass, including interrupted pointer replacement. A real-provider EOF
  fixture reproduced PMD's unterminated final preprocessor-directive error; supplying only the isolated copy's final newline
  fixes it while preserving original hashes, source bytes and exact evidence ranges.
- D5 investigation used one frozen, complete authorized corpus at strict 50 tokens. Phase traces locate the 1 GiB failure
  in PMD MatchCollector.registerTokenMatch/BitSet expansion during MATCH, before fingerprint/export. The 2/4/8 GiB arms
  completed without skipped files and produced identical fingerprints, token counts, occurrences and coordinates. Validated
  evidence fits the existing group, occurrence and artifact limits. Synthetic exact-match and renamed/different negative
  controls passed; unchanged corpus reuse invoked no Java process.
- The untouched registered bridge reproduced the same full result at 4 GiB, controlling for diagnostic instrumentation.
  A sampled manual audit found useful short cross-module logic as well as intentional boilerplate. Findings remain review
  candidates; strict clones do not establish a design violation. Diagnostics and project-identifying measurements stay
  private: [phase/heap sweep](../../workspace/tmp/live-analysis-implementation/cpd-profile/sweep-audited.json),
  [independent bridge and cache controls](../../workspace/tmp/live-analysis-implementation/cpd-profile/controls.json),
  [short-clone audit](../../workspace/tmp/live-analysis-implementation/cpd-profile/short-clone-audit.json).
- Upstream [issue 6145](https://github.com/pmd/pmd/issues/6145) supports the matching-memory diagnosis. The open
  [optimization PR 6215](https://github.com/pmd/pmd/pull/6215) changes grouping behavior and is not adopted. Local bridge
  retokenization adds later cost, but cannot explain the earlier matching failure. No new matcher/cache is justified here.
- Proposed smallest next correction, pending D5 review: configurable bounded 4 GiB heap with memory-headroom admission and
  bounded CPU. The measured 2 GiB arm operated near its ceiling; 8 GiB gave negligible timing benefit with higher memory
  cost. Keep strict global 50-token analysis, complete processing and explicit incomplete/failed outcomes. This is a measured
  candidate for this corpus, not a universal scalability guarantee. No fallback to 100, file suppression or module partition.
- Verification so far: 70 focused Python tests passed with real CPD enabled; nine Review JavaScript tests passed, including
  unavailable-check presentation. These are bounded implementation proofs, not continuous-monitor/browser-adoption acceptance.
  Final regression envelope: 173 JavaScript tests and two documentation tests passed; local privacy, unchanged saved-layout
  hashes, ASCII and unchanged-index checks passed. No live browser or new Unreal extraction is claimed for this checkpoint.
  Stable graph/profile/Review contracts and operator guidance describe only delivered behavior. The working tree includes
  code, schema, tests, documentation and this execution record; no staging or commit was performed.
- D5 remains a review checkpoint: Gates 2-3 are paused, no default is promoted, and no real-project map is published by
  these diagnostics. An unused process-containment prototype is parked in ignored scratch, outside the production diff.
  Monitoring, default short-clone acquisition and live adoption remain unfinished. Keep this task active, not archived.

### 2026-11-17 - Gate 1 reviewer corrections and production-adapter acceptance

- The operator requested evaluation and correction of the attached review. F1, F3, F4 and F5 were reproduced and fixed.
  F2's claimed public pipeline regression is overstated: pipeline.extract injects the tool path, so health_options={} was
  already a required request. Preserve its existing passing regression and distinguish only None from an empty request at
  the profile boundary; direct-boundary proof covers the formerly ambiguous expression.
- F1: reject disagreements between optional source hashes and earlier mandatory/native identities before starting CPD.
  No optional failure catch can convert superseded inputs into publication. F3: CLI omission is None, provider options own
  the default floor/budget, explicit overrides remain exact, and the immutable request records the resolved recipe.
- Explicit CPD requests use strict 50-token collection and a configurable 4 GiB heap ceiling, with Windows physical/commit
  headroom admission and a bounded JVM processor setting. Admission is not reservation or a CPU quota. Low or unreadable
  resources refuse a fresh JVM; a valid cache can be reused without admission. Ordinary build/up still do not launch CPD.
- F4: classify known CPD-local I/O failures where they occur; typed artifact limits become incomplete acquisition.
  Boundary violations, changed/disappearing inputs, corrupt previous evidence and unexpected validation remain hard errors.
  F5: Review retains failed/incomplete/unavailable/disabled states and shows each in the compact summary.
- The production-adapter replay exposed an additional defect absent from the earlier fixed-path diagnostics: Windows
  normcase was applied to the file names sent to Java. PMD sorts file IDs case-sensitively, changing input order and some
  groups. A failing regression proves input spelling loss. Preserve source case in the request and use case folding only
  for lookup. The collection revision rejects older cache provenance without changing provider identity, token fingerprints
  or stored triage. No matcher replacement or source suppression was needed.
- The corrected production adapter processed every frozen authorized input and reproduced the prior validated signature,
  fingerprints, token counts, occurrences and exact ranges. The complete artifact passed current limits; unchanged reuse
  launched no Java. The initial busy-host attempt was refused before Java; subsequent admission used the unchanged guard.
  Private proof: [production replay](../../workspace/tmp/gate1-review/real-acceptance.json),
  [exact-match difference diagnosis](../../workspace/tmp/gate1-review/match-differences-semantic.json).
- Verification: 231 Python tests passed; 24 optional native tests skipped and three real-Engine cases excluded. The first
  broad run encountered one Windows access-denied snapshot rename; the focused repeat and final full run passed. Its cause
  is unconfirmed; no publication retry or weakened refusal was introduced. All 173 JavaScript tests passed. Review and health
  Chromium suites plus narrow coverage-label rendering passed without browser errors. Evidence:
  [Python checks](../../workspace/tmp/gate1-review/non-engine-results.json),
  [browser checks](../../workspace/tmp/gate1-review/browser-results.json).
- Protected saved-position and triage inventory stayed byte-identical. Documentation links, ASCII, local privacy,
  diff whitespace and unchanged-index checks passed. The owned disposable browser fixture server was stopped.
- Stable profile, graph, Review and guide contracts describe the delivered behavior. The task stays active: continuous
  monitoring, automatic ordinary-build collection and live browser adoption remain unfinished. No real-project publication,
  Engine extraction, staging or commit is part of this correction round.

### 2026-11-17 - Memory usability and ordinary-build Gate 1 closeout

- F6 is valid: the universal large reserve rejected feasible budgets on representative development hosts. Retain the full
  configured heap and JVM allowance, with a proportional host reserve bounded for small and large machines. The tests prove
  admitted and refused 16/32/64 GiB scenarios, commit pressure, failed measurements and known zero capacity. These are policy
  simulations; no physical 16/32 GiB-machine performance claim is made. Private measurements support the process allowance,
  but an observed past peak is not treated as a bound for all future inputs. Admission remains an instantaneous check.
- Normal CLI build/extract requests auto without health flags. Explicit off still avoids CPD tool loading/scanning; missing
  tools are unavailable, never downloaded and never reported as successful zero findings. Optional threshold/heap/scope
  overrides apply to the implicit auto request without requiring a redundant mode flag. Programmatic None remains off.
- Regression-first proof: the old reserve refused the feasible scenarios and the old ordinary build produced no health
  artifact. Both tests pass after their owning changes. Independent real-provider A/B/C/D cases now live in the ordinary
  build-to-Review regression: the exact short pair crosses modules, renamed/different controls are excluded, both owners
  remain truthful, and unchanged ordinary builds reuse without Java.
- Real LLVM workers and CPD passed a combined CLI publication over synthetic receipts/exported actions, including native
  and corpus cache reuse. Editing source after native indexing rejects publication before optional acquisition and retains
  the prior request/run. All relevant native parser/preprocessing checks were enabled; only the legacy, non-production
  clangd-indexer check is unavailable. Three real-Engine boundary tests passed.
- Ordinary CLI analysis also passed on the current complete authorized real corpus in an isolated workspace, followed by
  an unchanged build with no target/analyzer flags. Both produced completed coverage and Review findings at the selected
  floor; the repeat launched no Java and preserved exact observations. This does not claim monitoring or live adoption.
  Private evidence: [real ordinary builds](../../workspace/tmp/gate1-closeout/real-default-results.json),
  [admission scenarios](../../workspace/tmp/gate1-closeout/memory-scenarios.json),
  [native/regression checks](../../workspace/tmp/gate1-closeout/python-results.json),
  [Engine boundary checks](../../workspace/tmp/gate1-closeout/engine-results.json).
- Stable guide/profile/structure contracts now describe automatic one-shot acquisition and explicit opt-out; verification
  docs include native preprocessing and combined health inputs. Gate 1 is complete within these proofs. The task remains
  active for Gates 2-3; no matcher, cache framework, service, renderer or analyzer was added.
- Final verification: 258 Python checks passed with one legacy clangd-indexer skip; all three real-Engine checks and all
  173 JavaScript checks passed. The strengthened cross-module A/B/C/D and ordinary override regressions passed after their
  final fixture changes. Published pointers, saved positions and triage remained byte-identical. The isolated real runs
  were not promoted into the operator's workspace. No Git staging or commit was performed.

### 2026-11-17 - Gate 1 PASS verification and opt-in Gate 2 delivery

- The supplied Gate 1 PASS agrees with code and executable evidence. It does not establish continuous browser adoption,
  universal problem detection or analysis without installed providers. No further Gate 1 matcher, threshold or memory-policy
  correction was justified. This round continued the separately authorized Gate 2 under D4 after the D5 evidence review.
- Scope accounting: this is monitoring implementation, not a planning-only or Gate 1-only patch. The controller, disposable
  worker, Windows process/notification adapters, immutable read contexts and tagged automatic retention are separate owners.
  The CLI, pipeline, workspace, server and profile integrate them through their existing responsibilities. Native depth,
  global CPD matching, graph facts, source boundaries and user stores retain their contracts.
- Regression-first evidence: a replaced directory incorrectly inherited a refusal delay, delaying its next live edit until
  reconciliation. The focused Windows test failed before the fix and passes with refusal budgets bound to directory identity.
  Context preparation also read newer target settings through latest; its failing regression now passes using a run-bound,
  digest-validated request. Cancelled automatic read-index work has an owned namespace; its failed cleanup regression now
  proves deferral while another index writer is active and preserves manual work. Rejected/superseded stages never publish.
- Real UBT and installed CPD passed ordinary build, body/header/build-rule changes, source-root replacement, unchanged-byte
  no-op, manual-publication handoff and pinned old HTTP reads on a disposable sample. The fixed next edit after replacement
  published without waiting for reconciliation. Source analysis is complete for the selected synthetic corpus at the
  existing strict floor; this is not a full private-project monitoring scalability claim.
- Windows ownership checks cover descendants, forced controller death, foreign-process survival and refusal before the first
  instruction. Separate real Java, native compiler and UBT cancellation probes confirmed owned-tree termination. Job accounting
  can reach zero shortly before a process handle signals; the probe waits for actual termination within the stop budget.
  Authenticated down during deliberately blocked work released the writer lease and retained protected state. An unconfirmed
  cleanup leaves a failed owner record and cannot be reported as a successful stop or silently discarded on restart.
- Repeated edits retained bounded automatic runs and task diagnostics; the initial pinned context is additionally protected.
  Controller private memory changed by less than 0.1 MiB across the measured sample edits; handle counts stayed within one
  handle of the baseline. A short idle CPU sample and a longer unchanged-input reconciliation created no new publication.
  These are bounded sample observations, not guarantees for all corpora or host loads.
- Verification: the full non-Engine run passed 281 checks with one legacy clangd-indexer skip; all three Engine checks and
  173 JavaScript checks passed. Final owner-specific checks include the new generation, retention and refusal regressions.
  Eleven Chromium scenarios passed, including startup precedence, inactive browsing and origin-safe session controls.
  The existing viewer suite's narrow-map-height assertion failed identically with the unchanged viewer baseline; it is not
  attributed to monitoring. An initial Windows directory-promotion access error in an existing CPD test did not reproduce in
  its focused rerun or the succeeding full run. The first live harness was corrected to observe HTTP readiness rather than
  race a marker replacement.
- Private evidence: [live monitoring](../../workspace/tmp/gate2/live-results.json),
  [replacement recovery](../../workspace/tmp/gate2/root-recovery-results.json),
  [owned tool cancellation](../../workspace/tmp/gate2/tool-stop-results.json),
  [resource observations](../../workspace/tmp/gate2/resource-results.json),
  [Python checks](../../workspace/tmp/gate2/python-results.json),
  [Engine checks](../../workspace/tmp/gate2/engine-results.json),
  [JavaScript checks](../../workspace/tmp/gate2/javascript.log),
  [unchanged narrow-view baseline](../../workspace/tmp/gate2/baseline-browser-result.json).
- Stable architecture, guide and verification owners describe the delivered opt-in behavior. Default up remains saved-only;
  --no-watch guarantees no source scans and the browser labels unchecked freshness. --watch activates the launch-selected
  target only. Session controls and ready metadata are available locally; existing browser pages remain pinned. Gate 3 must
  implement safe adoption and its visible controls before monitoring becomes the default. The task remains active.
- Final closeout checks passed 99 affected owner checks after the run-bound-settings, cancelled-index ownership and HTTP
  refusal/disconnect corrections. Private execution links in transient tasks no longer require ignored workspace files to
  ship with a checkout; durable documents still cannot depend on those files. Metadata distinguishes watched source bodies
  from actual provider acquisition outcomes. The restarted local viewer loaded the saved real map without runtime errors
  or position writes, with monitoring off and unchecked freshness visible. Protected publication/user-state files remained
  byte-identical. No staging or commit was performed.

### 2026-11-17 - Gate 2 reviewer corrections

- All four findings are valid; the prior Gate 2 acceptance missed these cases. F1 now compares the same prior input contract
  before/after staging, independently validates the candidate's new external inputs and captured linked products, and retains
  the candidate identity. A settled new receipt/product set passes. Actual LLVM/CPD workers accept a newly discovered external
  header; changing it or a newly selected product after capture rejects the candidate without moving latest.
- F2 treats a missing complete automatic baseline as unknown and reconciles it once. A manual completed-CPD run without native
  indexing cannot imply unchanged configuration. The CLI --watch route with real UBT/CPD published a new automatic snapshot
  after a stopped-session config edit. Subsequent probes reuse its complete identity; old HTTP contexts remain pinned.
- F3 reuses full graph/index validation in the owned worker, binding its result to the run, manifest, source, generator and
  cache identities. The controller checks those bindings before commit. Pairing a candidate with another graph's valid index
  failed before the fix and is refused afterward. Repeating heavy validation in the controller would violate cancellation;
  it remains in the disposable worker rather than introducing a second validator.
- F4 cleans up owned work and notification I/O on fatal scheduler exit. A failing poll with a real worker/descendant reproduced
  the leak before the fix. It now terminates both, stops notifications and releases the writer lease without down. Unconfirmed
  cleanup remains observable and cannot become a successful stop. Protected publication and user-state checks pass.
- Verification: 295 non-Engine Python checks passed with one legacy clangd-indexer skip, with real LLVM and CPD enabled.
  All three Engine checks and 173 JavaScript checks passed. The real CLI/browser monitoring scenario passed launch selection,
  explicit links, inactive browsing and same-origin controls; authenticated shutdown completed within the existing budget.
  Evidence: [Python](../../workspace/tmp/gate2-review/python-results.json),
  [Engine](../../workspace/tmp/gate2-review/engine-results.json),
  [CLI](../../workspace/tmp/gate2-review/live-results.json),
  [browser](../../workspace/tmp/gate2-review/browser-results.json).
- The additional optional-header observation remains a trigger limitation: an absent external input appearing outside watched
  paths does not itself guarantee scheduling. Existing native negative-header guards passed on the next extraction. Retry,
  a build or another observed change can initiate it. No broader Engine watch or new discovery subsystem was added.
- Stable monitoring and verification documentation describe these boundaries. Monitoring remains opt-in; saved-only default
  opening and existing pins/triage are preserved. Gate 3 is unfinished and this todo stays active. No staging or commit.
- Final documentation, privacy, syntax and diff checks passed. The authenticated local viewer restart loaded its saved map
  with monitoring off, unchecked freshness visible, no JavaScript errors and no layout writes. Protected workspace files
  remained byte-identical. These results do not claim automatic browser adoption or discovery of unrecorded external paths.

### 2026-11-17 - Gate 2 deterministic provider-failure reuse

- F5 is valid. A real PMD lexical failure produced an automatic snapshot with failed provider coverage and a complete monitor
  identity. Restarting unchanged attempted Java again. Removing only the worker's incomplete-coverage refresh condition still
  failed: the scheduler also compared canonical inputs, which omit source-body hashes when optional acquisition fails.
- The worker requests initial reconciliation only without a complete automatic baseline. Startup reuse compares complete
  monitoring identities instead of requiring completed provider coverage or matching a partial canonical input set. No new
  persistence, retry policy or provider classification was added. Existing typed external-build retries retain their bounds.
- The regression passes with real CPD: unchanged restart starts neither extraction nor Java, preserves latest and failed
  coverage, and both explicit Retry and a source edit independently start analysis. Missing-baseline configuration recovery,
  candidate validation and owned-process cleanup remain covered by the affected suite.
- Verification: 89 affected Python checks passed without skips, with real CPD and LLVM enabled. Scope includes monitoring,
  provider contracts, combined native/health staging, HTTP contexts, Windows lifecycle, documentation and privacy. Evidence:
  [pre-fix failure](../../workspace/tmp/gate2-retry-review/red.log),
  [worker-only correction still fails](../../workspace/tmp/gate2-retry-review/partial-fix.log),
  [affected checks](../../workspace/tmp/gate2-retry-review/results.json).
- Stable monitoring and verification owners describe failure reuse. Saved-only default and opt-in --watch remain unchanged;
  Gate 3 stays pending and this todo stays active. No staging or commit was performed.
- Documentation, privacy, syntax and whitespace checks passed. Protected saved files remained byte-identical. Authenticated
  restart and the real saved-map browser smoke passed with monitoring off, no runtime errors and no layout writes.


### 2026-11-17 - Gate 3 delivery and full closure

- The operator accepted Gate 2 and requested full task closure with verification. Gate 3 is implemented; this is not an
  archive of unfinished browser work. Normal up opens saved maps first, then monitors the launch-selected target and adopts
  ready generations. Explicit saved-only opening remains scan-free. Browsing another target never activates it implicitly.
- The browser coordinator stages one generation through existing Universe, scene, position, reference and Inspector owners.
  It defers during gestures, pending/failed saves and Review drafts/decisions. A changed position revision or navigation
  cancels obsolete adoption. Camera, surviving expansion/focus, filters, layout and Inspector intent survive; removed focus
  falls back through recorded ancestors. Old exact pages and Review responses cannot overwrite the new generation.
- Browser heartbeats belong to existing read contexts. Each tab replaces its own expiring claim; another tab remains protected.
  Tests verify retention during deferral, independent release and expiry. Map URLs bind the validated index identity as well
  as the run, refusing an obsolete index before it can reinterpret reference groups. Same-run index changes trigger adoption.
- A toolbar wrap reproduced displaced hover hits and the previously recorded narrow-map failure. A stable scrolling toolbar
  fixes both. Live controls use a keyboard-accessible disclosure, anchored below its summary, with pause/activation/retry and
  explicit failed/unavailable coverage. Review evaluation can remain blocked or fail while the new graph is already usable.
- Measurements exposed unnecessary reconstruction of identical real-map topology. Reusing the validated index identity and
  unchanged projection/layout preserves geometry while refreshing manifest, coverage, Review and generation-bound readers.
  Three unchanged-topology adoptions improved from about 1.0-1.2 seconds to 133-184 ms. Changed identities still rebuild.
  Saved real-map interaction measured frame p95 16.6 ms and maximum 58.3 ms in the repeated prepared-context probe. These
  bounded observations are not guarantees for changed dense graphs. One separate cold harness opening timed out; the repeat
  against its prepared cache passed. No unsupported cause or universal cold-opening claim is assigned to that timeout.
- The no-expert-flags CLI walkthrough used real Unreal/CPD on disposable Sample sources. Body, header addition and build-rule
  saves became visible in about 10-11 seconds with completed coverage, preserved camera/pins and run-bound exact references.
  Real lexical failure published visibly failed coverage and recovered after correction. Native depth remains independent.
  While analysis ran, sample interaction frame p95 was about 4.2 ms versus 4.3 ms idle; maxima were 4.3 and 8.3 ms respectively.
  Sample throughput is not used as a private-project extraction estimate.
- Final automated verification: 298 Python checks ran, 297 passed and one legacy clangd-indexer check skipped; all three real
  Engine checks and all 180 JavaScript checks passed. Real LLVM and CPD were enabled. Thirteen existing Chromium scenarios
  and the new live-adoption scenario passed, including narrow layout, independent tabs, source evidence, triage, Review
  failure isolation, deferred work, deep files, expired/fallback paths and closed Inspector behavior.
- Private receipts: [Python checks](../../workspace/tmp/gate3/python-results.json),
  [Engine checks](../../workspace/tmp/gate3/engine-results.json),
  [JavaScript checks](../../workspace/tmp/gate3/javascript-final.log),
  [existing browser scenarios](../../workspace/tmp/gate3/all/browser-results.json),
  [viewer scenario](../../workspace/tmp/gate3/all/viewer-fixed.log),
  [health scenario](../../workspace/tmp/gate3/health/browser.log),
  [live adoption](../../workspace/tmp/gate3/browser-results.json),
  [real CLI walkthrough](../../workspace/tmp/gate3/real-results.json),
  [real-map adoption](../../workspace/tmp/gate3/large-results.json).
- Durable contracts live in the guide, monitoring, viewer, structure and verification owners. No new parser, renderer,
  database, persistent service or analyzer was introduced. No Git staging or commit is authorized by task closure.
- Accepted limits remain explicit: tools must be installed locally; selected-target/static evidence is not exhaustive
  runtime or architectural proof; unrecorded optional external headers need a later extraction trigger; resource failures
  wait for changed inputs or explicit Retry. Identifier normalization remains optional future work, not an unfinished gate.
- Final local acceptance: the viewer restarted with default monitoring, retained its committed analysis recipe and adopted
  a validated run through index-bound URLs without browser errors or layout writes. Saved layouts, policy and triage files
  remained byte-identical. Normal monitoring may advance latest; it does not delete the previously published manual run.
  Privacy, ASCII, syntax, documentation links and whitespace checks passed. The task is archived under done.
- Optional diagnostic cleanup was policy-blocked: a command combining exact helper-process termination and removal of copied
  large scratch graphs was refused with only "blocked by policy". Those ignored copies were not deleted. This does not alter
  the delivered gates or their acceptance receipts; no user data or analyzed source was cleaned.
  Owned helper sessions were subsequently stopped through their original execution controls, and the marker-based fixture
  used its normal shutdown path. The main live viewer remains healthy; copied diagnostics remain under ignored scratch.


### 2026-11-18 - Gate 3 recovery and exact-index retention

- Both reviewer findings are valid. The task was reopened for these corrections; the earlier closure entry remains historical.
  Before the fix, the injected-layout browser check reported a partially adopted map. The same-run two-tab regression
  returned HTTP 410 for the first tab's topology despite a successful retention claim:
  [server red evidence](../../workspace/tmp/gate3-review/index-red.log).
- Adoption now checkpoints the native scene, bypass styles, UI nodes, camera, URL and prior owners. Candidate readers and
  Review are independent until synchronous rendering succeeds. Failure cancels candidate work and restores the previous
  scene without invoking the failed layout/projection again. Recovery preserves function-valued styles and leaves ordinary
  stylesheet interaction reactive. A failure of recovery itself explicitly requires reload instead of promising restoration.
- The browser regression injects both an early layout error and an error after an actual redraw, including candidate-only
  node data, altered sizes and opacity. It verifies prior owners, exact Inspector DOM nodes, scene, styles, camera and history,
  visible error reporting, subsequent successful adoption and isolation from late Review responses. A focused
  cancellation probe additionally reproduced an old recheck resuming after cancellation; epoch guards now suppress both
  its late reload and late failure, with a regression covering both outcomes.
- Read contexts and heartbeat claims now include target, run and index identity. Two tabs retain different indexes for one
  run across further regenerations; exact reference pages remain readable. Unknown claims cannot replace a valid lease,
  and switching one tab releases only that tab's old version. Run-bound data/layout validation and existing cleanup remain
  with their original owners. No new persistence, parser, renderer or service was introduced.
- Verification: 96 affected Python checks passed without skips; all 182 JavaScript checks passed. Twelve existing Chromium
  scenarios plus the extended live-adoption scenario passed. Scope includes HTTP/reference routing, monitoring, lifecycle,
  immutable indexes, Review, Inspector, namespace files, native style behavior, documentation and privacy. Engine/native/CPD
  extraction was not repeated for these viewer/read-context corrections; Gates 1-2 remain accepted and unchanged.
  Receipts: [Python](../../workspace/tmp/gate3-review/python-results.json),
  [JavaScript](../../workspace/tmp/gate3-review/javascript.log),
  [existing browser scenarios](../../workspace/tmp/gate3-review/all/browser-initial-results.json),
  [final Review/Inspector rechecks](../../workspace/tmp/gate3-review/all/browser-results.json),
  [live recovery](../../workspace/tmp/gate3-review/browser-results.json).
- The normal viewer was stopped through authenticated down and restarted through ordinary up. The real saved-map browser
  smoke passed with monitoring active, index-bound references, no runtime errors and no position writes. Saved layouts,
  policy and triage remained byte-identical:
  [runtime smoke](../../workspace/tmp/gate3-review/main-results.json),
  [protected state](../../workspace/tmp/gate3-review/user-state-result.json).
- The stable monitoring, viewer and verification owners describe these contracts. Interface review found no new focus,
  control or error-feedback gap in the changed paths. Final documentation, privacy, ASCII, syntax and whitespace checks
  passed. Gate 3 is accepted within this verified scope, and the task returns to done. No staging or commit was performed.
