# Native dependency access

Status: DONE

## Authority register

- D1: The operator approved checking evaluated internal dependencies instead of treating every missing direct entry as a problem.
- D2: Keep the analysed project read-only, existing graph identities, exact references and saved positions.

## Decision

The Unreal normalizer owns dependency-access interpretation. Follow UBT's private compile environment: the first
dependency may be private, subsequent dependency hops must be public. Include-only traversal follows public include
modules, without turning them into link dependencies. A known path is ordinary context, not a default style warning.

Missing module fields or boundary records make reachability unverified. Include-only access to a static call does not
prove linkage; report that limitation without alleging a missing dependency. Link actions and runtime reachability are
outside this check. A fully recorded closure with no access path can yield a yellow review candidate, never an error.
Older annotations without access evidence are unverified. Configured dependency constraints remain independent.

## Owners and invariants

- [Unreal profile](../../docs/architecture/unreal-profile.md) owns normalization and coverage.
- [Review](../../docs/architecture/review.md) owns eligibility, triage and severity.
- Existing canonical references, SQLite paging, module-only extraction and viewer projection remain authoritative.
- No Engine implementation indexing, new parser, schema, service or policy writes.

## Verification

1. Regression-first synthetic public exposure; private intermediate, cycles, include-only, incomplete and legacy controls.
2. Real LLVM normalization cases, unsupported-path positive control and unchanged configured red constraints.
3. Non-Engine Python suite; JavaScript and affected browser acceptance.
4. Cached native normalization, real report and exact call context; unchanged saved layouts/policy/triage.
5. Stable contract updates, documentation/privacy checks and archive this task as DONE.

One initial real extraction plus one replacement after a necessary fix. No unrelated Engine build is required.

## Outcome and verification

- Normalization follows evaluated module public exposure and include-only propagation. It preserves exact calls and
  provides ordinary access context instead of direct-entry warnings. The viewer consumes existing reference metadata.
- Missing coverage, include-only static linkage and legacy notes are explicitly unverified. Review reports that count
  without active findings. Native fingerprint version 3 preserves stored records while requiring semantic compatibility.
- The public-path regression first failed because a valid indirect path still acquired `dependency_review`.
- `python -m unittest discover -s tests -p test_dependency_access.py`: 7 passed.
- LLVM-enabled `test_native_symbols.py`: 29 passed; `test_review.py`: 25 passed.
- Non-Engine Python gate: 196 executed, 192 passed and 4 optional skips. The three Engine integration tests were not run.
- JavaScript regression suite: 170 passed. Inspector, Review and configured-policy Chromium scenarios passed.
- Real selected-target native extraction and live exact-call inspection passed. Supporting module access remained visible,
  with no default native finding. Saved layouts, local policy and triage remained byte-identical/absent as applicable.
- The real project changed during verification; its freshness warning remains truthful. No current-source build or runtime
  execution claim is made. Link environments, custom build inputs and exhaustive semantic coverage remain outside this check.
- Documentation/privacy checks, worktree private-pattern scan and `git diff --check` passed. No staging or commits.

Durable semantics live in the Unreal profile and Review contracts linked above. Runtime evidence stays in ignored scratch.
