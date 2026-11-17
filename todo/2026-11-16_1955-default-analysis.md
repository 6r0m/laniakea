# Continuous useful analysis with safe reuse

**Status:** REVIEW REQUIRED  
**Scope:** continuous monitoring, default code-health collection, safe reuse and validated live map updates  
**Stable documentation owners:** [Unreal profile](../docs/architecture/unreal-profile.md),
[Review](../docs/architecture/review.md), [viewer](../docs/architecture/viewer.md), [guide](../docs/guide.md)

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Non-goals](#non-goals)
- [Verified evidence](#verified-evidence)
- [Current architecture and source of truth](#current-architecture-and-source-of-truth)
- [Problem and root cause](#problem-and-root-cause)
- [Decision](#decision)
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

### Operator gates

- **Q1 [CLOSED by D3]:** Should automatic source collection run on build, on opening, or continuously after edits?
  - D3 selects continuous monitoring; the lifecycle, publication and acceptance sections below now cover it.

### Working assumptions

- **A1 [RESOLVED by D3 - not selected]:** Collect automatically on `build`; keep `up` a reader of saved runs. Source watching and background
  publication during viewing are outside this delivery, preserving the accepted build/view separation.
- **A2 [ACTIVE]:** Automatically use the validated local CPD installation when present. Missing optional tooling is
  visible unavailability, not an instruction to download or install host software automatically.
- **A3 [ACTIVE]:** A 50-token strict collection floor is the first candidate to validate on a representative real corpus.
  Synthetic success does not establish the production default or acceptable noise.
- **A4 [ACTIVE]:** Identifier normalization is a separately labelled, opt-in collection mode only after a real usefulness
  gate. It is not an additional simultaneous default scan; literal normalization is excluded.
- **A5 [ACTIVE]:** Preserve explicit native indexing and defer Clang-Tidy implementation. Its real Unreal context,
  actionable findings and cost remain unproved. Installed executables are not automatically supported providers.
- **A6 [ACTIVE]:** Use Windows directory notifications through a narrow Python standard-library adapter. Events mark
  inputs dirty; content verification, not event history or timestamps, controls reuse. Reconcile missed events explicitly.
- **A7 [ACTIVE]:** `up` owns monitoring for registered targets with saved maps, with globally bounded, fair work. No
  unrelated project discovery or background lifetime after `down`. Provide an explicit saved-only opening mode.
- **A8 [ACTIVE]:** Keep one effective analysis recipe per target. Automatic jobs retain previously selected native
  depth, target/configuration policy and health options instead of silently downgrading a symbol map to modules.

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

1. [CLI](../laniakea/cli.py) makes health explicit; `up` does not collect source facts. Review already starts automatically
   for a supported saved target through [viewer/review.js](../viewer/review.js).
2. [CPD](../laniakea/unreal/cpd.py) collects strict matches with a default floor of 100. Its Java bridge uses PMD tokens
   for exact ranges and fingerprints. [Review defaults](../laniakea/review_policy.py) independently specify 100, and
   [the evaluator](../laniakea/review.py) also falls back to 100.
3. A real PMD 7.29.0 probe used four small C++ files: A/B share a readiness loop, C renames its local identifiers, and D
   implements different control flow. All four files were processed in each of eight runs:

   | mode | floor | result |
   |---|---|---|
   | strict | 100 | no match |
   | strict | 50, 40, 30 | one 50-token A/B match; C and D excluded |
   | ignore identifiers | 100 | no match |
   | ignore identifiers | 50, 40, 30 | one 52-token A/B/C match; D excluded |

   Java invocation times were 0.609-0.723 seconds on this tiny corpus. This is mechanism evidence, not a real-project
   throughput or precision claim. [Probe](../workspace/tmp/default-analysis-investigation/probe.py),
   [namespace-aware output reader](../workspace/tmp/default-analysis-investigation/read_probe.py),
   [results](../workspace/tmp/default-analysis-investigation/probe.json).
4. The current real pipeline collected the short pair at 50, but default Review emitted no duplication finding because
   its threshold remained 100. An unchanged repeat launched no Java process; one source edit invalidated reuse:

   | synthetic pipeline case | Java jobs | reuse | total seconds |
   |---|---|---|---|
   | cold | 1 | no | 0.826 |
   | unchanged | 0 | yes | 0.115 |
   | one file changes, eliminating the match | 1 | no | 0.677 |

   [Reproduction](../workspace/tmp/default-analysis-investigation/pipeline_probe.py),
   [results](../workspace/tmp/default-analysis-investigation/pipeline-probe.json).
5. [Existing CPD reuse](../laniakea/unreal/cpd.py) compares the complete selected source inventory, owners, scope, tool
   identity and threshold with the immediately preceding run's validated artifact. It is corpus-wide, not per module,
   and does not search arbitrary historical runs after an intervening run without health evidence.
6. [Native cache](../laniakea/unreal/symbol_cache.py) already works at compiler-job scope. It binds command/tool/code/
   environment identity, rechecks preprocessing and exact input bytes, including newly appearing optional headers.
   It avoids repeated indexing, not all preprocessing, copy, export or normalization work.
7. [Review cache](../laniakea/review_store.py) is disposable and keyed by the read index, manifest, policy and evaluator
   code. Triage remains separate. Global dependency cycles can change through another module; they are not a safe
   independently cached per-module property.
8. The [existing baseline command](../workspace/tmp/default-analysis-investigation/baseline.py) ran 21 tests with no
   skips or failures, including real CPD reuse/refusal and native preprocessing/negative-header controls. Results:
   [baseline-tests.json](../workspace/tmp/default-analysis-investigation/baseline-tests.json).
9. [Server](../laniakea/server.py) checks freshness before serving and pins its target index, views and Review owners
   at startup. Reference URLs carry a read-index identity; manifest/shard and layout URLs do not pin a run. Merely noticing
   a new latest pointer would not safely refresh these consumers.
10. [Navigation](../viewer/app.js) treats only a target-id change as a new map; [scene restoration](../viewer/scene.js)
    refuses a different run. [PositionCache](../viewer/positions.js) deliberately retains failed writes. Automatic adoption
    needs a same-target/new-run route, not a call to existing navigation or a page reload.
11. A standard-library Windows probe received a notification after atomic replacement and drained a cancelled pending
    directory watch. This proves local API availability, not event decoding, overflow recovery or production performance.
    [Probe](../workspace/tmp/continuous-monitor-investigation/native_probe.py),
    [result](../workspace/tmp/continuous-monitor-investigation/native-probe.json).

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

The specific private-code examples in the pasted review were not supplied or analysed here. Their detection, a useful
lower default on a representative real corpus, normalized-mode noise and Clang-Tidy's real-context value remain unproved.
Monitoring, selective invalidation, resource bounds and live adoption are unimplemented; the API probe proves none of them.
Ignored experiments are local supporting evidence; implementation must promote independent synthetic fixtures into tests.
The earlier completed CPD work records a broad lexical failure followed by a successful explicitly bounded corpus.
That is a default-usability risk: the next gate must exercise the proposed default corpus, not merely a chosen positive
subset. Under the failure policy below, an installed provider's error can block a normal build; explicit off is the
recovery path. Do not silently change that into partial successful collection.

## Current architecture and source of truth

| concern | existing owner |
|---|---|
| build requests, optional collection and publication | [CLI](../laniakea/cli.py), [pipeline](../laniakea/pipeline.py), [Unreal adapter](../laniakea/unreal/__init__.py) |
| server lifetime and authenticated stop | [service](../laniakea/service.py), [CLI](../laniakea/cli.py) |
| target settings, writer lock and latest publication | [workspace](../laniakea/workspace.py) |
| pinned reads and local layout writes | [server](../laniakea/server.py), [layouts](../laniakea/layouts.py) |
| bounded source corpus and tool identity | [source inputs](../laniakea/unreal/source_inputs.py), [SourceTree](../laniakea/unreal/source_tree.py), [CPD tools](../laniakea/unreal/cpd_tools.py) |
| duplication collection and reuse | [CPD collector](../laniakea/unreal/cpd.py), [Java adapter](../laniakea/unreal/CpdBridge.java) |
| immutable source observations | [health](../laniakea/health.py), [manifest schema](../schema/graph.v1.schema.json) |
| findings, applicability and decisions | [Review contract](../docs/architecture/review.md) |
| availability and finding presentation | [viewer contract](../docs/architecture/viewer.md#review-presentation) |

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
| Windows notifications inside viewer lifetime | one adapter, bounded coordinator and safe snapshot handoff; no package/service | recommended under A6-A8 |
| watchfiles or watchdog | external dependency lifecycle; watchfiles latest also raises Python floor | not selected under current core contract |
| periodic full source scans as primary trigger | no OS adapter, but recurring hash cost even when idle | recovery only, not primary trigger |
| Windows USN journal / external watch service | volume cursors, permissions or another runtime owner | unnecessary for session-scoped monitoring |
| per-module CPD reports | requires extra cross-module reconciliation and risks missed clones | reject; module boundaries do not partition clone relationships |
| new generic analyzer/cache framework | duplicates existing ownership without a second proven provider | reject |

## Monitoring and snapshot handoff

### Lifecycle and input identity

The coordinator belongs to the existing CLI/service lifetime, not HTTP request handlers. It invokes the pipeline and never
writes canonical facts itself. Separate the OS adapter from scheduling so deterministic synthetic events can test the
coordinator while Windows tests exercise notification delivery.

Serve cached maps first. Until reconciliation finishes, freshness is `checking`, not `fresh`. Arm watches before taking
the baseline and retain intervening dirty generations to close the startup scan gap. Reconcile on restart because events
are not a persistent log. The first project still needs an explicit `build` to register source/engine context; do not infer
projects from the browser or discover unrelated repositories.

Persist the effective recipe through the workspace owner, serialized with extraction. Successful manual builds record
their actual requested modes; failed builds do not replace the last working recipe. Seed older registrations from their
validated latest manifest when unambiguous, preserving native depth and collection scope. Otherwise show automatic refresh
as unavailable rather than guessing. The recipe is collection intent; artifacts record what succeeded. Missing optional
tools are explicit coverage limits. Ordinary module exploration remains possible without LLVM or Java.

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
Do not repeatedly retry deterministic failure for identical inputs. Retry only a classified transient condition within a
bounded observable budget, a new verified input generation, or an explicit user retry. A bad target must not starve others.

Publish through the existing validated partial-run/latest path. Then prepare an immutable server read context containing
manifest, shards, topology, exact references and Review before advertising it as ready. Pin all multi-request reads to one
generation; old in-flight readers finish on that context. Never return new reference IDs through an old URL. Expired
contexts return explicit stale/reload responses. Validate layout and triage writes against their originating context,
preserving independent user state when nodes temporarily disappear.

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

On `down`, Ctrl+C or startup failure: stop scheduling, cancel queued work and owned analyzer children, drain cancelled
watch I/O and release the service lease after cleanup. Never kill unrelated UBT or another process by PID/port.
Cancellation retains the last validated publication; startup/stop states remain truthful.

## Required invariants

1. No edits to analysed sources or project configuration; preserve the existing declared-source physical boundary.
2. Under D3, only the owned coordinator launches background analysis; hover/wheel handlers and HTTP status reads never
   launch analyzers. Native indexing remains explicit initially, and automatic jobs preserve the effective recipe.
3. Validate supplied options before availability decisions. Automatic mode may skip a genuinely absent installation
   with explicit coverage. Corrupt/partial installations, unreadable inputs, lexical failures and timeouts remain errors;
   retain the previous published map, never substitute an empty successful analysis. Explicit required collection still fails
   on missing tools. Explicit health-off avoids CPD and its source scans, but not native-required scans. Saved-only opening
   avoids source monitoring and scanning altogether. Missing tools for an existing required native recipe fail visibly;
   automatic refresh must not silently publish reduced coverage.
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

## Implementation tasks

- [ ] Promote the A/B/C/D probe into independent synthetic fixtures and tests in the existing CPD/health test owners.
- [ ] Gate A3 against a representative authorized real C++/Unreal corpus. Compare strict 100/50/40/30, inspect actual
  duplicated logic and intentional boilerplate, and verify exact editor ranges. Record cold/unchanged/edit time, hashing
  cost, peak memory and artifact sizes privately when the corpus is private. Exercise the entire proposed default corpus
  and its lexical-error behavior. If automatic collection or the lower floor is not useful/reliable there, stop that
  decision for review rather than selecting a convenient subset or claiming the short-clone goal is met by the old threshold.
- [ ] Extend the existing build health option with automatic, off and required behavior; keep existing explicit duplication
  requests supported. Resolve defaults in the profile/provider, not a new registry. Preserve programmatic pipeline callers'
  explicit collection contract unless deliberately adapted and covered.
- [ ] In the Unreal adapter, preflight only its trusted local CPD installation. Missing tooling adds a named coverage limit
  without scanning C++ or breaking ordinary module extraction. Publish an artifact only after complete successful collection.
- [ ] Align default Review floor resolution and semantic fingerprinting with invariants 5-6. Test the collected 50-token
  clone through the complete build-to-Review route, not only a command-line CPD report.
- [ ] Add the effective recipe to the existing target owner with migration from validated manifest data, exact native/health
  intent and writer-lock coordination. Prove failed requests preserve the recipe and map. Explicit one-shot builds remain
  available; automatic work uses the same pipeline and cannot silently downgrade depth.
- [ ] Implement a narrow Windows notification adapter and profile-owned root selection. Prove atomic saves, UTF-16 paths,
  duplicate/rename events, root replacement, authorized mounts, lost notifications, cancellation completion and no leaked
  handles. Reuse SourceTree for physical boundaries; keep event decoding independent of analyzer logic.
- [ ] Add the bounded coordinator under the existing service lifetime: startup reconciliation, debounce, generation checks,
  one pending latest request per target, global fairness, failure reporting and bounded recovery. Reuse existing locks and
  provider caches. `down` must stop owned work without killing unrelated tools or leaving the service lease held.
- [ ] Make cached opening independent of full freshness hashing. Introduce generation-pinned server read contexts and
  lightweight status/latest discovery. Serve manifest, topology, references, Review and write validation consistently;
  prepare the candidate context before advertising it. Adopt successful manual builds through the same path.
- [ ] Add browser adoption through existing scene/navigation/position owners, with save/draft/drag deferral and cancellation
  of obsolete requests. Preserve surviving camera/IDs/filters and Inspector intent; cover root and deep contextual files.
  Add proposed saved-only opening and explicit monitor pause/retry routes without new permanent UI panels.
- [ ] In existing Review controls, summarize unavailable/incomplete checks alongside finding counts and provide the existing
  setup/coverage route. A fresh ordinary build must not look fully checked when native or source analysis is unavailable.
- [ ] Preserve and measure whole-corpus reuse. Do not add historical lookup, persistent token caches or changed-module-only
  scans unless measured real reuse cost supplies a separate reason and equivalent complete-corpus results are proved.
- [ ] Bound automatic-run/cache retention with explicit ownership and active-context protection. Measure repeated-edit
  disk/memory/handle growth, idle overhead and analysis queue age. No-op events must create no runs. Do not expand cleanup
  into existing manual history or user data. Record remaining UBT/preprocessing costs honestly.
- [ ] Gate A4 on useful renamed clones versus boilerplate before implementing it. If it passes, add one labelled alternate
  mode through the existing artifact/collector/evaluator path, with validated versioning for old strict runs. It must not
  silently discard or mix modes, reinterpret strict fingerprints, merge distinct overlapping groups or add a default pass.
- [ ] Run synthetic and real source-evidence acceptance, compare saved positions/policy/triage, update their stable owners,
  and perform final architectural review. A5 remains outside this delivery. Finish the default-provider gate before enabling
  it in automatic jobs; finish publication/adoption gates before turning monitoring on by default.

## Test-first and verification plan

### Red evidence

| case | wrong behavior today / required proof before production edits |
|---|---|
| no expert flags, trusted CPD installed | CLI does not request source health; capture default build-to-Review behavior |
| short exact clone | A/B is absent at 100; collection at 50 still yields zero default Review findings |
| different logic and boilerplate | D must remain unmatched; real boilerplate inspection is a reviewer-checked value gate |
| missing tools | automatic behavior does not exist; require visible unavailability and successful module-only publication |
| incomplete Review coverage | button can say zero findings while a check is unavailable; require an explicit availability cue |
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
- Existing Node suites and the affected Review/health/viewer Chromium scenarios: default status, source ranges, strict versus
  normalized labels if enabled, acknowledgement/reopen, cancellation, late close and bounded pages.
- New deterministic coordinator regressions plus actual Windows integration: startup gap, event storms/overflow, missing
  root return, unauthorized junction retarget, same-size/timestamp content edit, negative optional headers, duplicate events,
  manual/background contention, fair scheduling and stop during watch/copy/Java/native work. Stop/refusal leaves last good
  publication and user data unchanged. Root deletion/link fixtures must follow the repository's local test permissions.
- Server/browser tests: cached opening before blocked freshness scan, consistent generation URLs for every artifact,
  old/new reference and triage requests, context expiry, multiple tabs, manual build adoption, failed read-index preparation,
  drag/save-error/draft deferral, deleted focus fallback and closed Inspector retention. No automatic camera fit.
- Real walkthrough: normal build needs no health flag when tools exist. Open the saved map, edit an authorized source,
  observe updating then validated adoption, inspect exact evidence and confirm exploration state remains. Repeat with shared
  header and descriptor/context edits, a provider failure and recovery, absent tools, saved-only opening and `down`/restart.
  No unrelated Engine rebuild is required for CPD. Keep all real-project evidence private.
- Record actual cold/warm/edit costs on matching corpora. Reject repeatable material usability regressions, not a guessed
  percentage. Measure idle CPU/I/O, opening, dirty reconciliation, UBT preparation, reused/recomputed provider work, publication,
  adoption and pointer p95/max while analysis runs. Include repeated edits for disk/memory/handle growth and queue stability.
  Do not claim real-project throughput from the four-file probe or notification delivery time as analysis latency.

## Documentation plan

- [CLI help](../laniakea/cli.py) owns options; [Makefile](../Makefile) remains a shortcut. Update runtime recovery hints only
  where their required explicit-health wording changes.
- [Guide](../docs/guide.md) owns default live use, saved-only opening, optional setup, coverage, pause/retry and stop.
- [Unreal profile](../docs/architecture/unreal-profile.md#source-duplication) owns automatic/off/required acquisition,
  source boundaries, failure behavior and reuse. Replace its explicit-only statements after implementation.
- [Review](../docs/architecture/review.md) owns effective display policy, mode meaning and decision stability;
  [viewer](../docs/architecture/viewer.md#review-presentation) owns availability and snapshot-adoption behavior.
- The coordinator introduces a distinct durable lifecycle contract. During implementation, give input generations, bounded
  work, shutdown and publication handoff one owner at `docs/architecture/live-analysis.md`, routed from the existing
  architecture README. [Structure](../docs/architecture/structure.md) and the main diagram retain only component boundaries;
  do not repeat the lifecycle in the guide, profile or viewer. Do not create separate watcher/cache/scheduler documents.
- Preserve [third-party terms](../THIRD_PARTY.md); no new dependency is proposed. [Verification](../tests/README.md) owns commands.
- Stable docs/code must not link to this task. Archive it under the existing todo lifecycle after approval and completion.

## Rollout and rollback

Change defaults only after the value gate. Provide explicit fast/off behavior while keeping required-mode failure visible.
Develop monitoring with saved-only opening available; enable default monitoring only after shutdown, failure, adoption and
real-cost gates pass. Retention affects only newly tagged automatic artifacts under the protected-state contract. Preserve
existing validated runs, user decisions and hidden pins. Version normalized evidence if enabled and prove old strict reading.
Disabling monitoring must leave manual build/up/down and stored maps usable; rollback never resets layouts or triage.

## Completion criteria

Default use demonstrates useful recorded concerns, explains unavailable coverage and reuses unchanged analysis safely.
Continuous edits update the visible map through a consistent immutable snapshot without lost work, camera jumps, unbounded
jobs or repeated identical runs. Missed notifications and restart recover; stop releases owned work promptly. Measured real
cost supports the chosen debounce/reconciliation/retention policy, with remaining expensive phases disclosed.
The lower-floor and any normalized-mode gates have real evidence or an explicit unresolved limitation, not synthetic-only
claims. All relevant regressions, source/boundary failure paths, browser checks, privacy checks and stable-owner updates pass.
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
