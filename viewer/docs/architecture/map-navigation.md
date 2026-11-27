# Map and navigation

Graph projection, source organization, camera motion and saved positions in the browser.

## Contents

- [Continuous map](#continuous-map)
- [Visual appearance and motion](#visual-appearance-and-motion)
  - [Connection color and motion](#connection-color-and-motion)
- [Source organization](#source-organization)
- [External boundaries](#external-boundaries)
- [Centered overview and configuration](#centered-overview-and-configuration)
- [Viewport and memory lifetime](#viewport-and-memory-lifetime)
- [Saved arrangements](#saved-arrangements)

## Continuous map

Containment and references follow the [graph contract](../../../laniakea/docs/architecture/graph-model.md). A group contains descendants without acquiring
their declared dependencies. Opening it changes the visible projection without changing canonical facts or surrounding
positions. Startup loads compact topology; inspection requests exact canonical reference pages from the read index.

Semantic detail maps an endpoint to its first collapsed ancestor, or to itself when all its ancestors are expanded.
When a profile supplies source-organization hints, the disposable map index records authored file membership and
reference call-site/target-declaration files. A coarse file frontier uses that recorded provenance; a collapsed namespace
does not replace the physical file. A visible semantic type or callable retains its own endpoint, as does an exact
reference to a namespace itself. Build declarations keep their structural endpoints. Each reference still
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
When a namespace spans files, the module's catalog and namespace-local file contexts describe the same recorded files.
Wires follow the file context that is currently visible. A redundant catalog entry disappears only when all its
recorded members are covered by visible contexts and no wire or explicit inspection still needs it. Contextual file
inspection counts and pages only the references belonging to that context; the catalog retains whole-file provenance.
Wheel zoom, double-click and the file's inspection control enter a unique recorded file context before following
individual definitions. Without such a context, navigation follows a single recorded definition, or its common type
when all definitions belong to that type. Ambiguous multi-context or multi-owner files retain named navigation links;
no namespace or owner is chosen from its name or inferred from callers. These routes preserve canonical symbols and pins.

A reference directly owned by an expanded container meets its named top boundary, rather than an unmarked point
inside its background. Descendant references meet their own visible representatives. The boundary endpoint and pointer
geometry use the same rendered path; expansion neither duplicates references nor assigns container dependencies to a child.
A projected reference retains reference groups whose complete original ids remain accessible through paging. Projected references of different
families or directions remain separate. A reference with both endpoints hidden within one group contributes to
that group's internal-reference count and remains available in its exact-reference list. Explicit self-references
and references to ancestors remain represented. With no filters, every recorded reference belongs to exactly one
visible connection, internal-reference count, or explicit count beyond the viewport. Filters have their own count.
Parallel exact references also share one connection, with every original call site retained in its reference list.

[Owner-local references](../../../laniakea/docs/architecture/graph-model.md#owner-local-references) contribute to internal counts when both displayed
endpoints represent that owner. A file frontier can expose their recorded cross-file relationship.
Authored recursion remains an explicit loop at function detail.

## Visual appearance and motion

`app.css` owns the light/dark theme tokens, layered map atmosphere and HTML surface styling. `appearance.js` assigns
ownership colors and owns the static Cytoscape stylesheet. The direct architectural children of the canonical project
root take colors in branch ID order. Every descendant inherits its top-level owner's color. Derived source folders and
files follow their recorded owner. The project root and external dependencies have dedicated colors.
Both themes use the same ordered assignments. Colors cycle when the palette is exhausted. Changing the set of
top-level branches can shift assignments. Shape, glyph and caption identify the entity and its available actions.

Folded nodes use a native radial core and cached local SVG light falloff. `icons.js` orders the halo, glyph and Review
badge in the node's image stack. The halo extends beyond the marker in drawing bounds. The node body, caption and
existing pointer geometry own interaction. Expanded constellations use a tinted surface and rounded double contour.
The most recently exited group gets a wider halo when drawn as a folded marker. The cue lives in the current tab and
updates on departure from a different group. Folded group bodies stay compact at any camera zoom.
Review, selection and directional tracing keep their own colors and emphasis. Theme changes repaint the existing
renderer, with positions and graph identities preserved.

Wheel bursts accumulate normalized deltas into one logarithmic world-zoom target in `scene.js`. The current
displayed camera approaches that target with elapsed-time easing and a limit on the zoom change per paint.
Each step applies zoom and pan together through
`setWorldViewport()`, using the newest pointer position as its anchor. A semantic reveal or fold updates the projection
at the same camera, then briefly fades in newly visible nodes. Small geometry corrections keep folded markers
close to their intended pixel sizes between renderer scale changes. Label alignment, collision work and live
adoption settle after movement.
Reduced motion applies the requested scale and any immediate scope change directly.

A navigation-only file entry stages a bounded source and destination projection and eases the camera into the
recorded destination. The handoff aligns the source and destination footprints under the pointer. The displayed
portion of the scale adjustment carries into the outstanding wheel target. Reversing or interrupting a pending
handoff drops its staging expansion and retains the displayed camera. Arrival commits the destination scope,
ordinary projection and settled history. Explicit navigation, keyboard zoom, drag and renderer replacement release
pending wheel frames before taking ownership of the camera.

Camera-bearing explicit navigation (search results, reference Follow, Fit overview and presentation-group breadcrumbs) uses
one cancellable camera flight in `scene.js`. Ordinary scope breadcrumbs continue to open their scope directly. The
flight owns `state.flight` for its entire lifetime, including gaps between animation frames, so `live.js` cannot adopt
a snapshot mid-flight. Frames check the originating renderer and generation; camera updates go through
`setWorldViewport()`, never `cy.animate()`. The flight interpolates the world-space centre and logarithmic zoom, then
derives the renderer pan from that camera; it does not interpolate pan linearly. Before the flight, the current and
destination viewports are projected together, so the centre path stays inside the bounded pre-projection. The flight
start owns that render; `flyToNode()` does not first render the same destination through the ordinary projection. That
staging projection is limited to the visible start scene and the destination path; it does not pull every sibling
source region inside the world-space rectangle into the renderer. The destination projection is committed on arrival. Wheel, drag, map-camera keyboard input, new navigation and renderer
replacement cancel the flight before proceeding; passive pointer movement does not. Clear selection, Escape-driven
inspection clearing, graph arrow selection and Review-list selection also cancel a flight so the newer inspection
intent wins. Cancellation settles the pre-projection against the actual interrupted camera through `refreshMap()`;
Clear and Escape refresh again after clearing inspection so the ordinary, selection-free viewport is retained.
Renderer replacement and flight completion deliberately skip that cancellation refresh. A frame or scheduling failure
releases the flight, restores framing and surfaces the error; stale cleanup cannot release a newer flight. A completed
flight commits the exact destination and history once. An interrupted flight leaves the user's new camera action in
place and never snaps back. Selection survives intermediate projection refreshes and is revalidated against the final
projection; inspection that depends on the destination is applied when the flight reaches it. A graph resize shifts an
active flight's start and target pan with the same centre delta used by `resizeMap()`. Reduced motion uses the existing
immediate path. The existing hover and selection state
owners in [Tracing and inspection](inspection-review.md#tracing-and-inspection) remain unchanged.

### Connection color and motion

Direction arrows and bundle counts appear on tracing or inspection. Idle wires use the displayed endpoints' family
colors and fade toward a muted midpoint. Coincident straight summary strokes share an opacity budget, including during
tracing. Focused and selected wires strengthen their endpoint colors. Arrowheads and the readout carry direction.
Focused wires breathe subtly. A soft light glides along each eligible direction and repeats on the same cadence as the
Review star glow. Pulses backed by cycle evidence use the Review severity color and a stronger glow.
Reciprocal wires show both recorded directions together. Each direction uses its source family's color unless the
displayed references carry active cycle evidence.

Node and overlap focus share the decoration on coincident summaries and soften the glow as path density grows.
CSS drives the effect along the geometry used by wire hit testing.

## Source organization

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
reference identities remain available in hover and inspection; the shortened caption is presentation only and takes
priority over the full filename on the canvas.
Wheel input over a file glyph, name or revealed code group uses the [continuous camera](#visual-appearance-and-motion).
The next layer opens when there is enough screen space. Outward movement uses a separate closing threshold.
Each semantic step changes one layer. Double-click and explicit Open controls fit the destination.
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
Visible file markers with overlapping glyphs expose a count beside Arrange files and emphasize that action. Detection
reuses the caption obstacle index and checks the active source owner, including namespace-local file contexts; it never
moves pins. This gives older saved arrangements the same scoped repair as a manually crowded layout, without silently
replacing unrelated positions.

## External boundaries

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

## Centered overview and configuration

The optional galaxy layout places a profile-declared external boundary at the center of the initial unpinned arrangement.
Other project children retain their real ownership; position and distance do not imply containment or dependency strength.
The center is initially collapsed and reveals only recorded children through ordinary navigation. Existing modes and
their pins are independent. Saved galaxy pins override initial placement, including a manually moved center.

An optional manifest overview hint names the anchor and project-configuration reference types. Configuration applies
only to original references from the analyzed root, not every reference of those types. The profile supplies meaning;
the viewer recognizes no language-specific ids, paths or levels. Invalid hints are refused before publishing a run or
replacing a scene; absent hints keep the run usable and the galaxy option visibly falls back to orbits.

By connection uses a bounded CoSE pass on the folded overview. It seeds distinct starting positions, uses one spring per
connected star pair and maps the result to world-space bounds appropriate for the overview. Larger or unconnected maps
use Orbit with a visible explanation. The layout input affects positions only. Saved positions still take precedence.

Classified project configuration stays outside the architecture projection in every layout, including layout input and
Fit. Canonical declarations remain unchanged, counted once and available for exact inspection. The map summary names
configuration separately from other filtered references. Non-root dependencies of the same type remain ordinary wires;
unclassified root references keep their known meaning.

The project-listed target checkbox adds optional neutral outer outlines to existing visible representatives. Marks start off in every layout;
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

## Viewport and memory lifetime

A packed [Flatbush](https://github.com/mourner/flatbush) spatial index selects the viewport and a surrounding buffer. Distant open branches fold for rendering
without erasing requested expansion or world positions. Incident reference indexes retain local connections and remote
context; distant detail leaves Cytoscape rather than accumulating across flights. Enlarging an ancestor's background
does not pull all its references into a deep view. Exact-reference navigation keeps its endpoints represented.
Remote context endpoints do not recursively load their unrelated neighbours; approaching them reveals their own references.
During wheel motion the camera can use the existing buffer up to its edge. Outward recuts use a larger bounded
buffer to cover the growing viewport. Once the wheel settles, the ordinary viewport checks resume. A camera-only
recut reuses the current projection when the expanded groups, visible seeds, reference seeds, forced endpoints
and filters are identical. When they change, reference grouping reuses endpoint and bundle lookups within that projection.
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
Native drawing bounds also enclose title images above an expanded container so renderer textures cannot clip the glyph or warning.
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
Native viewport textures and straight summary lines reduce gesture rendering work. Label collision work
settles after input pauses; wheel events and viewport
updates coalesce by animation frame. Renderer rescaling keeps deep zoom numerically useful. A change of renderer units
updates positions, background dimensions and pixel-sized styles, including configuration outlines, in one batch before
painting, even during a gesture; collision work remains deferred. History and pins stay in world coordinates.
Self-reference loops scale with their star or container so zooming out does not hide them inside its shape.
Exact-reference inspection replaces at most 50 rows per page, with Previous/Next and explicit retry on failure. Its LRU
retains at most 64 pages and 8 MiB of serialized page/key data; parsed-object overhead is additional. Changing inspection
cancels outstanding requests, and late responses cannot overwrite a newer selection. HTTP caching remains disabled.
Page controls remain available while scrolling and retain keyboard focus. Explicit page changes start at the new rows;
initial background loads do not move the reader. Inspecting another item resets the detail panel's scroll.

Viewport buffering and bounded retention follow [tile-cache practice](https://deck.gl/docs/api-reference/geo-layers/tile-layer).
The canvas adapter uses [Cytoscape's native interaction optimizations](https://js.cytoscape.org/#performance) and the display's
native pixel ratio; gesture performance does not depend on reducing display resolution. Explicit flights are bounded by
the visible start scene plus the destination path; the flight performance probe records call/pre-projection time, first visible frame, total completion, cut bounds and zoom,
peak rendered elements, final retention, long tasks and pin stability.

## Saved arrangements

Dragged positions use stable node ids, scoped by project and layout mode, in the entry layout. Both a star and
its visible label accept dragging; hidden labels cannot intercept pointer input. A constellation drag translates
its complete subtree and saves the moved pins on release. Large patches use bounded sequential UTF-8 requests with
consumed responses and small acknowledgements, avoiding the browser's keepalive quota. Renderer positions are copies, so a live drag
cannot mutate the saved arrangement before release. Request threads serialize merge and atomic JSON replacement.
There is no polling or write per drag frame or wheel gesture. Fit, filtering, expansion and viewport resizing
preserve positions. Missing nodes are ignored after regeneration; new nodes use automatic positions. Opening the
map reads the workspace with HTTP caching disabled after outstanding saves finish. A failed save stays visible and
pending/failed saves trigger the browser's leave-page guard. Saved positions do not change graph facts, extraction
inputs, runs, or the analysed project.

Fit overview restores root navigation and uses canonical top-level world positions, so it also recovers the overview from an
empty viewport. Reset saved positions is available for the current layout when it has saved positions and requires confirmation.
Layout updates retain pins absent from the current run, so module-only extraction does not erase native-symbol positions.
Reset clears the selected mode's pins belonging to the current graph; temporarily unavailable pins remain stored.
