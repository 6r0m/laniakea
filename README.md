# Laniakea

Explore an Unreal Engine C++ project like a star map: its plugin folders, plugins and modules and the dependencies
between them, down to classes and functions with optional native symbol analysis, with jump to source. The graph is generated from the project's own build rules and compiler facts, never drawn by hand, and the project
needs nothing installed or configured.

Needs Windows, Python 3.9 or later, and an installed Unreal Engine 5. Clone the repository, then run:

```text
python laniakea.py up path/to/YourProject.uproject
```

Later, `python laniakea.py up` alone extracts the newest project's module graph; with make installed, `make up` does the same.
Ordinary `up` and `extract` remain module-only even when LLVM is installed. Use `serve` to reopen a published map without extracting again.

The first run exports the target/configuration from the latest usable project build receipt; without one it uses
Editor/Development and reports the missing build context. `--target <name>` fixes the target. Receipts select configuration;
the map describes current build rules, not a historical source snapshot. Extraction prints phase timings in seconds, then opens the viewer
at `http://127.0.0.1:8737/`. Wheel into a constellation to reveal its children in place; wheel out to fold it.
Drag empty space to fly between constellations. Hover a star or connection to trace its references without selecting
it. The docked readout names the focus and shows outgoing, incoming and within counts. Hover a connection for both
directions; click to inspect their exact references. Rings are collapsed groups, dots are individual stars, and diamonds
are external. Connections become counted bundles at a distance and reconnect to their exact endpoints as detail appears.
Internal references remain counted inside collapsed groups. Inspection also links to source; following a reference reveals
its destination while retaining the surrounding map.

Choose **galaxy** in Layout for an Engine-centered overview with project constellations around it. **Configuration**
shows or hides project-root declarations; it starts off in galaxy while plugin dependencies remain visible.
Names take priority over secondary captions. Select the other layout modes to return to existing arrangements.
Runs without presentation hints use orbits until extracted again.

Browse & filters provides a keyboard-accessible node list and typed reference filters. `/` finds any recorded node;
Enter flies to it. Double-click a group, or focus it with arrow keys and press Enter, to expand or collapse it.
`+` and `-` zoom when the map has focus; Ctrl+wheel remains browser zoom. Existing scope bookmarks fly to that part
of the same map. Drag a star or its visible name to arrange it; dragging a constellation moves its contents too.
Positions save once on release, shared across hierarchy addresses within each project and layout mode. Fit map
returns to the overview without moving stars; Reset layout confirms before forgetting the selected mode's saved positions. Opening the bare server address restores
saved positions from the workspace with HTTP caching disabled. Positions survive extraction and server restarts
while node ids remain the same.
The viewport releases distant detail as you fly; returning restores its arrangement. Exact references load in bounded
pages with Previous/Next controls, and the summary distinguishes references beyond the view from filtered or unanalysed data.
Everything Laniakea learns stays in its own ignored
`workspace/` folder. Laniakea writes nothing into the project; Unreal Build Tool may refresh its own build caches there,
as any build does.

For classes, functions, inheritance, overrides and calls, install locally supplied LLVM 21.1.8 tools once:

```text
python laniakea.py setup-symbols --libclang <llvm>/bin/libclang.dll --resources <llvm>/lib/clang/21 --compiler <llvm>/bin/clang-cl.exe
python laniakea.py up --symbols
```

The tools are copied into `workspace/`; extraction and serving do not download anything. `--symbols` requests native analysis
for that extraction only; installation does not enable it implicitly. Symbol analysis uses current
sources in the last usable build's target/configuration. It prepares compiler inputs in an isolated workspace copy and
reports timing and compiler diagnostics. Missing tools, missing successful-build context or a compiler failure retain the
previous published map; omit `--symbols` for module exploration. Engine symbols remain
module/plugin boundaries. Calls are statically resolved; other callable references remain visible as function references.
The optional compiler argument enables preprocessing-validated reuse on subsequent extractions. Cold symbol analysis can
be expensive; `serve` opens a published run without extracting again, checking input freshness at startup.

Checks: `python -m unittest discover -s tests`. Viewer regressions also run with
`node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs` when Node.js 18 or later is available; it is not needed to run Laniakea.
The Playwright function in `tests/viewer.browser.js` checks wheel expansion and folding, hover tracing, exact
reference navigation, centered layout/configuration, constellation and label dragging, saved positions in a fresh browser, and a narrow viewport
against a served synthetic sample.
`tests/traces.browser.js` checks trusted pointer movement on reciprocal, mixed-type, crossing, one-way and recursive
connections, both-direction inspection, filters, theme contrast and the keyboard-accessible narrow readout on that sample.
`tests/viewer.performance.js` measures trusted mouse/wheel input, frame intervals, main-thread work and heap through
Playwright/CDP on the current map, then restores its camera. Compare the same scope and expansion state; frame times
depend on hardware and local load. It checks that zooming changes no world positions or saved pins.
Set `LANIAKEA_TEST_CLANGD_INDEXER` to a local clangd-indexer 21.1.8 executable to include the optional native
compiler-context regression. It checks a synthetic project and is not needed to run the M1 explorer.
Set `LANIAKEA_TEST_LIBCLANG` to the installed LLVM 21.1.8 library to run native class/function, call-role, inheritance,
override, source-location and edit-regeneration regressions on synthetic sources.

| concern | where |
|---|---|
| how it works | [docs](docs/README.md) |
| rules for contributors and agents | [AGENTS.md](AGENTS.md) |

Copyright (C) 2026 6r0m. Licensed under the GNU Affero General Public License, version 3 or later; see
[LICENSE](LICENSE). Third-party code is listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic
Games.
