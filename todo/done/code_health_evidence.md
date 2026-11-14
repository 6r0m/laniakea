# Code-health evidence in Review

**Status:** DONE - strict duplication delivered; complexity deferred by D3
**Scope:** Delivered optional strict C++ duplication through Review. Complexity clauses below remain deferred investigation history.
**Stable owners:** [Review](../../docs/architecture/review.md), [Unreal profile](../../docs/architecture/unreal-profile.md),
[graph presentation](../../docs/architecture/graph-model.md).

## Contents

- [Goal and authority](#goal-and-authority)
- [Verified evidence](#verified-evidence)
- [Ownership and decision](#ownership-and-decision)
- [Required contracts](#required-contracts)
- [Implementation](#implementation)
- [Verification](#verification)
- [Documentation and completion](#documentation-and-completion)
- [Execution outcome](#execution-outcome)

## Goal and authority

Help developers find concrete source-level concerns and understand their architectural context, with exact evidence,
clear analysis limits and durable acknowledgement. A metric or an empty findings list must not certify design quality.

### Authority register

- **D1:** Start with a small comparison on synthetic Unreal-like C++ and a public Unreal plugin, measuring usefulness,
  noise, cost and mapping to existing entities. Reason: reuse established analyzers rather than invent an analysis engine.
- **D2:** Preserve compiler-derived identities and source ownership; reuse Review, local decisions and map presentation.
  Analysis must not modify the inspected sources or run merely because someone opens a map. Reason: stated product boundaries.
- **D3:** Implement only the first provider that demonstrates real developer value. Strict CPD must pass a representative
  real-corpus usefulness gate before integration; otherwise stop CPD and reconsider compiler-aware complexity first.
  Reason: trustworthy, actionable findings take priority over warning volume.
- **A1 [RESOLVED]:** CPD exact-token duplication passed the first-provider gate. Clang-Tidy remains deferred after the
  real-Unreal build-context gate. Lizard remains an experimental raw-source metric, not a default warning provider.
- **A2 [ACTIVE]:** New checks are explicitly requested, candidate-only and optional. Tool installation alone enables nothing.
- **A3 [ACTIVE]:** Keep two Inspector tabs; broaden the first label to Review when code-health findings are integrated.
  Category labels distinguish Architecture, Duplication and Complexity without creating four new tabs or engines.
- D3 bounds the authorized implementation. The unselected provider stays deferred; no additional approval is needed for
  the local proof and implementation that pass this gate.

Non-goals: automatic fixes; general SOLID, god-class, dead-code or correctness verdicts; class-level cycle expansion;
Engine-internal indexing; another graph database, service, parser or renderer. Existing architecture checks stay intact.

## Verified evidence

Investigation tools: Lizard 1.26.0, PMD CPD 7.29.0 and Clang-Tidy/Libclang 21.1.8. All experimental installations,
sources and results are confined to ignored scratch. Existing Java and cached LLVM tools were reused; no host install.

### Controlled C++ results

| Case | Lizard cognitive score | Clang-Tidy cognitive score |
|---|---:|---:|
| Straight-line function | 0 | 0 |
| Two nested conditionals | 3 | 3 |
| Deeper nested loop/conditional example | 15 | 15 |
| Direct recursion plus conditional expression | 2 | 1 |
| Control flow supplied by a macro | 0 | 3 |
| Complex branch inside an active function, configuration disables branch | 15 | 0 |
| Same function, configuration enables branch | 15 | 15 |

The metric implementations are not interchangeable. Lizard describes lexical source, while Clang-Tidy evaluates the
selected preprocessing context. Matching a metric to the right function alone does not fix that difference.

CPD strict mode found the deliberate identical-body pair and omitted the renamed variant. Identifier/literal-normalized
mode included the renamed variant. The unique control stayed outside those groups. Comment/line drift preserved the
strict group's token count. CPD duplication exit status 4 is a finding result; analysis errors are different failures.

Lizard's duplicate extension normalizes tokens and aggregates repeated samples for its threshold. Its setting is not
CPD's tokens-per-match threshold. The public-module trial exposed short overload and declaration boilerplate, including
overlapping reports. Do not describe its results as exact duplicated bodies or ship its output unchanged as warnings.

The public-module trial also produced plausible complexity review areas and normalized clone candidates alongside
intentional forwarding boilerplate. These are manual assessments, not demonstrated defects or a precision percentage.
Its identity, revision, source ranges and measurements stay in ignored scratch under repository privacy rules.
At that investigation checkpoint, strict-clone usefulness beyond the controlled positive was unproved. The subsequent
implementation gate below supplies the missing real-corpus evidence; normalized similarities were not used as its substitute.

### Mapping and failure controls

- Existing native extraction and normalization mapped 14 of 18 synthetic lexical functions to unique canonical functions.
  Same-line overloads and inactive branches correctly fell back to file evidence. Canonical nodes were unchanged.
- A same-identity function with an inactive internal branch still received an inflated lexical score. This refutes treating
  successful symbol mapping as proof of selected-target metric accuracy.
- Canonical definition/declaration locations exist, but complete function end ranges do not. Do not infer interval ownership
  from the nearest preceding function or invent a header-to-implementation dependency.
- Lizard can log an unreadable input and return an empty function list. A wrapper must distinguish this from clean analysis.
- Clang-Tidy's deliberate invalid-input control returned a compiler error and nonzero exit, not a clean result.
- Tool timings and process peak memory were measured. Synthetic timings do not predict Unreal preprocessing cost.
  Full-project scalability and Clang-Tidy execution on the public plugin's actual UBT context remain UNVERIFIED.

Local evidence, not portable test inputs: `workspace/tmp/code-health-investigation/` contains `experiment.py`, `mapping.py`,
`controls.py`, `resources.py`, `provenance.json` and `results/`. Production regressions must recreate synthetic controls in
tracked fixtures; they must never depend on these disposable files or copy the benchmark project into this repository.

Primary tool contracts:
[Lizard release](https://pypi.org/project/lizard/1.26.0/),
[CPD options](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd.html),
[Clang-Tidy metric](https://github.com/llvm/llvm-project/blob/llvmorg-21.1.8/clang-tools-extra/docs/clang-tidy/checks/readability/function-cognitive-complexity.rst).

## Ownership and decision

The [pipeline](../../laniakea/pipeline.py) owns validated run publication. The Unreal profile owns source boundaries,
selected compilation context and external tool execution. Review owns policy evaluation and triage; the viewer projects
findings without interpreting C++ or spawning analyzers.

At the investigation baseline, the [policy](../../laniakea/review_policy.py) selected modules and supported three kinds. Its evaluator and
[store](../../laniakea/review_store.py) assume canonical reference witnesses; the
[Inspector](../../viewer/review.js) fetches those references by query. Source findings therefore need a small, explicit
source-evidence variant. Reusing Review does not mean encoding clones or metrics as synthetic dependency edges.

### Premise / KISS

Use mature analyzers through optional local processes: one CPD corpus job and, when requested, matching Clang-Tidy jobs
over recorded project compilation units. Add no always-running process, port or new database. Keep the standard-library
runtime and ordinary extraction independent of these tools. Give up immediate, approximate lexical warnings in favor of
traceable results and explicit missing coverage. Lizard is useful for exploration but failed the default-warning gate.

CPD adds an optional Java runtime requirement; its full tested distribution is approximately 135 MB. This is an explicit
setup cost, not a runtime download or default dependency. Preserve the distributed tool/component license notices.

Alternatives rejected for the first delivery: a custom clone/complexity engine; four independent UI systems; automatic
source scans on map opening; unqualified Lizard warnings; treating every high metric as an architecture violation.

## Required contracts

### Acquisition and publication

- Extend explicit extraction requests separately from the symbols switch. Duplication must work without LLVM; requesting
  complexity must not implicitly publish a new symbol layer. Missing requested tools/context fail visibly and retain the
  last published run. Installed tools never opt ordinary runs into source hashing or analysis.
- Follow existing [SourceTree](../../laniakea/unreal/source_tree.py) physical-root authorization, module ownership and excludes.
  Default scope is authored project source in the recorded module scope, excluding generated, vendor and Engine internals.
- Reuse native build preparation and command conversion for Clang-Tidy, factoring only that shared preparation seam if
  needed. Match the pinned toolchain and selected target/configuration. Never generate a compilation database in the
  analysed project, invoke fixes, or parse arbitrary external source trees.
- Produce one optional, versioned run artifact of raw health observations, bound by an optional manifest digest. It is
  analyzer evidence, not another graph or a precomputed triage report. Validate it before the existing atomic publication
  step. Absent means not recorded; unsupported versions, corrupt evidence and partial tools cannot imply cleanliness.
- Record tool identities/options, source hashes, scope, success/failure coverage and collection limits. CPD observations
  describe raw source tokens, not runtime equivalence. Clang-Tidy observations describe the selected compile context.
- Reuse facts only when sources, corpus membership, tools, options and relevant build inputs match. Added/deleted files
  invalidate corpus-wide clone results; do not combine independent per-file scans as if they found cross-file clones.

### Evidence, policy and triage

- Add source-range evidence alongside existing canonical-reference evidence, without weakening either validator. Preserve
  root-relative files, current snapshot hashes and exact occurrence ranges. Never create fake calls, classes or symbol IDs.
- Bind to an existing function only with a unique verified definition anchor/name in matching source bytes. Ambiguity,
  missing symbols and spans without recorded ownership remain file/module evidence. Module-only maps remain useful.
- Defaults proposed for explicit requests: exact CPD matches of at least 100 tokens per occurrence; Clang-Tidy cognitive
  score greater than 25. These are review thresholds, not universal quality standards. Normalized clones are deferred.
- Collect positive complexity metrics independently of the display threshold. Missing diagnostics are not automatically
  zero scores for every canonical function. Lowering a clone threshold below collected coverage requires a rescan and
  reports unavailable evidence rather than a false clean result.
- Source findings carry categories and candidate severity. Red remains tied to applicable configured architecture constraints.
  Explain observation, scope, limitations and possible investigation; never prescribe extracting a helper without context.
- Keep identity, semantic fingerprint, evidence coordinates and developer decision separate. Location/comment drift must
  retain compatible decisions while refreshing exact ranges. Changed clone participants/content, meaningful metric change, rule,
  tool interpretation or build context requires reconsideration. Preserve incompatible stored records.
- Clone fingerprints must use the provider's token semantics, not raw line numbers or a regex that guesses C++ comments
  and strings. CPD exposes token images through its public API; prove a bounded adapter can supply stable fingerprints
  before freezing the artifact contract. Do not silently substitute another engine's token identity.
- Bind report cache identity to observation digest as well as policy and loaded evaluator code. Keep triage's current
  report/revision checks, refusal behavior and acknowledgement/reopen workflow.

### Presentation and scaling

- Reuse the Review queue, two-tab Inspector, node badges and source links. Identify category and analysis scope clearly.
  Source occurrences get bounded evidence pages; dependency witnesses retain existing reference paging.
- Mark known symbols or their visible file/module representatives. Unmapped observations stay with their recorded owner.
  Code duplication creates no dependency wire; existing wires receive marks only from actual relationship evidence.
- Preserve all layout modes, canonical identities, viewport virtualization and user pins. Opening, panning or zooming a map
  only reads published evidence; it never starts tool work or scans current sources.
- Keep bounded output/process lifetimes, cancellation and explicit coverage failures. Large or truncated provider output
  must not become a clean report. Record extraction/cache cost and browser p95/max on matched scenes; do not invent a fixed
  percentage gate or claim large-project performance from this small benchmark.

## Implementation

1. Run strict CPD at the proposed 100-token threshold on a representative real C++/Unreal corpus. Manually inspect
   representative matches, separating actionable duplicated logic from intentional/generated boilerplate. Verify useful
   exact source locations. If meaningful strict matches are not demonstrated, stop CPD implementation and reconsider
   complexity first under D3. Keep all corpus identities, source and identifying results in ignored workspace.
2. Add tracked synthetic corpus and red controls from the cases above. Prototype CPD token fingerprints and source-evidence
   validation first; stop and revise this plan if the provider cannot meet the identity contract without another engine.
3. If CPD passes the value gate, deliver explicit exact-clone acquisition, optional artifact validation/freshness and source-evidence Review handling.
   Keep extraction defaults and the existing reference branch unchanged. Prove file/module fallback without native tools.
4. Only if CPD does not pass, run matched Clang-Tidy on a public Unreal plugin in an isolated recorded build context. Verify active branches, macros,
   mapping, noise and costs. This is a technical gate before enabling compiled-complexity findings, not an accepted result.
5. If that gate passes, add compiled-complexity observations through the same evidence and Review path. Missing optional
   complexity context remains unavailable; no fallback to lexical scores presented as compiled metrics.
6. Complete browser acceptance, privacy checks and stable contract documentation for the chosen provider and stop.
   The other provider remains deferred. Defer complexity score-delta triage until its provider passes the real gate;
   insignificant score drift must not create repeated warning spam.

## Verification

| Boundary | Required proof |
|---|---|
| Duplication | True exact clone, unique control, renamed near-clone excluded by strict mode, per-occurrence threshold, overlapping groups, comment drift, malformed/unreadable input |
| Complexity | 0/3/15 controls, macro body, recursion dialect, same function with inactive/active branch, no diagnostic versus explicit zero, selected target and tool version |
| Ownership | Header/definition split, same-line overload ambiguity, lambda/generated context, unmatched file, unchanged canonical IDs, module-only fallback |
| Reliability | Tool absence/crash/timeout, corpus edit during scan, out-of-root link, corrupt/oversized evidence, no publication or triage mutation on refusal |
| Cache and decisions | Corpus add/delete, tool/options/context changes, threshold below coverage, line-only edits, acknowledgement/reopen, stale source links labeled honestly |
| UI | One-click source explanation, all occurrence pages, badges across folding/off-screen views, no invented edges, optional-category isolation, late-close and unchanged pins |
| Cost | Cold/repeated real-context analysis, peak memory, bounded large synthetic corpus, no tool invocation or extra source hashing during ordinary extraction/map opening |

Use the [existing test routes](../../tests/README.md), including JavaScript, affected browser suites and focused Python tests.
Add provider tests only behind explicit optional-tool inputs; a skip is not proof. Before acceptance, demonstrate the chosen
checks finding useful synthetic concerns while clean controls remain quiet. Public-project suggestions remain manual
review candidates, never evidence that the whole project has bad architecture.

## Documentation and completion

Update the existing Review contract for source evidence, identity and coverage; the Unreal profile for tool execution and
source boundaries; the guide for category meaning; and tests README for optional-provider acceptance. Extend schemas as
owned executable contracts rather than duplicating their fields in prose. Stable docs must not link to this task.

Rollout is explicit and optional. Ordinary module extraction and old runs remain usable without health tools or artifacts.
If requested analysis fails, retain the previous complete map; do not publish partial success or hide the failure behind a
clean count. Reverting presentation code must not delete policy, triage or saved layouts.

Complete only after the chosen provider gates, source-evidence workflow, matched browser checks, privacy checks and real
Unreal acceptance pass. Migrate durable knowledge to the owners above, then mark DONE and archive under the existing
todo lifecycle. An investigation or passing documentation tests does not satisfy these future acceptance gates.

## Investigation review record

The initial investigation changed only this plan. The implementation below subsequently changed optional acquisition,
artifact validation, Review evidence, viewer presentation, regression coverage and their stable documentation.


## Execution outcome

Completed the authorized first-provider scope on 2026-11-14.

- **Product gate:** strict real Unreal source matches included duplicated production enum parsing and hierarchy traversal.
  Manual inspection also identified potentially intentional test setup. An initial broader lexical failure remained a
  failure; the successful bounded corpus used explicit scope. Exact ranges were inspected in the live galaxy.
- **Delivered:** offline PMD CPD setup, explicit duplication collection, immutable validated observations, corpus-wide reuse,
  bounded source-evidence pages, file/module badges and existing acknowledgement/reopen. Queue rows include filenames
  and token counts so separate findings in one module remain distinguishable. No clone dependency wires or function owners
  were invented. Canonical graph and source files remain unchanged by CPD.
- **Isolation/refusal:** missing tools and invalid scope fail before UBT. Lexical errors, timeout, corpus edits and corrupt
  or oversized evidence retain the last published map. Ordinary extraction remains independent of Java, LLVM and C++ hashes.
- **Verification:** 173 JavaScript tests; 210 non-Engine Python tests, four optional skips; twelve Chromium scenarios across
  the existing browser functions and the new health function. The selected real native extraction, module-only probe,
  exact-source walkthrough, cold/repeated CPD costs and matched browser timing checks passed. Saved layouts, policy and
  triage were checked without migration. The unrelated Engine integration suite was not rerun.
- **Durable owners:** Review, Unreal profile, graph presentation, structure, operator guide, third-party notices and test
  routes now document the delivered contracts. Laniakea remains AGPL-3.0-or-later; supplied analyzer notices are retained.
- **Deferred:** Clang-Tidy's real-context value/cost gate and meaningful score-delta triage. D3 authorized the first useful
  provider, not a second implementation after CPD succeeded. No Lizard fallback, general SOLID verdict or automatic fix.
- **Limits:** raw token matches do not establish semantic equivalence, active branches or intended reuse. Some matches are
  intentional. Existing occasional long frames remain a measured limitation; no material badge regression was demonstrated.

Private source identities, locations, measurements and receipts remain only in ignored
`workspace/tmp/code-health-implementation/` and the selected extraction run. Portable tests recreate synthetic cases.
The pre-existing staged plan was preserved in the Git index; this completed working-tree plan was archived without staging.
