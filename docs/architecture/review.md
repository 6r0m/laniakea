# Architecture review

Review evaluates a published snapshot without invoking extraction or modifying the analysed project. It reports
recorded concerns and configured constraint violations, not an overall architecture grade.

## Rules and evidence

| check | result |
|---|---|
| Module dependency cycle | Candidate; a configured acyclic constraint makes the witnessed cycle a violation |
| Forbidden module dependency direction | Violation only when a configured rule forbids the recorded relation |
| Native missing-direct-dependency note | Candidate from existing profile annotations; never an automatic violation |

Red identifies a policy violation; yellow identifies a review candidate. Each finding names its rule, affected
modules, context, limits and exact witnesses. Counts of findings, recorded relations and displayed witnesses are
different quantities. Large findings retain bounded witness samples; other exact references remain in ordinary inspection.

The evaluator reads canonical payloads through the existing read index. It does not reason from bundled lines,
visual crossings or file representatives. The Unreal adapter owns build-edge interpretation and native-note eligibility;
generic rules own selectors, directed constraints and iterative strongly connected component detection.

Rules evaluate the selected run, not current unsnapshotted source or other targets. Partial coverage permits a proven
positive witness but cannot prove global conformance. Disabled, unavailable, partial and failed checks remain explicit.
A high count, a hub, recursion or an intentional cycle alone does not justify a violation. Runtime/Editor constraints,
change-history analysis and metric thresholds are outside this evaluator.

## Policy

The viewer shows the target's local policy path under `workspace/targets/<id>/review/`. Edit that JSON and use
Recheck; no extraction or server restart is needed for policy changes. The
[synthetic policy](../../fixtures/review.rules.json) is an example to adapt, not an automatically selected design.
[The policy validator](../../laniakea/review_policy.py) owns accepted fields, bounds and matching syntax.

A missing file enables candidate-only defaults. An unreadable or malformed file fails review visibly instead of
silently substituting defaults. Required selectors with missing IDs or no matches are unavailable. Inspection exposes
resolved module sets. Exact IDs, case-sensitive label globs, recorded root/path prefixes and exclusions select modules;
they never scan the source tree. Explicit constraints must reflect the project's actual intended architecture.

## Finding, evidence and decision

A finding identifies a rule and a module relationship or cyclic component within one build context. Its semantic
fingerprint captures the rule's effective meaning and relevant module relations. It excludes source coordinates,
raw call-site identities, display wording, witness selection and ordering.

Location-only edits regenerate the report and exact links while retaining a matching decision. More call sites to
the same module pair do not by themselves change that module-level concern. Changed rules, relevant dependency
relations, cycle membership/internal relations or build context require reconsideration. Missing compatibility is
not silently treated as a match. Evaluator/profile versions must change when their semantic interpretation changes.
For native notes, recorded transitive/public-exposure reachability states affect triage; choosing another witness
path with the same reachability does not. Cache identity binds the code loaded by the server, not later worktree edits.
Restart serving after changing backend code.

Accept risk and Not relevant remove findings from active badges/list and retain severity and a separate acknowledged
count. Show acknowledged provides inspection and Reopen. Reopen restores active presentation. Acknowledgement is
not a fix; a finding absent from a later or less complete report is not automatically resolved.

The triage writer validates report identity and a revision before a coordinated read/merge/atomic replacement.
Other tabs or server processes cannot silently overwrite a newer decision. A refused write leaves the displayed
decision unchanged and provides an error. Corrupt triage fails visibly; unavailable findings do not delete decisions.

## Lifetimes and failure isolation

| owner | lifetime |
|---|---|
| Canonical graph, manifest and reference index | Pinned to the run advertised by the server |
| `review/cache/` | Disposable reports keyed by indexed content, manifest, policy and evaluator code |
| `review/rules.json` | Local policy input; explicit recheck reloads it |
| `review/triage.json` | Durable local decisions, independent of caches, runs and layouts |

Analysis starts on demand and streams exact references once for an uncached report. Only module adjacency,
summaries and bounded witnesses remain; there is no second symbol/reference graph. Finding limits fail visibly
rather than publishing a silently truncated report. A validated report cache can be rebuilt without deleting policy,
triage or pins. In-process generation is shared, and cross-process publication is locked.

The existing localhost server supplies paged findings and accepts same-origin bounded JSON decision requests.
Review failure does not prevent normal map serving or publication. No native tools load for module-only review.
All learned information and decisions remain in the ignored workspace, with no runtime network access.

Presentation and inspection are owned by the [graph contract](graph-model.md#review-presentation).
