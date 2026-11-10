# C++ architecture readability and encapsulation

**Status:** REVIEW REQUIRED  
**Scope:** Native C++ ownership/metadata and generic map exploration, hover, search and navigation  
**Stable documentation owners:** [Unreal profile](../docs/architecture/unreal-profile.md) and
[graph/viewer semantics](../docs/architecture/graph-model.md)

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Non-goals](#non-goals)
- [Verified evidence](#verified-evidence)
- [Current architecture and source of truth](#current-architecture-and-source-of-truth)
- [Problem and root cause](#problem-and-root-cause)
- [Demonstrated exploration gaps](#demonstrated-exploration-gaps)
- [Decision](#decision)
- [Required invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks)
- [Test-first and verification plan](#test-first-and-verification-plan)
- [Documentation plan](#documentation-plan)
- [Rollout and rollback](#rollout-and-rollback)
- [Completion criteria](#completion-criteria)
- [Review record](#review-record)

## Goal

Make a module's structure, encapsulation and relationships understandable quickly to an ordinary C++ developer.
Expanding it should reveal real declaration containers, then their members, with enough immediate context to
distinguish types, methods, local helpers and lambdas. Fix the demonstrated navigation/readability failures at
every recorded depth. Follow D1-D3 and disclose coverage instead of claiming exhaustive C++ support.

## Authority register

### Operator decisions

- **D1:** Support all real containers needed to understand encapsulation, rather than presenting functions and
  lambdas together without their owners.
  - Effect: Investigate ownership throughout extraction, normalization and presentation, not just class styling.
  - Reason: Make encapsulation understandable in the galaxy.
  - Date/source: Operator request, 2026-11-10.
- **D2:** Retain seamless galaxy exploration through wheel zoom and dragging.
  - Effect: Extend containment within the existing continuous map.
  - Reason: Minimal actions while exploring connected architecture.
  - Date/source: Earlier operator direction in this conversation.

- **D3:** Check the reported module at every depth as an ordinary C++ programmer, assess whether the full picture
  is visually intuitive and quick to understand, and broaden/rename this todo to include demonstrated gaps.
  - Effect: Scope includes encapsulation observability and exploration, not only missing namespace parents.
  - Reason: Understand the full picture quickly through the visualization.
  - Date/source: Operator follow-up, 2026-11-10.

### Operator gates

No open blocking question for the proposed scope. Review of A1 is part of approving this plan; implementation
is not authorized by the existence of this file.

### Working assumptions

- **A1 [ACTIVE]:** The requested hierarchy means actual declaration owners of the indexed classes/functions,
  including namespaces and local callable/type owners. It does not replace the map with a filesystem browser
  or request every C++ variable, enum value and statement as a new star. Files remain source context under the
  existing graph contract. A request for those additional symbol categories would require extending this scope
  explicitly; do not describe the proposed change as complete indexing of all C++ constructs.
- **A2 [ACTIVE]:** Preserve existing retained symbol identities and saved coordinates. New namespace containers
  receive new identities; no position reset or migration is needed.
- **A3 [ACTIVE]:** Declared data members need compact owner summaries and honest coverage, not a star per field
  or unbounded member arrays in the map payload. Existing source links provide full source inspection.
- **A4 [ACTIVE]:** Keep names-only canvas styling and the accepted direction colors. Put richer compiler meaning
  in concise hover/inspection context, with no random per-class color scheme or extra default wires.

## Non-goals

New renderer, decorative grouping, Engine-internal indexing, runtime dispatch, new language profiles,
changes to build-target selection, automatic native indexing, or changes to unrelated wire interaction.
Do not move genuine free functions into invented classes. No new service, port, dependency or graph store.
Do not turn this into an IDE, a filesystem tree, a complete variable/statement index, or another broad performance
project. Do not hide test code or macro-generated declarations by spelling or source-folder heuristics.

## Verified evidence

### Facts

- [Native metadata](../laniakea/unreal/native_index.py), `metadata()`, retains semantic parents only when their
  cursor kind is in `CLASSES | FUNCTIONS`. Namespaces contribute qualified text but no ownership node.
  The declaration callback also excludes namespace cursors.
- [Normalization](../laniakea/unreal/symbols.py), `merge()`, retains only class/function facts, initially assigns
  a module parent, then reparents when the compiler parent is also retained. Class methods already nest.
- [Native API](../laniakea/unreal/native_api.py) already binds semantic-parent lookup. The installed pinned LLVM
  also exposes lexical-parent lookup; it is not currently bound by the adapter.
- A local synthetic native diagnostic with named/reopened and anonymous namespaces, nested records,
  an out-of-line method, a local class, a class template, a union and three nested/generic lambda expressions
  parsed without compiler errors. Current normalization succeeded. Namespaced functions still had no
  namespace parent; nested methods/local classes retained their class/function parents.
- The same diagnostic observed namespaces in declaration callbacks. Reopened named namespaces shared a
  compiler USR. An anonymous namespace had USR `c:@aN`, which alone cannot distinguish different files/units.
- Lambda expressions in that diagnostic had no USR. Referenced closure classes and call operators did have
  compiler identities and owner chains. Closure names contained compiler-generated absolute source paths.
  Do not create duplicate lambda entities from expression positions and existing closure identities.
- Read-only inspection of the reported private module confirmed both named-namespace and anonymous-namespace
  helpers among its direct function children, alongside correctly grouped class methods. Its identifying
  evidence remains only in the ignored workspace.
- [Profile publication](../laniakea/unreal/__init__.py) advertises class/function levels;
  [compiler coverage](../laniakea/unreal/compiler.py) counts those levels explicitly.
- [Universe](../viewer/universe.js) constructs containment from generic `parent` links, checks cycles and does
  not restrict child levels. [The graph contract](../docs/architecture/graph-model.md#nodes) makes a file an
  attribute, never an ownership node.
- [Native cache preparation](../laniakea/unreal/symbol_cache.py) includes native adapter code digests in its key.
  An extraction change must not reuse facts which never recorded the missing owners.
- [Map index construction](../laniakea/map_index.py), `build()`, retains canonical node labels/attributes but
  reduces references to endpoint/type/count groups. Individual external declaration names remain in exact
  reference payloads, not those groups. The existing
  [external-declaration paging regression](../tests/test_map_index.py) proves that distinct declarations can
  share one compact group and still be recovered through paging.
- A synthetic probe against the installed LLVM 21.1.8 verified access, static/virtual/const method properties
  and semantic versus lexical parents on out-of-line definitions without compiler errors. Its macro cases
  demonstrated spelling/expansion locations, not a universal generated-code classifier. Lexical parents locate
  syntactic ownership; retaining a header declaration location still requires collecting that declaration.

- A live Chrome walkthrough used trusted wheel/mouse input from the overview through folder, plugin, module,
  class, method, closure, call operator and a nested closure/operator. Class ownership and deep wheel expansion
  worked on that path. Empty-space panning and short zoom reversal cycles also worked. This does not prove every
  branch or every possible C++ construct.
- The walkthrough also inspected a production class, a static method, a data-only struct and a namespace helper,
  and compared their visible information with read-only source declarations. The findings below are based on
  those observations, not just the original screenshot.
- Chrome screenshots are outside this clone. Private structured evidence is under ignored
  `workspace/tmp/encapsulation/browser/`. Saved-layout SHA-256 hashes matched before and after exploration.

### Refuted and unverified

"Classes are never grouped" is refuted by the actual graph and the synthetic method/local-class results.
The defect is incomplete declaration containment, not a missing class renderer.
"Deep callable children cannot be reached at all" was not observed: the checked nested chain was reachable.
No complete inventory of language constructs, lambda ownership contexts or cross-unit namespace identity
has been proved. The regression matrix below closes those specific gaps before implementation acceptance.

## Current architecture and source of truth

[Graph semantics](../docs/architecture/graph-model.md) own generic containment and continuous projection.
[Unreal profile](../docs/architecture/unreal-profile.md) owns compiler integration and coverage limitations.
Native compiler facts flow through `native_index.py`, `symbols.merge()`, profile publication, shards and the
disposable map index into `Universe`. The extraction adapter owns C++ meaning; the viewer must not infer it
from qualified names, paths or a list of Unreal class spellings.
The viewer's [scene navigation](../viewer/scene.js), [labels/hover](../viewer/map.js),
[search/inspection](../viewer/app.js) and [layout](../viewer/app.css) own presentation of those facts.

## Problem and root cause

Compiler-owned scopes are intentionally dropped before publication. Namespace helpers consequently become
module children, and anonymous-namespace helpers lose even their visible namespace qualification. Zooming
cannot reconstruct ownership which the canonical graph never retained. Lambda compiler labels add a second
readability problem; their existing containment is not evidence that every lambda context is correctly indexed.

## Demonstrated exploration gaps

| ID | Evidence and consequence | Smallest required outcome |
| --- | --- | --- |
| F1 | `native_index.metadata()` and `symbols.merge()` omit namespace containers; source-backed helpers look unrelated | Preserve real compiler scope ownership, including anonymous/local contexts |
| F2 | Native metadata publishes only broad class/function levels. A real struct appears as a class; a constructor and a static method appear as generic functions | Expose accurate declaration kind and compiler-observed callable properties |
| F3 | Source contains public methods, a private constructor and stored fields; the map cannot explain these distinctions. A data-only struct has no indexed children and no field-coverage explanation | Summarize member access and recorded data/member coverage; never equate zero indexed children with an empty C++ type |
| F4 | Class hover lacks a concise inheritance/override readout; compact reference groups omit exact external declaration names | Show directional reference counts from the current projection; inspect exact declarations through existing paged Details |
| F5 | Definition promotion retains one source location; method inspection requires expanding Metadata to see even its limited signature | Keep declaration and definition context distinct, and surface a useful signature before exhaustive metadata/reference rows |
| F6 | Closure labels contain absolute compiler-copy paths. Deep breadcrumbs expand vertically and long ancestor links overflow horizontally; repeated operator names lose useful owner context | Readable closure names, bounded breadcrumbs/readout, and concise nearest-owner context with the full chain still accessible |
| F7 | `findHits()`/`elsewhere()` match labels only. A recorded qualified method name returns no match; an ambiguous short name offers one global winner without its owner | Qualified lookup and explicit owner/signature disambiguation while preserving global search |
| F8 | The live module overview admits a dense grid of dots/rings while suppressing almost all primary labels. Correctly nested classes become readable after zooming in | Recheck after namespace aggregation; change admission/labels only for a remaining reproduced defect |
| F9 | A source module macro invocation produces a recorded helper class without explaining its origin, alongside authored types | Expose proven macro context when available, otherwise unknown plus recorded source; incomplete provenance does not block the feature |

These are observability gaps, not evidence that every dependency or class parent is wrong. Existing hover direction
colors, pair inspection, exact-reference paging and the tested wheel/pan path remain useful and should be preserved.

## Decision

### Premise / KISS gate

The native adapter already owns declaration identity and parentage; retain that evidence there and normalize
it through existing containment. Extend that same fact boundary with compact declaration/member context, then
reuse the continuous map, existing Details, Browse & filters and reference reader. This adds no running parts
and removes viewer-side ownership guesses and the need to open source just to identify a declaration's kind.
It gives up mirroring filesystem organization as a second ownership tree, consistent with A1. A3/A4 bound the
new presentation: no per-field graph explosion, duplicate relationship store or second navigation mode.

### Delivery order

1. **Existing evidence first:** Surface recorded signature, qualified text, source and parent context in hover/Details;
   fix qualified/ambiguous search and bounded breadcrumbs. Use existing reference groups for inheritance/override
   counts, clearly scoped to the current view and direction. This stage must work on the current published map
   without new extraction, graph/schema changes or saved-position writes. Do not infer unavailable kind/access flags.
2. **Missing compiler evidence:** Add namespace containment, precise declaration kinds/access/callable properties,
   compact observed member summaries, distinct declaration/definition locations and readable closure names. Extend
   native facts only for information not already recorded. Prove identities and pinned-library behavior with focused
   fixtures, then perform one validated native extraction with the existing publication/cache safeguards.
3. **Demonstrated residual gaps:** Repeat the real walkthrough against the new containment. Adjust density, labels
   or camera limits only for a remaining reproduced defect. Attempt macro context within the native adapter's
   supported evidence; an explicit unknown/source fallback is acceptable and must not trigger another extraction
   or a broader mechanism merely to classify every helper. Complete full regression/browser/privacy acceptance.

All stages belong to this single todo. These are recommended implementation steps, not new operator decisions
or approval to implement. No additional plan, summary store, hover request or parser is required.

### Proposed containment contract

| Construct | Treatment |
| --- | --- |
| Named, nested, inline or reopened namespace | Compiler-backed namespace container; reopenings merge within an owning module |
| Anonymous namespace | Compiler-backed local scope with a readable source-context label; preserve distinct local identities |
| Class, struct, union and class template/specialization | Existing type identity and nesting; retain the actual declaration kind as metadata |
| Method, constructor, destructor, conversion/operator and function template | Existing callable identity beneath its recorded semantic owner |
| Out-of-line method definition | Class remains its owner; source location may point to the definition |
| Free function | Namespace owner where present; genuine global functions remain module children |
| Local class and lambda closure/call operator | Nest beneath the actual recorded enclosing callable/type; nested lambdas retain their chain |
| Namespace alias, using declaration, variable or statement block | Not an invented ownership container; do not split names or paths to manufacture one |
| Enum/value and other unindexed declarations | Explicit coverage limit under A1, not a claim that these C++ entities do not exist |

Namespace identity must include normalized owning-module context. A compiler namespace USR reused in several
modules must not merge those modules or move their declarations under the first encountered module.
Namespace containers must be instantiated from child ownership, not whichever namespace header location won
global fact merging. Materialize the owner chain needed by retained symbols; avoid empty namespace noise.

Anonymous scope identity must account for its actual compiler/local compilation context and remapped logical
source identity. A bare anonymous namespace USR is insufficient. Test shared headers, distinct source files,
equal basenames, multiple units and unity inputs before selecting the final identity rule. It must agree with
the existing canonical declaration identity policy: no cloning existing symbols to give them several parents,
and no unstable absolute copy paths in identities. If those constraints conflict on a real compiler case,
surface the case and revise this decision before implementing an identity migration.

Prefer semantic ownership. Use lexical/AST context only for a demonstrated local/lambda case whose semantic
chain is insufficient; never let lexical placement move an out-of-line method away from its class. Record an
observable limitation if compiler evidence is unavailable rather than inventing a parent.

Preserve existing closure and call-operator IDs. Give closures a short label using a compiler-observed
initializer name where available, otherwise `lambda` plus source coordinates. Preserve source/signature detail
in inspection without absolute compiler-copy paths in visible names. Do not turn every initializer into a node
or infer lambda calls from text. Declaration-only/unreferenced lambdas need explicit coverage evidence too.

### C++ readability contract

- Promote existing signature and qualified/source context first. Preserve the recorded signature rather than
  replacing it merely for formatting. Add type-API context only where the required kind/return/qualifier information
  is genuinely absent; do not reconstruct a signature by parsing source text.
- Retain compiler-observed declaration kind, member access and the callable properties demonstrated by the
  proof: constructor versus method/free function, static, virtual/override, const qualification and useful
  parameter/return-type context. Preserve template/operator distinctions. Extend the pinned native adapter;
  do not parse C++ source strings in the viewer or mistake reference dispatch metadata for method staticness.
- Access comes from the declaration, including default class/struct access. An out-of-line definition must not
  erase it. C++ public/private/protected access is distinct from a Public/Private source directory and from a
  module's exported ABI; do not claim one proves the other.
- Under A3, derive compact observed declared-member/access counts from compiler facts and indexed-member counts from
  canonical containment. Keep both distinguishable from `child_count`. A data-only type should say what was
  observed and that fields are not separate indexed stars. Missing metadata in an older run is unknown, not zero.
  Deduplicate repeated header declarations across units before aggregation; do not sum per-unit member counts.
  Observed members are not proof that uncompiled or unindexed declarations were exhaustively captured.
  Enumerations, value-only scopes and other unindexed constructs remain explicit coverage limits under A1.
- Preserve declaration and definition source locations when distinct. Remap both through existing source roots;
  keep source links and source-call locations separate. No absolute copy path in visible names or identities.
- Put a concise kind/owner/signature and available encapsulation summary before exhaustive reference rows in
  hover/Details. Inheritance/override hover counts come only from the existing projected reference groups, with
  direction, filters and current-view scope explicit. A reference total is not a count of distinct base types or
  methods. Keep specific declaration names and locations in existing paged Details. Do not add hover requests,
  prefetching or a relationship-summary store. Existing Details paging retains loading/cancellation/stale-result guards.
- Compiler-proven macro expansion origin is descriptive context. It must not turn all macro-declared types into
  generated noise or hide real source-authored macro declarations. If compiler evidence cannot distinguish a
  helper's origin reliably, show unknown/recorded source context and preserve it; never classify by names or folders.
  This fallback satisfies F9 acceptance; exhaustive macro attribution is not a completion gate. Missing provenance
  is distinct from a compiler/API/input failure, which retains the existing failure/publication behavior.
- Keep the canvas names-only. Hover must distinguish the focused declaration from similarly named siblings,
  overloads and repeated call operators using the nearest useful owner and signature. Preserve all reference
  totals, configuration subsets and incoming/outgoing/within semantics; do not add a new default wire type.
- Bound breadcrumb and docked-readout dimensions for deep/long names. Keep the current scope and immediate
  parent recognizable and every ancestor accessible by keyboard/link navigation without expanding a long
  compiler path into the header. Do not fix page overflow by merely clipping away navigation or source context.
- Preserve global search, but accept recorded qualified names/signature context and make ambiguous candidates
  identifiable by owner. Reuse existing search/Browse controls for a bounded choice; do not silently redirect
  a short method name to a different owner or introduce a second search index/backend. Label-only older runs
  remain searchable with their available evidence.
- Recheck F8 after real namespace aggregation. If the overview still dissolves into an unreadable grid, adjust
  generic detail admission/label spacing using immediate child density. Reveal a useful local subset rather
  than promising every name at overview scale. Preserve expansion/folding hysteresis, viewport culling, pinned
  coordinates and stable camera behavior. No hover-driven rearrangement, per-frame layout or font shrinking as
  the primary cure for missing names.
- The added owner depth must remain reachable through wheel and keyboard navigation within the existing camera
  range. Test actual new placement/radii; the successful old deep path does not prove a namespace-expanded run
  will fit the current zoom ceiling. Change camera/detail limits only against a reproduced reachability failure.

### Alternatives considered

- Group qualified names in the viewer: misses anonymous scopes, confuses aliases/templates and makes a second
  semantic owner. Rejected.
- Put all functions in a class or source-file box: misrepresents actual ownership and conflicts with A1.
- Fix namespace extraction only and advertise all containers: insufficient; existing local/template/lambda
  paths need the same ownership and coverage acceptance.

## Required invariants

1. One acyclic containment parent per node, in the correct module; compiler declarations remain authoritative.
2. Existing symbol IDs, exact references, calls, inheritance, overrides and recursion remain available.
   New parents are not new dependency edges. Preserve internal-owner classification.
3. Cross-container references continue projecting to visible representatives, with exact reference paging
   and disjoint incoming/outgoing/within counts intact as containers expand and fold.
4. All layout stores remain byte-identical during extraction and read-only verification. Existing IDs keep
   their positions; adding a parent must not drag or resave pinned children simply by opening the new run.
5. Ordinary extraction remains LLVM-independent. Native indexing stays explicitly opt-in and retains bounded
   workers, source traversal boundaries, diagnostics and last-successful-publication behavior.
6. No private source data in tracked files or browser artifacts inside the public clone. No writes to the input
   project. Source/identity paths are remapped before publication; namespaces do not authorize new traversal.
7. Older published runs remain readable without invented namespace ownership. Missing ownership evidence
   requires fresh facts, not a heuristic upgrade during serving.
8. No forced inspection panel during exploration. Clear selection, Escape and empty-space close behavior,
   pointer routing beneath expanded containers, label priority and exact-reference paging remain intact.
9. Added metadata remains bounded in the hot map. No unbounded member-name arrays, eager per-node exact-page
   requests or additional graph elements just to explain a hover. Profile-owned C++ meaning stays outside the
   language-neutral renderer; it presents optional recorded metadata and generic containment/relations.

## Implementation tasks

Before each stage, observe the relevant new regression assertions fail before changing that behavior's owner.
Preserve existing correct nesting as a control, not an artificial red test. F9 guards evidence/fallback truthfulness,
not universal attribution; F8/zoom corrections are conditional on remaining reproduced defects.

### Stage 1 - Existing evidence

- [ ] Add viewer regressions for recorded signature/qualified/parent context, projected relation counts,
  qualified/ambiguous search and deep breadcrumbs. Include a no-hover-request assertion.
- [ ] Implement those changes through current hover/Details, search/Browse controls and navigation.
  Preserve exact paging, direction semantics, keyboard navigation and explicit panel-close behavior.
- [ ] Verify on the current published map, including a legacy/missing-metadata case, without native extraction
  or graph/layout writes. Record this stage's usability evidence before changing compiler facts.

### Stage 2 - Missing compiler semantics

- [ ] Add focused native regressions for missing scope/kind/access/properties/member/source context. Resolve
  multi-unit anonymous/named identities with pinned LLVM before assigning new parents; record the rule and limits.
- [ ] Extend native facts only where the existing evidence cannot meet the contract. Use current compiler APIs
  and workers, not another parser or source-text heuristics. Preserve error isolation and diagnostics.
- [ ] Normalize owner chains in `symbols.py` without changing retained symbol IDs or references. Refuse conflicting
  containment; exercise repeated declarations, definition promotion and remapped declaration/definition sources.
- [ ] Update required profile levels/coverage and invalidate incomplete fact caches. Inspect schema/shards/map-index
  consumers; change them only for a demonstrated integration gap. No extra relationship-summary representation.
- [ ] Run focused native/cache/normalization checks, then one validated extraction using the selected build context.

### Stage 3 - Residual acceptance

- [ ] Repeat namespace/local/lambda naming, data-only coverage, deep wheel navigation and search acceptance.
  Recheck F8 after containment; make the smallest generic admission/label correction only if it remains reproduced.
- [ ] Check macro context and its explicit unknown/source fallback. Preserve macro-created types and exact facts;
  do not block unrelated acceptance or widen extraction to obtain exhaustive provenance.
- [ ] Run the full declared verification matrix, migrate durable knowledge and review the final focused diff/privacy state.

## Test-first and verification plan

### Red evidence

| Case | Wrong behavior to detect before production edits | Evidence class |
| --- | --- | --- |
| Named/nested/reopened namespaces | Normalized functions/types have module parents instead of compiler scope parents | Permanent native/normalization regression |
| Anonymous scopes and equal basenames | Local owners absent, merged across unrelated contexts or assigned to the wrong module | Permanent native identity regression |
| Same namespace across modules, headers, units and unity inputs | Owner merges across modules or changes with batch order | Permanent normalization regression |
| Out-of-line methods, templates, nested/local records | Preserve already-correct parents while inserting missing ancestors; a known-bad parent control must fail | Existing guards plus representative native extension |
| Nested/generic lambdas and initializer contexts | Absolute-path labels, missing observed owner, duplicate closure entities or incorrectly attributed references | Permanent native/normalization regression |
| Declaration-only lambda and unindexed contexts | Coverage overstates supported ownership or silently changes observed facts into complete coverage | Acceptance evidence and reviewer-checked coverage wording |
| Real module expansion | Direct namespace helpers appear as unrelated module stars | Before/after private browser acceptance |
| Declaration kind and access | A struct, public static method and private constructor have no useful semantic distinction | One representative native normalization fixture plus hover/Details regression |
| Data-only type | Stored fields are absent from indexed children and the UI gives no scope/coverage explanation | Compact member-summary regression with repeated-header deduplication and old runs with missing metadata |
| Inheritance/override readout | Useful relation counts are buried among ordinary usage rows | Projected count/direction/filter regression; exact external names stay pageable; no hover request or new summary data |
| Declaration versus definition | Out-of-line promotion loses distinct declaration location/context | Native merge regression with header access and source definition, including source remapping |
| Qualified and ambiguous search | Qualified method is unmatched; short name has one unqualified global choice | Synthetic shared short names/overloads in several owners; trusted keyboard acceptance |
| Deep/long breadcrumbs and hover context | Header grows with compiler paths; an ancestor link overflows and a repeated leaf loses its nearest owner | Synthetic deep/long-name rendering, viewport-width and reachable-navigation checks |
| Dense module/namespace reveal | Opening a group produces mostly anonymous glyphs at normal framing | Before/after live acceptance plus a faithful dense synthetic fixture; permanent guard for a reproduced admission/label defect |
| Macro-origin context | Unsupported evidence could be treated as certain origin or prevent completion | Native known-macro control plus insufficient-evidence fallback; neither case suppresses types, changes refs or requires universal attribution |
| Added-depth reachability | New containers may exceed the zoom range, despite the previous shallower path working | Synthetic placement/camera acceptance for the added hierarchy; reject an inaccessible group control |

The missing-namespace assertions must reject current output. Identity tests use a relevant merged-owner bad control
where current behavior is already sound. Existing correct nesting is a preservation control, not a fabricated
failing test. Use the existing synthetic project infrastructure in
[native tests](../tests/test_native_symbols.py); add focused cases for distinct failure modes, not one per spelling.

### Green evidence

- Stage 1 must pass the targeted viewer/browser checks against the existing published run. Confirm canonical graph
  and saved-layout hashes are unchanged and node hover issues no exact-reference requests. Recorded labels/qualified
  names may resolve retained project types; do not fabricate missing external declaration names from endpoint labels.
- F9 passes with either proven macro context or an explicit unknown/recorded-source fallback. Verify both paths
  preserve declarations and references. Do not require every helper to be attributable, treat source coordinates
  as a disposability classifier, or convert actual compiler/API/input errors into successful unknown provenance.
- Run the same native cases with `LANIAKEA_TEST_LIBCLANG` pointing to the local pinned library. Validate canonical
  graph, manifest levels, shards and map-index reference queries; IDs and exact pre-existing reference identities
  must survive added containment. Validate reordered batches and rejected ownership collisions.
- Run focused [cache tests](../tests/test_symbol_cache.py) for stale facts and the module-only isolation cases in
  [input tests](../tests/test_symbol_inputs.py). Then `python -m unittest discover -s tests` in the supported Windows
  environment, with diagnostic/temp output directed into the ignored workspace.
- Check native fact/map payload size and extraction timings with the added member metadata. Keep member summaries
  compact; no native input boundary, publication failure behavior or cache-validation requirement may be weakened.
- Run `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs`.
  Extend generic containment/projection tests only for newly exposed owner-chain behavior.
- Run the existing trusted-pointer functions in [viewer browser acceptance](../tests/viewer.browser.js) and
  [trace browser acceptance](../tests/traces.browser.js) using their documented local browser route.
- Before native extraction, hash saved layout files and capture the published run ID. Request one fresh native
  extraction using the existing selected target/configuration policy. Record cache hits/misses, per-unit diagnostics,
  wall time, peak memory and artifact sizes. Adapter code changes can require a cold fact pass; do not promise cheap
  reuse or relax preprocessing/input validation. A failed extraction must retain the last published map.
- On the new private map, explore the reported module and representative namespaces, class methods, nested/local
  types, data-only types and the full nested lambda/operator chain. Repeat F1-F9 against read-only source and
  explicit browser postconditions: correct owner/kind/access/signature, qualified search choices, recognizable
  names, bounded header/readout, usable graph area, no page-wide horizontal overflow, source links and exact refs.
  Check both the regular desktop viewport and a narrower viewport with Details closed/open. Clear, Escape,
  group-label/wire routing and delayed reference results must preserve their existing behavior.
  Record unsupported cases honestly; compiler success alone is insufficient.
- Confirm existing pins and reopened-tab positions without resaving/resetting them. Compare matched-scene visible
  node counts, cold hover after camera movement and wheel/frame p95/max with the previous run. Reject repeatable,
  materially worse interaction; no new benchmark infrastructure or speculative performance work.
- Run documentation links, ASCII and existing local privacy checks. Keep all real-project evidence private.

## Documentation plan

- **Authoritative stable owner:** Unreal profile, for compiler scope, declaration/member metadata, source locations,
  provenance, identity and coverage limits.
- **Generic consequence:** Update the existing graph-model Levels description for newly published profile levels;
  retain its file/source and single-parent contracts. Its viewer sections own density/reveal, context/search and
  deep-navigation behavior. Do not duplicate native extraction rules there.
- **User entrypoint:** Adjust the existing README symbol-analysis explanation only as needed to describe what
  zoom reveals and which extraction refresh is required.
- **Router update:** None; the existing owners are already reachable. Keep `todo/README.md` lifecycle-only.
- Stable docs, code, comments and tests must not link to this todo. Migrate lasting decisions before closing it.

## Rollout and rollback

Publish a validated new run through the existing extraction path; do not edit an older canonical graph in place.
Retain the previous successful run and every layout mode. Do not clear layout stores to make new containment look
correct. If identity constraints require changing existing IDs or generic source semantics, stop for revised review.

## Completion criteria

The three delivery stages and their applicable verification pass. F1-F7 have source-backed before/after evidence;
F8 records the post-containment result and requires a fix only if the defect remains. F9 accepts proven context
or the verified unknown/recorded-source fallback; exhaustive macro attribution is not a gate. Real containers
replace the demonstrated flattening; a programmer can identify declaration kind, owner, access and coverage
without opening raw metadata, and deep navigation/search remain usable. No new summary store or hover network
request is introduced. Old correct nesting and references remain correct, pins are preserved, and costs/coverage
are recorded truthfully. No claim of
exhaustive C++ indexing, runtime dispatch or untested ownership contexts. Implementation, privacy review and runtime
acceptance remain outstanding; this investigation is not a feature completion report.

## Review record

### 2026-11-10 - Initial investigation

- **Trigger:** D1; a dense module view obscures encapsulation.
- **Root cause:** Namespace cursors are excluded from owner selection and normalization; lambda names can contain
  compiler-generated source paths. Class ownership is already implemented.
- **Change:** This reviewable plan only. Native diagnostic and private graph audit remain in ignored scratch.
- **Verification:** Synthetic pinned-compiler diagnostic and current normalization succeeded with no compiler errors;
  read-only source comparison confirmed the reported module contains namespace-owned helpers.
- **Authority:** D1 and D2 recorded; A1/A2 await plan review. No implementation approval inferred.

### 2026-11-10 - Programmer walkthrough and broader scope

- **Trigger:** D3.
- **Evidence:** Trusted wheel input reached the selected nested callable path; class/method and data-only type
  inspection, qualified/ambiguous search, pan and zoom reversal were compared with source declarations. F1-F9
  capture the demonstrated gaps. Screenshots and identifying results remain private; layout hashes matched.
- **Change:** Renamed and broadened this single plan, added native metadata/coverage and viewer readability tasks,
  and extended the before/after acceptance matrix. No production code, graph, layout or input source changed.
- **Boundary:** The measured deep journey did not reproduce an inaccessible scope or material interaction stall;
  it is not a matched dense-hover benchmark or proof for every graph branch. Browser-driver setup/timing failures
  were excluded from product findings.
- **Authority:** D3 added; A3/A4 are recommendations for review. Implementation remains unapproved.

### 2026-11-10 - Reviewer contract corrections

- **Evidence:** Current map construction preserves node metadata but groups away per-reference external declaration
  names; the existing paging regression recovers both original declarations. A pinned LLVM 21.1.8 probe verified
  the relevant access/properties and semantic/lexical-parent distinction without compiler errors.
- **Accepted:** F4 uses projected relation counts with exact declarations in paged Details, no hover request or
  second summary store. F9 explicitly accepts unknown provenance without blocking other completion. Existing
  facts are delivered before missing compiler semantics, then residual acceptance, within this same plan.
- **Qualified:** F8 was already conditional in the readability contract and tasks; that condition is preserved and
  made consistent in the findings/completion wording. Macro handling was already best effort in the design body,
  but the previous blanket completion sentence needed the explicit fallback exception.
- **Clarification:** A lexical parent is a syntactic owner, not the header declaration's location. Collecting
  declarations and definitions separately remains necessary. Not every base name is absent from topology:
  retained project node labels are present, whereas exact collapsed external declarations require paging.
- **Change:** Only this transient plan. Reviewer recommendations are technical inputs, not new operator decisions
  or feature implementation approval; D1-D3 and the identity/pin/publication safeguards remain unchanged.
