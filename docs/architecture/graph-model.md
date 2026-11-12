# Graph model

What graph schema v1 means. The shapes of graph, shard and manifest are owned by
[schema/graph.v1.schema.json](../../schema/graph.v1.schema.json); this page owns their meaning.

## Contents

- [Levels](#levels)
- [Nodes](#nodes)
- [Edges and statuses](#edges-and-statuses)
- [Coverage](#coverage)
- [Continuous map](#continuous-map)
- [Centered overview and configuration](#centered-overview-and-configuration)
- [Viewport and memory lifetime](#viewport-and-memory-lifetime)
- [Scope addresses and generated shards](#scope-addresses-and-generated-shards)
- [Runs and freshness](#runs-and-freshness)

## Levels

A profile declares its levels in the manifest, and the viewer hardcodes none. The Unreal profile has `project`,
`folder`, `plugin`, `module`, and optionally `namespace`, `class` and `function`: the folders between `Plugins/` and a plugin, such as a project's plugin categories,
group its plugins. A Rust profile could have workspace, crate, module, type and function; a Python profile could have
project, package, module, class and function.

A scope is one owner's direct children, not a requirement that every child has the same kind. A project can own
both a source module and folders of plugins. The viewer names each kind and distinguishes collapsed containers
from leaves; it does not invent an extra owner to make them look uniform.

## Nodes

- Containment is the node's `parent`. There is no separate containment edge.
- A graph has exactly one non-boundary root, the analysed project, plus boundary roots such as the engine.
- `boundary` marks a node outside the analysed project. It appears only because a project node touches it, and it
  has no edges of its own.
- `status`:
  - `in-target`: present in the analysed target;
  - `not-in-target`: declared on disk but absent from the target;
  - `not-analysed`: the analysis cannot tell, for example a plugin with no modules.
- `source` is a root name plus a path relative to it; the absolute root lives only in the workspace. Files are
  attributes of canonical declarations, not canonical ownership nodes. The viewer can derive source-file regions.

## Edges and statuses

- `declared`: stated by a build tool or a descriptor; in the Unreal profile,
  `requires` and the `depends.*` types.
- `derived`: a summary a scope makes from recorded references (see Scopes). Summaries of different families are never
  merged: when `requires.rollup` and `depends.rollup` disagree, both are shown, because the disagreement is the
  finding.
- `resolved` and `partial` describe symbol-level facts from a compiler-based index. Canonical graphs retain exact compiler
  references as well as build edges. Nothing is labelled
  `verified`: a static relationship is not a runtime call.

Each edge names, in `origin`, the manifest source that produced it, and the manifest records that source's version,
the target and the configuration. Edge type ids and labels come from the manifest's `edge_types`.

An exact reference can retain its original target declaration identity and location even when the displayed target
is an abstracted module or provider. The schema owns that metadata's shape. Referring-source coordinates and target
declaration coordinates describe different locations. Distinct declarations behind one visible connection stay
distinguishable in canonical data and exact pages; repeated observations of the same relationship remain deduplicated.

## Coverage

The manifest lists what was analysed, what was not (other targets, deeper hops, levels not built), and node and edge
counts. The viewer shows the list beside every view, so missing analysis never reads as absence.
Zooming into an outside-target or unanalysed scope leaves a named coverage hint in the docked readout.
Node hover and inspection also explain that only recorded structure is available. These statuses do not prove that
configuration disabled the node; the viewer does not infer that cause from target absence.

## Continuous map

The canonical `graph.json` remains the exhaustive extraction authority. The server builds a disposable map read index
from that immutable file; the viewer starts with compact topology and weighted endpoint/type groups, then requests
exact canonical reference pages for inspection. Containment and directed references are
independent: a group contains descendants but does not acquire their declared dependencies. Opening a group changes
only the visible projection, not graph facts or the surrounding arrangement.

Semantic detail maps an endpoint to its first collapsed ancestor, or to itself when all its ancestors are expanded.
When a profile supplies source-organization hints, the disposable map index records authored file membership and
reference call-site/target-declaration files. A coarse file frontier uses that recorded provenance; a visible semantic
type or callable retains its own endpoint. Build declarations keep their structural endpoints. Each reference still
belongs to one projected connection/internal/beyond/filtered count, including when one method has call sites in several files.
File reference totals describe recorded file provenance, while type/callable totals describe semantic containment.
Missing file provenance falls back to the recorded semantic representative, without guessing an include dependency.

Semantic scopes spanning files remain intact; only uniformly observed files wrap an entire scope.
Public headers form preferred file entry points. Implementation regions are organizational backgrounds, always open
inside an open enclosing scope, and never wire endpoints. Concrete private headers, implementation files and actual
source folders remain individually explorable. Source visibility and C++ access remain separate; restricted members
have a subdued glyph and their recorded access in inspection. Enums, individual fields and statements retain the
profile's explicit coverage limits.

Declaration and implementation files provide alternative navigation routes to one symbol. File inspection lists
bounded batches of recorded declarations/definitions and focuses the existing symbol in its semantic owner. It never
creates a second method or moves a shared helper under a public header. File boxes are presentation representatives,
not canonical C++ owners; their synthetic IDs never enter the pin store. Older maps without file provenance keep
their recorded semantic grouping and expose coverage through existing inspection.
Navigation-only files without contained symbols have no independent drag position; their definition links reach
the existing, arrangeable symbols. Files containing real symbols retain subtree dragging through those canonical pins.
Wheel zoom on a navigation-only file follows a single recorded definition, or its common type when all definitions
belong to that type. Ambiguous multi-owner files retain their named definition links; no owner is inferred from callers.

A reference directly owned by an expanded container meets its named top boundary, rather than an unmarked point
inside its background. Descendant references meet their own visible representatives. The boundary endpoint and pointer
geometry use the same rendered path; expansion neither duplicates references nor assigns container dependencies to a child.
A projected reference retains reference groups whose complete original ids remain accessible through paging. Projected references of different
families or directions remain separate. A reference with both endpoints hidden within one group contributes to
that group's internal-reference count and remains available in its exact-reference list. Explicit self-references
and references to ancestors remain represented. With no filters, every recorded reference belongs to exactly one
visible connection, internal-reference count, or explicit count beyond the viewport. Filters have their own count.
Parallel exact references also share one connection, with every original call site retained in its reference list.

A profile can classify an owner-local reference as internal to its normalized owner, including references whose endpoints
collapse through abstraction. When both displayed endpoints represent that owner, these references contribute to
internal counts even when the owner is expanded. A file frontier can expose their recorded cross-file relationship;
it does not assert a class self-dependency. Exact reference pages retain status, location and classification. Authored
recursion remains an explicit loop at function detail. Compact groups keep internal and explicit references separate. The schema validates
the classification, including its identical-endpoint constraint. Unmarked older runs retain their original meaning;
the viewer never guesses from names, levels, implicit-reference flags or generated-code spellings.

Wheel zoom reveals a pointed group when its local contents have room on screen; zooming out folds groups at a
separate threshold to avoid flicker. Other constellations retain their positions. Hover temporarily emphasizes
connections to a star or a group's descendants. Inspecting a connection lists both directions between its displayed endpoints; following
one reveals its endpoints without closing other groups. The destination's direct references remain available,
with remote endpoints grouped until the operator approaches them.
Bundle counts appear in the trace readout or inspection; the overview keeps the connection lines without a label on every bundle.
Idle bundle names and colors use manifest metadata. A summary without its own manifest type inherits the exact type's color;
mixed types use a neutral color and name each recorded type rather than implying one kind of reference.

Tracing uses theme roles defined in CSS: cyan outgoing, amber incoming and violet within/self. The visible legend,
direction words and native arrowheads provide alternatives to color. Node colors keep their existing meaning.
A node trace names its focus and partitions represented references by canonical endpoints in its containment subtree:
source inside/target outside is outgoing, the reverse is incoming, and both inside is within. These counts are disjoint
and retain compact group weights. They describe the architecture projection after configuration exclusion, type,
boundary and viewport filtering, labelled "In this view". Node inspection separately labels its all-recorded reference scope.

Connection inspection combines all shown families and both directions for the same unordered endpoint pair. A deterministic
ID order fixes its A/B identities, with full ownership paths and levels. Both directional totals and a bounded
type breakdown remain stable across native family/direction hits. A one-way pair explicitly reports zero in reverse;
a real self-loop reports within/self. Coincident reciprocal paths have a neutral stroke and direction-colored arrows.
Tracing styles existing edges only: no extra lanes, geometry changes, graph facts, hover requests or saved positions.
Wire hover titles the endpoint nearest the pointer among the hovered pairs and marks it with a neutral halo. Incoming
and outgoing colors and counts are relative to that title. A screen-space dead band holds the current viewpoint around
midpoints; a clearly closer endpoint changes it. The compact card lists peer names and counts in two columns, scoped to
hovered connections rather than whole-node usage. Within/self remains separate. Type breakdowns stay in Details.
When different endpoint pairs overlap, hit testing retains all pairs under a fixed screen-space tolerance. The card
counts only unique represented references incident to its titled endpoint, and discloses unrelated pairs separately.
A visual crossing never creates a dependency junction. Peer captions are bounded, with explicit disclosure when either
column truncates; the readout and Details retain full names. Clicking opens the candidate list in Details; focus or hover
emphasizes one pair, and choosing it reuses both-direction exact inspection. Longer candidate lists render in batches. Projection changes
that alter the represented references close stale inspection.

Hit testing uses the rendered paths, including curves, and an ephemeral spatial index of the current rendered edges.
It is independent of canonical reference indexing and saved positions. Pointer work is coalesced per animation frame;
unchanged candidate sets reuse their trace. Projection/camera changes invalidate geometry, and gestures clear it.
The hover card stays anchored while the candidate set and viewpoint remain unchanged. No automatic arrangement occurs on hover.
During pair tracing, endpoint captions yield native pointer hits to connections so newly revealed text cannot steal
the click; endpoint glyphs remain interactive. Leaving the trace restores normal caption interaction.
Clicks inspect the same geometric candidates as hover, using a native edge only when no geometric hit is available.
Single and double taps on expanded backgrounds give wires priority; constellation labels and empty backgrounds retain
their group actions. A double tap on a wire does not fold the surrounding constellation.
The docked, keyboard-focusable readout retains the last summary after pointer exit while emphasis clears. Escape,
clear, gestures and projection changes reset it. Its reserved height does not change when trace text changes.
Canvas titles show names only. A nearby hover card provides kind, containment, coverage and direction counts without
adding lines to those titles. Node cards distinguish outgoing, incoming and within/self references recorded in the snapshot
from the current projection. Each affected total exposes its numerical "Of which: project configuration" subset,
included in that total rather than added to it. These weighted subtree totals and subsets do not change with map filters
or configuration marks. The project root's totals are labelled project/subtree statistics. A filtered-out incoming
reference is not reported as no recorded users. A zero
incoming total says "No incoming references recorded in this snapshot", never that runtime use is impossible.
Cards yield native pointer hits to the graph. They disappear on exit, Escape, gestures or projection changes.
The persistent readout retains readable counts and full names; inspection supplies exact rows.
Following an exact architecture reference enables its type and boundary visibility if a current filter would hide it.
Following an internal reference opens its owner and reference list rather than inventing a visible self-loop.
Optional click inspection keeps its marker through projection refreshes while that exact item remains visible.
Pair details retain represented groups with explicitly named A/B directions; hover can orient counts to either endpoint.
Both totals and shortcuts precede separate
exact-reference pages per direction, so reaching the reverse list does not require scrolling through the forward list.
Changing that group set or its weights closes the pair inspection; it never falls back to a single hit family.
Exact-reference navigation retains its original identity. Hiding an inspected item closes its details instead
of highlighting a different ancestor. Hover and wheel exploration do not require an inspected item.
Node inspection keeps identity, source and analysis state visible; secondary metadata has a separate disclosure so
references and navigation remain reachable. Constellation controls track expansion without resetting the reference reader.

Profiles may annotate source partitions and owners that expose source sections. The viewer folds marked implementation
branches into derived source regions, with their recorded subfolders inside. Public or unclassified branches stay
visible. Shared semantic scopes retain their identity; their private branches can fold without assigning the scope to
one public type. Regions use rounded boxes and inspection identifies them as source organization; dashed status
continues to mean outside the analysed target.

A recorded header location adds a file constellation between an existing owner and its declarations. Several types
in one header fold together; class members remain inside their class, including definitions located in implementation
files. Header links open the recorded file. Include and forward-reference relationships do not acquire ownership.
File regions use owner-scoped root/path identities, so equal basenames remain distinct and a header shared by semantic
owners can appear in each relevant scope without duplicating any symbol. A uniformly attributed scope can fold with
its common header; its contents do not repeat that file wrapper. A namespace spanning headers keeps its identity and
exposes header regions within its scope. Missing file annotations preserve the existing source-region presentation.
`sections.js` derives the display tree without mutating canonical nodes, parents or edges. Canonical ownership remains
the source of declaration context; the augmented paths add only display regions. Reference projection and incident
indexes include these regions, while exact paging queries existing canonical reference groups. No duplicate symbol
or additional authoritative graph is published. Bookmarks keep canonical scope addresses; browser scene state retains
region expansion and navigation. Older runs without the optional annotations retain their original presentation.

File catalogs expose named, always-open interface and implementation sections from their recorded partitions. Automatic
placement gives each section a separate band and packs its files across the available width. The section is organization,
not a dependency endpoint; references still resolve to concrete files or revealed C++ entities. Recorded partition labels
remain authoritative: a source region is not proof that a declaration is an abstract interface.
Sibling file captions may omit a long common identifier prefix at a word boundary. Full filenames, source paths and
reference identities remain available in hover and inspection; the shortened caption is presentation only.
Zooming in over a visible file glyph or its name enters its next recorded layer directly. Revealed code groups within
the active detail scope follow the same rule, without the world-radius threshold used for broader constellations.
Empty files with no unambiguous navigation target do not
invent internals. Mixed-file namespaces retain their canonical scope and their namespace type icon beside file boxes.
Implementation styling also follows a semantic entity's recorded source partition; its shape still identifies code,
independently of the source-file box and of C++ member access.
The active expanded navigation scope remains admitted while its camera fits spread-out saved children. Viewport detail
must not immediately fold the scope the operator just entered because its original automatic radius is smaller.

Regions have no saved IDs. Dragging one persists only its real descendant pins. Its center is derived from those pins
when every direct branch has a saved anchor; partial pins never reposition automatic neighbours. Existing canonical
pins remain authoritative in every layout mode. Source grouping neither edits nor migrates the layout store.
The scoped Arrange files action explicitly confirms replacing the current source owner's contained positions. It leaves
the owner anchor, other scopes, other layout modes and unavailable pins unchanged, and saves only canonical descendants.
Cancel leaves both the displayed arrangement and saved positions unchanged. Save failures use the existing unsaved-position
status and retry behavior.

Recorded declaration kind, qualified owner, signature and source context appear in hover and primary inspection;
access/properties and observed-member coverage appear when supplied by the profile. Names remain the canvas captions.
An owner with no indexed children is not necessarily an empty source declaration. Missing context is left unknown;
the Unreal profile owns [compiler metadata and its limits](unreal-profile.md#native-symbol-analysis).
Inheritance/override hover counts come from the current projected reference groups, respect filters and direction,
and count references rather than distinct base types. Exact declaration names remain in existing reference pages;
hover neither fetches those pages nor creates a second relationship-summary store.

Global search matches recorded labels, qualified names, signatures and source-file paths. It presents at most eight ranked choices with
owner/signature/source context and discloses additional matches so a short ambiguous name does not silently choose an
unqualified result. Arrow keys choose a result and Enter inspects it. Search uses the existing in-memory nodes.
Deep scope breadcrumbs keep the immediate parent/current scope visible and place earlier ancestors in a bounded
disclosure with ordinary navigation links. Long names truncate in the header while full names remain available there
and through hover/inspection. Neither search nor breadcrumb navigation changes canonical ownership or saved positions.

External-provider hover includes recorded ownership/coverage and a bounded breakdown of the currently shown reference
types. Inspection lists the original consumers and labels target declarations separately from their referring locations.
Source links resolve through the run's advertised roots; unavailable roots are displayed without a link. A run without
declaration provenance explains that it was not recorded. The viewer does not infer provider ownership from names.
Providers use ordinary containment and boundary styling: one provider can have several consumers without becoming
their child. Only referenced structure is revealed; external implementation analysis is not implied.
Boundary containers at the project level are described as external dependency groups in the UI; this presentation
does not change their canonical level or turn them into analysed projects.

Known boundary children can be revealed from recorded containment, including external endpoints of exact
references. This does not fetch or imply analysis of their own dependencies. Missing coverage remains unknown.
The project root appears as a separate star only for a non-configuration reference endpoint or owner-local fact,
or when it has no children. It is not added as a hub for its descendants' references.

### Centered overview and configuration

The optional galaxy layout places a profile-declared external boundary at the center of the initial unpinned arrangement.
Other project children retain their real ownership; position and distance do not imply containment or dependency strength.
The center is initially collapsed and reveals only recorded children through ordinary navigation. Existing modes and
their pins are independent. Saved galaxy pins override initial placement, including a manually moved center.

An optional manifest overview hint names the anchor and project-configuration reference types. Configuration applies
only to original references from the analyzed root, not every reference of those types. The profile supplies meaning;
the viewer recognizes no language-specific ids, paths or levels. Invalid hints are refused before publishing a run or
replacing a scene; absent hints keep the run usable and the galaxy option visibly falls back to orbits.

Classified project configuration stays outside the architecture projection in every layout, including layout input and
Fit. Canonical declarations remain unchanged, counted once and available for exact inspection. The map summary names
configuration separately from other filtered references. Non-root dependencies of the same type remain ordinary wires;
unclassified root references keep their known meaning.

Config marks adds optional neutral outer outlines to existing visible representatives. Marks start off in every layout;
explicit choices remain per mode in scene/history state, never in position files. Restored choices affect marks only.
An outline means that representative contains explicitly listed configuration targets. Hover distinguishes an exact
listed target from a collapsed owner's distinct listed-target count. Marks follow effective projection expansion,
including external boundaries; they do not propagate to unlisted children or load distant targets. Type filters do not
toggle marks, while boundary visibility and viewport membership determine which representatives can be marked.
Outlines preserve availability borders, selection and direction colors, and add no renderer elements or hit targets.
Toggling marks neither relayouts the map nor changes architecture edges, counts or pins.

Listed-target counts deduplicate original target ids; declaration counts retain reference weights. Several declarations
of one target therefore count as several configuration references but one listed target. The numerical directional
configuration subset uses the same original endpoints and containment scope as its all-recorded total. Configuration
means explicitly listed, not necessarily compiled or used at runtime. An unmarked node is not evidence of disablement
or lack of use.

The Project action beside the target selector explicitly opens source, analysed target, recorded metadata and paged
configuration declarations in the existing Details panel. Whole-project statistics have a separate disclosure. Inspection
works at any map scope without a project marker or a navigation/camera change. A star click replaces it; Escape,
Clear selection, empty space and the Details close control close it. Null selection never opens Project details.
Valid explicit context survives projection refresh; closing or replacing it cancels pages and prevents late responses
or delayed click handlers from reopening inspection.

Following a configuration declaration reveals its actual target and retains the exact record and provenance in Details,
without a root wire, new owner or dependency-type filter change. Configuration rows identify their context-only scope;
their source endpoint opens project context through existing navigation. Root search and scope bookmarks remain useful
without making configuration wires visible.
Faint dependency bundles remain visible; hover emphasizes them without requiring selection. Group details identify
references of descendants and exact rows name their original ownership paths.

### Viewport and memory lifetime

A packed [Flatbush](https://github.com/mourner/flatbush) spatial index selects the viewport and a surrounding buffer. Distant open branches fold for rendering
without erasing requested expansion or world positions. Incident reference indexes retain local connections and remote
context; distant detail leaves Cytoscape rather than accumulating across flights. Enlarging an ancestor's background
does not pull all its references into a deep view. Exact-reference navigation keeps its endpoints represented.
Remote context endpoints do not recursively load their unrelated neighbours; approaching them reveals their own references.
Spatial and visual container bounds include all descendants, including manually moved pins outside the automatic layout.
An unrelated visible star inside an expanded enclosure gains an explicit owner caption and a neutral context outline.
This identifies an overlap in the saved arrangement without changing containment or silently moving a user's pins.
Wide-scope framing reserves room for names; bounded middle ellipses retain distinguishing
suffixes when full captions collide. Deep camera reach derives from recorded group sizes rather than a fixed historical
zoom ceiling. These are derived geometry and camera decisions, not graph facts or layout-store migrations.

Containment remains in Universe. Expanded backgrounds are independent renderer shapes, avoiding native compound-node
style propagation and preserving their world geometry when children leave the viewport. Dragging a background pans;
dragging its visible label moves the constellation. Ordinary stars and their visible labels remain draggable.
Node icons identify recorded kinds independently of grouping, access, external status and reference direction. Component
blocks identify modules; puzzle pieces identify plugins; scope brackets with colons identify namespaces; C/S/U identify
classes, structs and unions; callable, lambda and field glyphs distinguish code details. Files use document glyphs,
folders use folder glyphs, and source sections use stacked layers. Unrecognized kinds retain a generic entity icon.
These are Laniakea's programming conventions, not a claim of UML conformance. The keyboard-accessible Type icons key
provides the complete vocabulary. Names, kinds and coverage remain available through inspection and the accessible list.

Local vector backgrounds decorate existing native nodes without additional elements, external assets or pointer targets.
At readable detail they sit inside markers; expanded containers retain the same icon beside the title. Distant overview
markers omit unreadable icons. Title collision bounds reserve icon space while text hit boxes retain native text bounds.
Icon geometry changes in the same renderer-unit batch as fonts and markers. A bounded kind/color image cache and weak
native-node geometry caches release presentation data without retaining a previous graph or changing saved pins.
Backgrounds occupy the native bottom layer so they cannot intercept stars during hover transitions. Canvas labels reserve
space for names; secondary metadata belongs to hover and inspection. A bounded name/ellipsis fallback precedes hiding a label;
the full name remains available through hover, search, inspection and the accessible list. Actual renderer metrics
govern collision and hit boxes; traced or inspected names take priority. Glyph obstacles share one spatial index per
settled scene. Batched caption updates reuse up to four measured variants per native node; font and glyph geometry
invalidate measurements, while camera motion translates them. Weak node keys release them with renderer elements.
A previous hover target cannot clear a newer trace.
Constellation dragging uses Cytoscape's native selected-node drag layer. Moving wires settle on release while the selected
connection remains visible; reference facts and counts are retained throughout the gesture.
Native viewport textures and straight summary lines reduce gesture rendering work. Direction arrows and bundle counts
appear on tracing or inspection. Label collision work settles after input pauses; wheel events and viewport
updates coalesce by animation frame. Renderer rescaling keeps deep zoom numerically useful. A change of renderer units
updates positions, background dimensions and pixel-sized styles, including configuration outlines, in one batch before
painting, even during a gesture; collision work remains deferred. History and pins stay in world coordinates.
Self-reference loops scale with their star or container so zooming out does not hide them inside its shape.
Fit map restores root navigation and uses canonical top-level world positions, so it also recovers the overview from an
empty viewport. Reset layout requires confirmation before discarding the current mode's saved positions.
Layout updates retain pins absent from the current run, so module-only extraction does not erase native-symbol positions.
Reset clears the selected mode's pins belonging to the current graph; temporarily unavailable pins remain stored.

Exact-reference inspection replaces at most 50 rows per page, with Previous/Next and explicit retry on failure. Its LRU
retains at most 64 pages and 8 MiB of serialized page/key data; parsed-object overhead is additional. Changing inspection
cancels outstanding requests, and late responses cannot overwrite a newer selection. HTTP caching remains disabled.
Page controls remain available while scrolling and retain keyboard focus. Explicit page changes start at the new rows;
initial background loads do not move the reader. Inspecting another item resets the detail panel's scroll.

Viewport buffering and bounded retention follow [tile-cache practice](https://deck.gl/docs/api-reference/geo-layers/tile-layer).
The canvas adapter uses [Cytoscape's native interaction optimizations](https://js.cytoscape.org/#performance) and the display's
native pixel ratio; gesture performance does not depend on reducing display resolution.

The server's SQLite read index uses only Python's standard library and is regenerated from graph content and generator
identity. A validated staging directory is promoted before serving; corruption fails visibly without changing the run.
Canonical runs, the read index and user positions have separate lifetimes. Cache files under `targets/<id>/views/` are
disposable; positions under `layouts/` are user-owned and must not be evicted with presentation data.

## Scope addresses and generated shards

Each non-boundary node has one shard file, built by `laniakea/shards.py`, including an entry for a project without
children. File names escape UTF-8 bytes and protect the reserved entry and index names.

- **Container scope** (a node with children) shows the children. Everything outside it appears as the siblings of the
  scope and of its ancestors:
  - an endpoint inside a child is drawn as that child;
  - an endpoint elsewhere in the same tree is drawn as the topmost node that holds it without holding the scope;
  - an endpoint in another tree, such as the engine, is drawn as that tree's root.

  An edge whose endpoints were not replaced retains its original status and internal classification; explicit self-edges
  remain available when their owner is a direct member. Abstracted internal edges do not become container-scope loops.
  All other visible edges become one `<family>.rollup` summary
  per pair of drawn nodes, where the family is the edge type before its first dot. A summary records how many edges
  it stands for, their types, and examples of the endpoints behind it.
- **Leaf scope** (a node with no children): the node and all its direct neighbours, exactly.

The project's scope is `entry.json`. Boundary nodes open no scope. `scopes/index.json` lists every openable node with
its file and direct child count. The index maps existing scope addresses to canonical nodes. Opening a scope address reveals that node in the
continuous map; the index supplies address metadata without downloading that shard's reference payload. Shards remain
available to other consumers and do not limit the references available to the viewer.

## Runs and freshness

Each extraction writes `workspace/targets/<id>/runs/<utc>/` with the raw tool output, `graph.json`, `manifest.json`
and `scopes/`, then points `latest.json` at it. The manifest records profile-defined sha256 input fingerprints before
the export runs. At start the server recomputes them, and any difference marks the run stale, naming the changed inputs.
The Unreal profile owns [which file contents and selection metadata participate](unreal-profile.md#build-context).
The warning stays visible as a compact summary; its disclosure retains the reported changed paths, run and recovery action.
