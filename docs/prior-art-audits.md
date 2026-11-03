# Prior-art audits

A record, not current truth: the final reports of independent audits run on 2026-11-02, which the comparison in
[prior-art.md](prior-art.md) summarises. Sections 1-4 are verbatim apart from ASCII normalization and labels for
source-build-only files. Section 5 is condensed, with details of a private validation project removed. A report is a
claim set: its own VERIFIED/UNVERIFIED tags apply, and where it disagrees with [the architecture](architecture/README.md),
the architecture describes the system. The architecture review that followed is not reproduced.

Later measurement overrides these points:

- Sections 1 and 3 predate the runs. The installed-engine `GenerateClangDatabase` hazard was later reproduced on a real project.
- Section 3 says `UnrealAssetStringify` was not found. The binary ships in `Engine/Binaries/Win64`.
- Section 5 infers that UHT `-Json` fails. Measured: rc=6, object cycle.

Later decisions supersede these recommendations:

- Section 1 ranks the Sourcetrail fork as the first viewer to test. It is now only an optional experiment; the fallback is
  prerendered Graphviz SVG per scope.
- Section 2 recommends precomputing positions with elkjs at build time. Superseded: layout stays in the page, Cytoscape.js
  built-in layouts come first, and elkjs is deferred until they prove insufficient.

## Contents

- 1. Upstream code exploration platforms
- 2. Graph viewer libraries
- 3. Unreal-specific tools and UBT field evidence
- 4. Epic engine tooling sweep
- 5. UHT and reflection sweep

## 1. Upstream code exploration platforms

### Code exploration platforms for a large Unreal Engine C++ project on Windows

#### Direct answer
**No mature, free, self-hosted platform delivers this on Windows today.** You need your own Unreal adapter on any path, but not your own indexer. You may not need your own viewer.

- **Only platform worth testing:** the maintained Sourcetrail fork, fed by an adapter. It alone combines native Windows, typed edges, grouped drill-down, jump to source and an import API.
- **Its weakness:** "mature" overstates it. It has one maintainer, its SDK was archived in 2021, and it has no scale evidence on Unreal.
- **Build a viewer only if it fails a probe.** Then build a thin one over the same adapter output. No other platform is a fallback: each is Linux-only, non-semantic or licence-blocked.

**Evidence rules:** inspected 2026-11-02. Everything is VERIFIED (primary source read) unless tagged UNVERIFIED. No tool was run, and I found no independent benchmark on Unreal for any candidate. Open counts include PRs.

#### What decides it
These come from local UE 5.8 UnrealBuildTool (UBT) source, which goes beyond the web brief.
- **Compile database:** `-Mode=GenerateClangDatabase` defaults to `-Compiler=Clang`, disables PCH and unity, and has `-Include=`/`-Exclude=` filters. On Windows that means `clang-cl.exe` with `@response-file` commands.
- **Module layer:** `-Mode=JsonExport` emits each module's directory plus public and private dependency modules.
- **Clang floor:** engine minimum is 18.1.8. MSVC 14.44 requires Clang 19 (`Windows_SDK.json`, `yvals_core.h` STL1000). Older LLVM tools hit that floor against the current STL.

#### Serious candidates
| Candidate | License | Latest activity | Concentration | Windows | Role, adapter size |
|---|---|---|---|---|---|
| [Sourcetrail fork](https://github.com/petermost/Sourcetrail) | GPL-3.0 | 2026.10 (2026-10-02), roughly 2-4 monthly; 6 open | One active maintainer; "development will slow down somewhat" | Real: VS 2026 source build. Binaries are sponsor-only, $10/month | Viewer; medium |
| [clangd-indexer](https://github.com/clangd/clangd/releases) | Apache-2.0 per GitHub | 23.1.0 (2026-09-02); 858 open | LLVM project | Real: `clangd_indexing_tools-windows-23.1.0.zip` | Extraction only; small to medium |
| [Doxygen](https://www.doxygen.nl/download.html) | GPL-2.0 | 1.18.0 (2026-08-13); 1,900 open | 63% and 30% | Real: Windows 10/11 x64 | Static fallback; small to medium |
| [CodeCompass](https://github.com/Ericsson/CodeCompass) | GPL-3.0 | Push 2026-10-20; no releases; 98 open | Top two 31% each | None: ["We build CodeCompass in a Linux environment"](https://raw.githubusercontent.com/Ericsson/CodeCompass/master/doc/deps.md) | Best feature fit, blocked; substantial |
| [Searchfox/mozsearch](https://github.com/mozsearch/mozsearch) | MPL-2.0 | Push 2026-11-02; no releases | Top author 26% | WSL2 and Docker only | Watch; substantial |
| [clang-uml](https://github.com/bkryza/clang-uml) | Apache-2.0 | 0.6.3 (2026-07-06); 29 open | 99% one author | Real: win64 installer | Filtered diagrams, not an explorer; small |
| [CodeCharta](https://github.com/MaibornWolff/codecharta) | BSD-3-Clause | Push 2026-11-01; 75 open | Top author 20% | Docker or desktop; UNVERIFIED on Windows | Overview map; small |

**Sourcetrail fork**
- Uses LLVM 21.1.2, so it clears the Clang floor.
- [Reference kinds](https://raw.githubusercontent.com/CoatiSoftware/SourcetrailDB/master/core/include/ReferenceKind.h) include CALL, INHERITANCE, OVERRIDE, INCLUDE and IMPORT.
- [Symbol kinds](https://raw.githubusercontent.com/CoatiSoftware/SourcetrailDB/master/core/include/SymbolKind.h) include MODULE, PACKAGE, CLASS and METHOD. The graph [groups nodes by namespace or package](https://raw.githubusercontent.com/petermost/Sourcetrail/master/DOCUMENTATION.md).
- Import route: [SourcetrailDB](https://github.com/CoatiSoftware/SourcetrailDB) (Apache-2.0, archived 2021) at [v4.db25.p1](https://github.com/CoatiSoftware/SourcetrailDB/releases). The fork's [`s_storageVersion` is also 25](https://raw.githubusercontent.com/petermost/Sourcetrail/master/src/lib/data/storage/sqlite/SqliteIndexStorage.cpp), so the versions match. Round-trip is untested.
- [Numbat](https://github.com/quarkslab/numbat) (Apache-2.0) is a Python writer. Compatibility with this fork is not stated.
- Modelling Project/Plugin/Module as PACKAGE/MODULE nodes is UNVERIFIED in practice.
- Network: the docs describe a daily update check against sourcetrail.com. The fork's changelog is silent, so whether the code remains is UNVERIFIED.
- Unreal evidence: only [UE4 issue #17](https://github.com/CoatiSoftware/Sourcetrail/issues/17) from 2016, with a crash and later success. It gives no scale data.
- Not suitable as the viewer: [NumbatUI](https://github.com/quarkslab/NumbatUI) (GPL-3.0) calls itself unstable, has C++ indexing off by default, and documents only Docker and `.deb`.

**CodeCompass**
- Pins LLVM 15, below both floors.
- Authors report [LLVM's 320 MB producing a 21 GB database](https://mcserep.web.elte.hu/data/research/cppcon2018.pdf) (2018, self-reported).
- Plugin architecture exists. I found no custom hierarchy import.

**Searchfox**
- Firefox production use is the strongest independent scale proof here.
- Its [call and class diagrams are alpha quality](https://firefox-source-docs.mozilla.org/contributing/searchfox/diagramming.html), and the workflow is Mozilla-centred.

**Doxygen**
- `CLANG_DATABASE_PATH`, call and caller graphs, directory graphs and XML all [exist](https://www.doxygen.nl/manual/config.html).
- Whether the official Windows binary includes libclang is UNVERIFIED.
- Output is static. Call graphs cost heavily: one [secondhand report](https://gitlab.com/xonotic/xonotic-data.pk3dir/-/merge_requests/962) cites over 8 GiB.
- Unreal macros need an `INPUT_FILTER`; [one exists](https://github.com/normalvector/ue4_doxygen_source_filter) but misses `GENERATED_BODY` side effects.

**CodeCharta**
- The [schema](https://raw.githubusercontent.com/MaibornWolff/codecharta/main/visualization/app/codeCharta/util/generatedSchema.json) allows only File and Folder nodes, with attributed edges, so any tree imports.
- States "no analytics, tracking or telemetry". Not a symbol navigator.

#### clangd answers
- **References:** [`Ref`](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/Ref.h) stores Kind, Location and Container, which is the enclosing symbol. `RefKind::Call` exists.
- **Relations:** [BaseOf and OverriddenBy](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/Relation.h).
- **Call graph:** derivable as Container -> Symbol. `containedRefs` powers outgoing calls. The [Call filter](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/Index.h) matches function symbols, not call syntax, so taking a function's address also counts.
- **LSP versions:** incoming calls [since 12](https://llvm.googlesource.com/llvm-project/+/refs/heads/release/12.x/clang-tools-extra/docs/ReleaseNotes.rst); [outgoing since 20](https://www.mankier.com/1/extraclangtools-20); [remote index support in 21](https://www.mankier.com/1/extraclangtools-21).
- **Format:** not a stable public format. [Version 21; non-current versions are rejected](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/Serialization.cpp). YAML is ["debugging and experiments only"](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/Serialization.h). Pin the version.
- **Windows input:** [expands response files](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/GlobalCompilationDatabase.cpp), so it fits Unreal's commands.
- **Scale:**
  - Chrome-size projects take ["multiple hours"](https://clangd.llvm.org/design/indexing) (project docs).
  - [clangd-graph-rag](https://github.com/2015xli/clangd-graph-rag) builds graphs from this index: Linux kernel in about 4 hours, 32 GB peak (self-reported, one author, Linux-oriented).
  - [#161226](https://github.com/llvm/llvm-project/issues/161226) reports out-of-memory on 34,773 UE 5.6.1 commands. It was fixed by matching the clangd version to Visual Studio's, so it is a version-coupling warning, not a scale limit.

#### SCIP, scip-clang and LSIF
- **Windows: no.** [v0.4.1 (2026-10-22)](https://github.com/sourcegraph/scip-clang/releases) ships only arm64-darwin and x86_64-linux binaries (plus a dev Linux build). The Windows epic [#170](https://github.com/sourcegraph/scip-clang/issues/170) closed as "not planned" on 2026-01-03. Status is Beta, Apache-2.0, 96% one author.
- **clang-cl: no.** [Toolchain detection](https://raw.githubusercontent.com/sourcegraph/scip-clang/main/indexer/CompilationDatabase.cc) accepts only clang, gcc and nvcc. That file has no clang-cl handling or `@file` expansion. It reads `command` or `arguments` from `compile_commands.json`, run from project root. Indexing a Linux-target database under WSL is UNVERIFIED.
- **Call data: no caller/callee fields.** The [schema](https://raw.githubusercontent.com/sourcegraph/scip/main/scip.proto) has occurrences with enclosing ranges, intended for call hierarchies.
- **What scip-clang emits:** [`Indexer.cc`](https://raw.githubusercontent.com/sourcegraph/scip-clang/main/indexer/Indexer.cc) sets no enclosing range and no symbol kind. It emits only implementation relationships for bases and overrides. I read that file only, not its helpers.
- **CLI:** `print --json`, `snapshot`, `stats`, `lint`, `test`, and an experimental SQLite [`expt-convert`](https://raw.githubusercontent.com/scip-code/scip/main/docs/CLI.md).
- **Governance:** [independent since March 2026](https://sourcegraph.com/blog/the-future-of-scip).
- **Viewer:** Sourcegraph [lists only Enterprise, from $16K](https://sourcegraph.com/pricing), and its [core repo has been private since 2024](https://devclass.com/2024/08/21/sourcegraph-makes-core-repository-private-co-founder-complains-open-source-means-extra-work-and-risk).
- **LSIF:** superseded. [Sourcegraph removed read support at 4.6](https://5.10.sourcegraph.com/admin/how-to/lsif_scip_migration), and a [mirrored README](https://gitee.com/mirrors_sourcegraph/lsif-node) says its indexer is unmaintained.

#### Rejected
- **Repowise** (AGPL-3.0, weekly releases, top author 76%): [tree-sitter only, no clang dependency](https://raw.githubusercontent.com/repowise-dev/repowise/main/pyproject.toml), and telemetry is on until you opt out. Its [vendor-run C++ benchmark](https://raw.githubusercontent.com/repowise-dev/repowise/main/docs/BENCHMARKS.md) shows precision 0.84-0.94, recall 0.61-0.71, on small repos. Unreal-scale macro code is likely worse (UNVERIFIED).
- **[Kythe](https://kythe.io/docs/schema/)** (Apache-2.0, v0.0.76, 2026-07-16): the best schema here (`ref/call`, `overrides`, `package`), but [docs cover Debian and macOS with Bazel](https://kythe.io/getting-started/). No Windows support or end-user viewer found.
- **[Glean](https://glean.software/docs/building/)** (BSD-3-Clause per its LICENSE; no releases): "only tested on Linux so far". No viewer documented.
- **[Woboq/KDAB codebrowser](https://github.com/KDAB/codebrowser):** CC-BY-NC-SA 3.0 unless commercially licensed, and it bars assisting commercial development. Static HTML; Windows not mentioned.
- **[GitNexus](https://github.com/abhigyanpatwari/GitNexus):** PolyForm Noncommercial, tree-sitter.
- **[CodeQL](https://raw.githubusercontent.com/github/codeql-cli-binaries/main/LICENSE.md):** barred on any codebase that isn't OSI open source without a paid GitHub Advanced Security licence. Also not a viewer.
- **[Understand](https://scitools.com/pricing):** paid, about $100-120/month per its pricing page. No Unreal evidence found.
- **Not semantic:** [OpenGrok](https://github.com/oracle/opengrok), [Elixir](https://github.com/bootlin/elixir), [Zoekt](https://github.com/sourcegraph/zoekt), [CodeQuery](https://github.com/ruben2020/codequery). Fine for search only, not structure.
- **[Sourcebot](https://github.com/sourcebot-dev/sourcebot):** search-based navigation. A docs snippet says it is Enterprise-gated, but [LICENSE.md is plain MIT](https://raw.githubusercontent.com/sourcebot-dev/sourcebot/main/LICENSE.md). That conflict is unresolved, and either way it is not semantic.
- **Tree-sitter graphs:** [code-graph-rag](https://github.com/vitali87/code-graph-rag) (MIT, optional libclang layer, details UNVERIFIED) and [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (MIT, own type resolution, claims no telemetry, viewer is beta v0.0.1). No proven C++ semantic accuracy.
- **Joern:** Apache-2.0. Docs returned 404, so its fuzzy-parser limits are UNVERIFIED.
- **[ccls](https://github.com/MaskRay/ccls):** clangd covers the same need.
- **Graphiti:** not audited; it is not an indexer (UNVERIFIED).
- **Coati:** no separate product found. CoatiSoftware published Sourcetrail.

#### Ranking
1. **clangd-indexer plus UBT JsonExport:** adopt as the data layer regardless of viewer.
2. **Sourcetrail fork plus adapter:** first viewer to test.
3. **Own thin viewer over the same data:** only if #2 fails.
4. **Doxygen:** cheap static fallback.
5. **clang-uml and CodeCharta:** optional complements.
6. **CodeCompass and Searchfox:** watch. CodeCompass needs a newer LLVM and a Linux-target database.

**Adapter scope (medium):**
- Build the Project/Plugin/Module tree from `.uplugin` files and JsonExport.
- Map symbols to modules by path.
- Merge calls, bases and overrides.
- Handle `_Implementation`, `.gen.cpp`, delegates and reflection macros.
- Write `.srctrldb`.

**Probe:** index the project and plugin scope with `-Include=`, then measure time, peak memory, database size and viewer responsiveness. Also confirm that injected MODULE/PACKAGE nodes render and drill down. Reject the viewer if drill-down fails or it stops being responsive.

#### Gaps
- Sourcetrail fork: clang-cl behaviour, `@rsp` handling and Unreal-scale behaviour are UNVERIFIED. Inlining response files beforehand is simple if needed.
- Doxygen's and others' telemetry is undocumented, so it is UNVERIFIED.
- `gh` isn't installed, so metadata came from public GitHub REST until rate-limited, then the [ungh.cc](https://ungh.cc) proxy. Contributor shares cover only the top 30 or so contributors.

## 2. Graph viewer libraries

### Graph viewer library comparison for scoped drill-down

**Recommendation: use Cytoscape.js 3.x (Canvas) and precompute positions with elkjs at build time.** Store the positions in each shard. A scope change becomes `cy.elements().remove()`, `cy.add(shard)` and a `preset` layout, so collapse logic never exists.

- **Not tested:** I ran no library, so performance and determinism come from sources only.
- **Method limits:** `gh` isn't installed, so I used unauthenticated public REST with `curl`. The core quota ran out, so concentration figures are 12-month commit samples, not all-time.
- **Convention:** all URLs were inspected 2026-11-02. [V] means primary source read, [U] means unverified.

#### Comparison [V unless marked]

Commit figures are total commits, then author share of a sample of up to 100.

| Option | Since / last release | SPDX | Real use | Nesting | Determinism | Headless | 12-month commits |
|---|---|---|---|---|---|---|---|
| Cytoscape.js | 2011 / 3.34.4, 2026-10-15 | MIT | [Nx](https://registry.npmjs.org/@nx/graph), [Mermaid](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/package.json) | Native compound | `preset` is exact; fcose has no seed | [Automatic in Node](https://js.cytoscape.org/); drawing needs a browser (inferred) | 158; maxkfranz 42% |
| React Flow | 2019 / 12.12.1, 2026-11-02 | MIT | [Kibana](https://github.com/elastic/kibana/pull/252767), [Airflow](https://github.com/apache/airflow/blob/main/airflow-core/src/airflow/ui/src/components/Graph/elkGraphUtils.ts), [Langflow](https://github.com/langflow-ai/langflow/blob/main/src/frontend/package.json) | `parentId`; [no layout engine](https://reactflow.dev/learn/layouting/layouting) | Positions supplied | [Needs DOM; Jest mocks; Playwright works](https://reactflow.dev/learn/advanced-use/testing) | 294; moklick 52%, peterkogo 17% |
| elkjs (layout only) | 2017 / 0.12.1, 2026-10-28 | EPL-2.0 OR GPL-3.0-or-later | Airflow, Mermaid | Strongest | Seed default 1 | Node and worker | 48; Eddykasp 41%, dependabot 43%. ELK core 26; Eddykasp 69% |
| Graphviz wasm | `@hpcc-js/wasm-graphviz` 1.30.0, 2026-10-21 | Wrapper Apache-2.0; [engine EPL-2.0](https://graphviz.org/license/) | [Doxygen](https://www.doxygen.nl/manual/diagrams.html) | Clusters; [`compound` is dot-only](https://graphviz.org/docs/attrs/compound/) | [Cluster order varied](https://forum.graphviz.org/t/clustering-gives-undeterministic-results/989) on 2.49.3; current state [U] | Node | Not measured |
| G6 v5 | 2017 / 5.1.1, 2026-05-08 | MIT | Named production user not found [U] | Combos | See issues below | [`g6-ssr`](https://github.com/antvis/G6/tree/v5/packages/g6-ssr) 0.1.1, PNG/SVG/PDF | 46; 21 authors, top 17% |
| Sigma + graphology | 2012 / 4.0.4, 2026-10-27 (4.0.0 only 2026-10-08) | MIT | [Gephi Lite, still on ^3](https://github.com/gephi/gephi-lite/blob/main/packages/gephi-lite/package.json) | None documented; [request #1515 open](https://github.com/jacomyal/sigma.js/issues/1515) | Positions supplied | WebGL in browser (inferred) | 410; jacomyal 96% |

- **Alternatives:** nothing warranted a deeper look. d3-force's last npm release was 2021, and Gephi Lite is a GPL-3.0 application.
- **Forkability:** elkjs is [GWT-compiled Java](https://github.com/kieler/elkjs), so forking it means taking on that toolchain (inferred).
- **Adoption signal:** Kibana removed Cytoscape in [APM](https://github.com/elastic/kibana/pull/252767) and [ML](https://github.com/elastic/kibana/pull/263606), and [Kiali](https://github.com/kiali/kiali/issues/8053) removed it too. Neither cited a Cytoscape defect. Elastic said only ["clean up"](https://github.com/elastic/kibana/issues/252309), and Kiali said "simplify the code base". Read this as momentum, not a fault.

#### Large-graph numbers

- **Independent:** the [2025 benchmark](https://pmc.ncbi.nlm.nih.gov/articles/PMC12061801/) tested **G6 4.8.7, not v5**, and did not cover Cytoscape, Sigma or React Flow. G6-Canvas held 30 fps up to 1k nodes at edge/node ratio 1, and 200 at ratio 10 (force layout plus render).
- **Vendor:** [Cytoscape, preliminary on an M1](https://blog.js.cytoscape.org/2025/01/13/webgl-preview/): ~1,200 nodes/16k edges at ~20 fps on Canvas and 100+ on WebGL; ~3,200/68k at 3 versus 10 fps.
- **React Flow:** [no published thresholds](https://reactflow.dev/learn/advanced-use/performance). [`onlyRenderVisibleElements`](https://reactflow.dev/api-reference/react-flow) is off by default and "adds an overhead". Low-thousands capacity is [U].
- **Gap:** I found no independent numbers for Cytoscape, React Flow or G6 v5.

#### G6 issues [V, each read directly]

**Not applicable if no combo collapse is used**

| # | Title (shortened) | State | Version | Opened |
|---|---|---|---|---|
| [6723](https://github.com/antvis/G6/issues/6723) | Collapsed combo flashes top-left on first drag | Open | 5.x | 2025-01-13 |
| [6730](https://github.com/antvis/G6/issues/6730) | 1,000-node combo slow to expand, can't re-collapse | Open | 5.x | 2025-01-15 |
| [6766](https://github.com/antvis/G6/issues/6766) | collapse-expand plus brush-select crashes browser | Open | 5.0.42 | 2025-02-11 |
| [6769](https://github.com/antvis/G6/issues/6769) | Jump on expand with layout | Open | 5.x | 2025-02-12 |
| [6810](https://github.com/antvis/G6/issues/6810) | antv-dagre overlaps collapsed combos | Closed via 5.1.1; a user reported inner layout still wrong on the beta | 5.x | 2025-02-26 |
| [6946](https://github.com/antvis/G6/issues/6946) | Edge length unchanged after collapse | Closed by stale bot, no fix | 5.0.44 | 2025-03-28 |
| [6492](https://github.com/antvis/G6/issues/6492) | Edge level always 1 after drill-down redraw | Open | 5.x | 2024-11-08 |
| [7168](https://github.com/antvis/G6/issues/7168) | Stuck loop edge on collapsed combo | Closed, fixed by PR #7266 | 5.x | 2025-05-27 |
| [7606](https://github.com/antvis/G6/issues/7606) | Nodes move, edges don't, after collapse (combo or tree not stated) | Open | 5.x | 2026-01-30 |

**Apply only if combos are containers, or layout re-runs in place**

| # | Title (shortened) | State | Version | Opened |
|---|---|---|---|---|
| [7661](https://github.com/antvis/G6/issues/7661) | antv-dagre throws on an edge attached to a combo | Open | 5.x | 2026-05-26 |
| [7384](https://github.com/antvis/G6/issues/7384) | Hover dead on cross-combo edge after moving combo | Open | 5.x | 2025-09-10 |
| [7594](https://github.com/antvis/G6/issues/7594) | Re-layout moves an existing node | Open | 5.x | 2026-01-21 |

**Apply regardless of design**

| # | Title (shortened) | State | Version | Opened |
|---|---|---|---|---|
| [7669](https://github.com/antvis/G6/issues/7669) | 300 nodes, 313 edges, 0 combos: ~3.9 s jank with animation, ~500 ms without (dev build, Firefox) | Open | 5.1.1 | 2026-07-08 |
| [7574](https://github.com/antvis/G6/issues/7574) | 5.0 much worse than 4.0: 1,000 nodes take tens of seconds, 2,000 don't render (reporter's claim) | Open | Unstated | 2026-01-06 |
| [7664](https://github.com/antvis/G6/issues/7664) | `graph.draw` lags past several hundred nodes; no data | Open | Unstated | 2026-06-01 |
| [5994](https://github.com/antvis/G6/issues/5994) | Highlight slower than v4 at 1,000 nodes; no timings | Open | 5.x | 2024-07-05 |
| [6591](https://github.com/antvis/G6/issues/6591) | v5 slower than v4; no numbers | Closed by stale bot, no fix | 5.x | 2024-12-03 |

- **Missing edges:** my searches found no v5 report of edges vanishing after collapse. The floating-edge report [#7436](https://github.com/antvis/G6/issues/7436) is v4 (`addItem`).
- **Regression versus v4:** this rests on reporters only, with no independent v5 benchmark. The numbers are unconfirmed by maintainers.
- **Tracker reliability:** "closed/completed" doesn't mean fixed here. In #7669, #7606, #7594 and #7661 the only substantive reply was an AI bot's.
- **Effect on the scoped design:** fresh small graphs avoid all the collapse defects, but not the performance reports. If G6 were used, animation would have to be off.

#### Cytoscape compound support [V]

- **Layouts:**
  - [fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose): full compound support with constraints; last npm release 2023.
  - [cose-bilkent](https://github.com/cytoscape/cytoscape.js-cose-bilkent): compound; last npm release 2019; its README points to fCoSE as faster.
  - [cola](https://github.com/cytoscape/cytoscape.js-cola): "supports noncompound and compound graphs well".
  - [dagre](https://github.com/cytoscape/cytoscape.js-dagre/blob/master/src/layout.mjs): `compound: true` plus `setParent`; ranking resolves parents to their first leaf child.
  - [elk](https://github.com/cytoscape/cytoscape.js-elk): builds nested children, but its release pins `elkjs ^0.9.3`, so call elkjs directly.
- **Edge bundling:** per the [style docs](https://github.com/cytoscape/cytoscape.js/blob/unstable/documentation/md/style.md), `bezier` bundles parallel edges and `taxi` bundles hierarchically for trees and DAGs. `haystack` doesn't support compound parents. General bundling in core: none found [U].
- **Compound performance:** the docs say compounds ["make style calculations and rendering more expensive"](https://github.com/cytoscape/cytoscape.js/blob/unstable/documentation/md/performance.md), with no figures. [fcose #71](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/issues/71) (overlapping compound boxes on a dense graph) is open.
- **expand-collapse:** its [README](https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse) says "no longer being maintained", and the last push was 2024-11-27. [#149](https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse/issues/149) has no maintainer answer. This design doesn't need it.
- **Determinism:** [fcose uses unseeded `Math.random`](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/master/src/fcose/spectral.js), and `randomize: false` requires `quality: "proof"`.
- **Risks:**
  - The [v4 redesign](https://github.com/cytoscape/cytoscape.js/issues/3486) is undated and breaking, and may narrow v3 extension compatibility, so pin 3.x.
  - The WebGL preview lacked dashed lines and non-triangle arrows ([#3374](https://github.com/cytoscape/cytoscape.js/issues/3374) is still open), so typed edges should stay on Canvas.

#### ELK [V unless marked]

- **Hierarchy:** the [root default resolves to SEPARATE_CHILDREN](https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html). INCLUDE_CHILDREN lays out descendants in a single run and "may allow cross-hierarchical edges to be laid out properly".
- **Determinism:**
  - [`randomSeed` defaults to 1](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) on layered; [0 means pseudo-random](https://eclipse.dev/elk/reference/options/org-eclipse-elk-randomSeed.html).
  - A maintainer says layered is ["designed to provide a stable layout"](https://github.com/kieler/elkjs/issues/39) (2018).
  - I found no guarantee of identical output across versions [U].
- **Conflict:** a maintainer says ["INCLUDE_CHILDREN does not always work with model order"](https://github.com/eclipse-elk/elk/issues/1069). Crashes on these paths remain open:
  - [elk#1173](https://github.com/eclipse-elk/elk/issues/1173): NPE with `forceNodeModelOrder`.
  - [elk#1192](https://github.com/eclipse-elk/elk/issues/1192): crash on ports with cross-hierarchy edges.
  - [elkjs#396](https://github.com/kieler/elkjs/issues/396): INCLUDE_CHILDREN plus postCompaction, title only.
  - Behaviour on 0.12.1 is [U].
- **Production pattern:** [Airflow](https://github.com/apache/airflow/blob/main/airflow-core/src/airflow/ui/src/components/Graph/elkGraphUtils.ts) enables INCLUDE_CHILDREN only when groups are open, and lowers thoroughness above 100 edges.

#### Ranking

1. **Cytoscape.js 3.x plus build-time elkjs.** It has Canvas, selector-based typed edges, headless logic tests, and code-graph precedent in Nx.
2. **React Flow plus elkjs.** Choose this if the stack is already React and nodes are rich HTML cards. It has the strongest current adoption, but capacity beyond hundreds of nodes is unproven.
3. **Prerendered Graphviz SVG per scope.** No runtime graph library, but no live filtering, and cluster stability needs checking.
4. **G6 v5.** Capable on paper, but the plain-graph performance reports and thin maintainer response count against it.
5. **Sigma + graphology.** Only for a possible flat whole-graph overview, because it has no documented nesting.

**Simplest option that avoids custom collapse logic:** option 1 with flat scopes.

- The server aggregates cross-scope edges onto sibling nodes, so no compounds are needed and neither is INCLUDE_CHILDREN.
- Positions live in the shards, so stability across refreshes is just data. Pin the elkjs version, because an upgrade may move positions (inferred).

**Before committing:** run a Playwright spike on real shards of 500 and 2,000 nodes, comparing Cytoscape and React Flow frame times. Byte-compare repeated ELK runs in the same spike.

## 3. Unreal-specific tools and UBT field evidence

**Verdict:** no third-party tool audited gives inspectable semantic C++ call resolution. The sound base is Epic's own UBT output: `-Mode=JsonExport` for the module graph, and clangd over a compile database for code. `-Mode=GenerateClangDatabase` has a source-level hazard on installed engines (A3).

**Limits:** nothing was executed, so every UBT claim below is a static read. `gh` isn't installed, so I used WebFetch and read-only `curl`. The unauthenticated API then hit its rate limit, so contributor counts exist for Monolith only.

Tags: **[V]** primary source read, **[U]** unverified. Local paths are relative to `Engine/Source/Programs/UnrealBuildTool/` in the installed UE 5.8.3. All URLs inspected 2026-11-02.

#### A. UBT and Epic facts

**1. `-Mode=JsonExport`**
- [V] `JsonExportMode.cs` has no installed-engine guard.
- [V] `UEBuildTarget.Create` runs `PreBuildSetup`, then `RecursivelyCreateModules` (`UEBuildTarget.cs:1358,4540`), so module edges exist with no compile.
- [V] It exports Public, Private, IncludePath and DynamicallyLoaded modules, Rules path, Directory, PCHUsage and CircularlyReferencedModules (`UEBuildModule.cs:1532`).
- [V] Epic uses it itself (`AutomationTool/Scripts/ListThirdPartySoftware.Automation.cs:39`).
- [V] Defect: `InternalIncludePaths` is written from `PublicIncludePaths` (`UEBuildModule.cs:1561`).
- [U] No public run on an installed engine found.

**2. `-Mode=QueryTargets`** [V]
Target name, path and type only, with no module data (`QueryTargetsMode.cs`).

**3. `-Mode=GenerateClangDatabase`** (`GenerateClangDatabase.cs`) [V]
- It forces non-unity, `-NoPCH -NoVFS`, and `-Compiler=Clang` unless overridden. That maps to `clang-cl.exe` (`VCEnvironment.cs:230`).
- Commands are MSVC-driver style, `@file.rsp <args>` (`VCCompileAction.cs`), so database size is not the issue on Windows.
- UHT runs, because `BuildAsync` calls `RunCodeGen` (`UEBuildTarget.cs:2727`).
- `bForceAddGeneratedCodeIncludePath` fixes the old 4.24 report of missing `.generated.h` paths.
- Default output is the engine root unless `-OutputDir=` is set. Minimum clang is 18.1.8.

**Installed-engine hazard** [V code path; effect not reproduced, no public report found]
- `UEBuildTarget.cs:1895` forces `IntermediateEnvironment` to Default when `Unreal.IsEngineInstalled()`. The isolating `<Target>GCD` folder therefore exists only on source engines.
- On installed engines the mode writes `<Module>.Shared.rsp` and per-file `.obj.rsp` into the normal intermediates (`UEBuildModuleCPP.cs:757`, `TargetMakefile.cs:98`).
- Changed rsp files invalidate the MSVC `Makefile.bin` (`TargetMakefile.cs:1028`). They are also action prerequisites (`VCCompileAction.cs:254-272`).
- Expected result: the affected modules recompile, and the next MSVC build overwrites the rsp files the database points to.
- `bUsePrecompiled` likely makes the database project-only. This is inferred. The old patch flag `-ForceGenerationOfEngineDatabase` corroborates it.

**4. `-Mode=GenerateProjectFiles -VSCode`** [V]
- Writes `.vscode/compileCommands_<Project>.json` with per-module rsp files outside the build intermediates.
- Compiler comes from `GetDefaultCompiler`, with `/D /I /FI` when not clang (`VSCodeProjectFileGenerator.cs`).
- [U] Serena's claim of `[]` on launcher engines with foreign projects. A static read neither confirmed nor refuted it.

**5. UHT** [V]
- A `Json` exporter exists, off by default (`UhtExporterOptions.None`). It is enabled through ini `[UnrealHeaderTool] Json` (`UnrealHeaderToolMode.cs:241`). `-NoDefaultExporters` isolates it, and custom exporters are possible (`ScriptGeneratorUbtPlugin`).
- UHT covers reflected types in headers only, so it gives no call edges.
- [U] What changed specifically in 5.5.

**6. Epic plugins** [V] (all disabled by default)

| Plugin | Status | Data source |
|---|---|---|
| Plugin Reference Viewer | Beta | `.uplugin` `Plugins[]` plus AssetRegistry; no Build.cs edges |
| Plugin Audit | Beta | AssetRegistry plus IPluginManager; no Build.cs edges |
| Code View | Non-beta, in `Experimental/` | Functions of selected actors via `FSourceCodeNavigation`; no graph |
| Unreal MCP | Experimental | MCP server |
| SemanticSearchToolset | Experimental | Assets only, needs an embedding provider |
| PluginToolset | Experimental | `.uplugin` dependencies only |

**7. Negatives** [U]
- `UnrealAssetStringify`: not in the install's `.h/.cpp/.cs/.uplugin` files and not on the web.
- No Epic code-graph statement found. A strict grep of the MCP, toolset and AIAssistant plugins for `call graph`, `clangd`, `compile_commands` and similar had zero hits.

#### B. Tools

| Tool | Parser / resolution | Engine, maintenance, licence | Result |
|---|---|---|---|
| [Spyglass (NsSpyglass)](https://github.com/mykaadev/NsSpyglass) | [V] No parser. `GetEnabledPlugins()` plus `Desc.Plugins` (`SNsSpyglassGraphWidget.cpp:57,97`). Enabled plugins and `.uplugin` edges only | "5.2 or newer", no 5.8 claim. Last commit 2026-10-30, MIT, 12 stars | Screenshot-level: no Build.cs, no code |
| [Monolith](https://github.com/tumourlove/monolith) | [V] Regex. `MonolithReferenceBuilder.h`: "Uses regex heuristics, NOT tree-sitter ASTs"; `obj.Method()` resolution not ported. `ResolveSymbol` falls back to bare short name. `cppreflect` reads UHT artefacts | 5.7/5.8; 5.8 compile fixes are in the changelog, accuracy unproven. v0.24.0 2026-10-18, MIT, 361 stars, beta. One author has about 90% of top-8 commits | Text heuristic, see note below |
| [ue-codegraph-mcp](https://github.com/YomenStyle/ue-codegraph-mcp) | [V] tree-sitter-cpp with no compile flags. `Ranker.pick`: "same file > paired header/source > directly included..."; `calls` updated by `file_id` + `callee_name`, so no receiver type | 8 commits, last 2026-10-14. No LICENSE, no licence field | Heuristic and legally unusable |
| [unreal-source-mcp](https://github.com/tumourlove/DEPRECATED-unreal-source-mcp) | [V] Repo is `DEPRECATED-`; tree-sitter per aggregator [U]. Monolith's port calls itself "Less accurate than the Python version" | Deprecated | Reject |
| [NarshaADK](https://github.com/Next-Stage-Inc/narshamcp-releases) | [U] Claims source, PDB and `.uasset` parsing; parser unnamed. Runtime is a closed binary | 5.7/5.8. v0.13.7, Early Access, Fab licence, paid above a revenue threshold. A telemetry toggle is mentioned [U] | Unauditable |
| [unreal-clangd](https://github.com/boocs/unreal-clangd) | clangd, so semantic for what it covers. [V] README: precompiled 5.8.0 "no longer includes Unreal Source response files". Confirmed locally: 0 `.rsp` across 555 engine module dirs | 281 stars, last push 2026-06-18, no licence detected, v4 rewrite in progress | Reference only |
| [ue-modules-analysis](https://github.com/lukehb/ue-modules-analysis) | [V] Custom UBT mode; requires recompiling UBT | Last commit 2021 (UE4) | Superseded by JsonExport |
| [compiledb-patches](https://github.com/TheGreatMcPain/unreal-engine-compiledb-patches) | [V] Patches engine source, rebased on 4.26.2 | Stale | Reject |
| [UnrealLink](https://github.com/JetBrains/UnrealLink) | [V] IDE and editor bridge (logs, Blueprint navigation), not the indexer. ReSharper C++ engine closed | Apache-2.0, active 2026-10-31 | Comparison only |
| [Visual Assist](https://www.wholetomato.com/documentation/unreal-engine/support-for-ue) | [U] Vendor-claimed proprietary parser | Commercial | Comparison only |
| [unreal-angelscript extension](https://github.com/Hazelight/vscode-unreal-angelscript) | [V] AngelScript language server only, tied to a forked engine | Active 2026-08-31 | Out of scope |

**Monolith note:** its ~967K symbol count is not accuracy evidence. Its own changelog says UCLASS members and Allman-style `.cpp` bodies were not indexed until recently. A code comment says "most engine function bodies were invisible as callers".

Monolith's README also says the port 9316 listener is reachable on all interfaces. The auto-updater is opt-in. README and SECURITY mention no telemetry; the full code was not audited.

Not found as projects: UnrealGraph, ue4-module-dependency, UEDependencyVisualizer.

No production or studio usage evidence surfaced for any open tool. I found no substantial engineer write-up on clangd at scale, only forum posts and READMEs.

#### C. Field evidence

- [libpas thread](https://forums.unrealengine.com/t/missing-precompiled-manifest-for-libpas-generateclangdatabase-for-intellisense/2675501) (UE 5.6, Windows): running the mode on a game target failed with "Missing precompiled manifest". A second user's workaround then wrote an empty file. No cause was confirmed and the engine type was not stated.
- [Non-incremental thread](https://forums.unrealengine.com/t/ubt-generateclangdatabase-is-not-incremental-and-recreates-whole-compile-commands-json-each-time/2005308) (5.4.2 Linux): about 45s, down to about 3s with `-NoExecCodeGenActions`. A later user said the flag was no longer needed. No Epic reply.
- [LLVM #161226](https://github.com/llvm/llvm-project/issues/161226) (5.6.1): 34,773 commands and clangd out of memory. The reporter fixed it by matching clangd to Visual Studio's LLVM. Closed as invalid.
- [Serena guide](https://oraios.github.io/serena/_sources/03-special-guides/unreal_engine_setup_guide_for_serena.md): recommends this mode with `-OutputDir`, and `-Compiler=VisualStudio2022` as the fallback. It says nothing about intermediates.

#### D. Conclusions

**Reusable**
- `-Mode=JsonExport`: module graph, per target and configuration. Ignore `InternalIncludePaths`.
- `-Mode=QueryTargets`: target discovery.
- `-Mode=GenerateClangDatabase` plus clangd, only with the hazard handled. Options are a source-built engine, a disposable project copy, or the `-VSCode` output with its own rsp files. Reproduce the hazard before committing to any of these.
- UHT `Json` exporter: reflection facts.
- Engine `.generated.h` files do ship (273 Inc dirs). Engine response files do not.
- Design ideas only: Monolith's MIT MCP ergonomics and its git co-change layer.

**Rejected**
- Spyglass, Plugin Reference Viewer, Plugin Audit: `.uplugin` and asset data only, no code edges.
- Monolith call graph, ue-codegraph-mcp, unreal-source-mcp: name-based heuristics, not semantic.
- ue-codegraph-mcp also has no licence.
- NarshaADK: closed runtime, unauditable, Early Access.
- ue-modules-analysis and compiledb-patches: stale, need engine edits.
- UnrealLink, Visual Assist, angelscript: closed or off-scope.

## 4. Epic engine tooling sweep

### UE 5.8.3: does Epic ship an architecture map of plugins, modules, C++ symbols and assets?

**No.** Epic ships separate data sources for each layer, plus two asset- and plugin-level UEdGraph viewers. Nothing unifies the four layers, and nothing extracts C++ call edges. The most useful finds were not on your list:
- UBT `-Mode=Analyze`, which writes module graphs as GEXF
- UHT `-Json`
- `ModelContextProtocol` ("Unreal MCP")
- `BatchProcessCommandlet`
- `IoStoreDependencyViewer`

Everything here comes from reading source. I ran nothing, so the "headless" labels are unexecuted. Paths are relative to `Engine/`; unless marked source-build only, they are in the launcher install.

#### 1. Plugin Reference Viewer
- **Path and status:** `Plugins/Experimental/PluginReferenceViewer`. It is Beta, and also sets `"IsExperimental"` rather than the usual `IsExperimentalVersion` key. Off by default.
- **Graph:** it is a real UEdGraph: `UEdGraph_PluginReferenceViewer`, `UEdGraphNode_PluginReference`, `UPluginReferenceViewerSchema`.
- **Edges:** `.uplugin` data only. `CachePluginDependencies` walks `FPluginDescriptor.Plugins` from `GetDiscoveredPlugins()`. There are no module nodes.
- **Asset Registry use:** only for sizes and for asset drill-down between plugins.
- **Export:** public `FPluginReferenceViewerUtils`, plus console commands `PluginReferenceViewer.ExportPlugins`, `ExportReference`, `ExportAssetReference`, `ExportDirectory` and `TracePath`. There is no commandlet.
- **Limitation:** `ExportPlugins` loops over declared dependencies only, so undeclared dependencies never appear in that CSV.

#### 2. Plugin Audit
- **Path and status:** `Plugins/Experimental/PluginAudit`, Beta. There is no commandlet.
- **Scope:** built-in Game Feature plugins only (`SPluginAuditBrowser::BuildPluginList`).
- **Checks:**
  - gameplay tags whose source plugin isn't a dependency
  - references to content in disabled or excluded plugins
- **Output:** a MessageLog only. `ScanForViolations` is static but sits in a private header.
- **Related:** `UEditorValidator_PluginAssetReferences` in `Plugins/Editor/AssetReferenceRestrictions` (not flagged) validates plugin assets when a changelist touches a `.uplugin`.

#### 3. Reference Viewer
- **Path and status:** `Plugins/Editor/AssetManagerEditor/.../ReferenceViewer`, not flagged, on by default.
- **Nodes:** `UEdGraphNode_Reference`, keyed by `FAssetIdentifier`.
- **`EDependencyCategory`:** `Package`, `Manage`, `SearchableName`.
- **`/Script/Module` nodes:** yes, behind the `ShowCodePackages` toggle, but only at package level. C++ classes are not nodes.
- **Registry limits (both matter):**
  - `AssetRegistry.cpp` states "Script nodes are never represented as source nodes", so the registry holds no module-to-module edges.
  - `ScriptPackagesToSkip` (line 7583) drops hard dependencies on CoreUObject, Engine, BlueprintGraph and UnrealEd.
- **Class-level data:** `FAssetPackageData::ImportedClasses` lists classes used by a package's exports.
- **Export:** clipboard and collections only (`CopyReferencedObjects`).

#### 4. Viewers
- **Class Viewer:** `Source/Editor/ClassViewer` still exists; I did not inspect it further. No related commandlet is in the list.
- **Code View:** still present at `Plugins/Experimental/CodeView`, unflagged, off by default. It is a Details-panel category for selected actors. Function names come from `FSourceCodeNavigation::GatherFunctionsForActors`, which uses DbgHelp `SymEnumSymbols`.
- **SourceCodeAccess:** `Source/Developer/SourceCodeAccess` still exists, and `CodeView` uses it to check IDE access. I did not read further.
- **Modules tab:** gone. `SModuleUI` and `ModuleUIInterface.h` exist in neither tree. The only remnant is `Runtime/Toolbox/Private/ToolboxModule.cpp`, which has no Build.cs.
- **Nearest replacement:** Insights `SModulesView`, which shows trace-loaded binaries and symbol status, not dependencies.

#### 5. Commandlets
- **Not found:** `ListAssetDependencies`, `AssetDependencyGraph`, `ExportAll`.
- **Not commandlets:** `AssetRegistryGenerator` (a cook-time class in `UnrealEd/Private/Commandlets`) and `DerivedDataEditor` (an editor module).

| Commandlet | Output |
|---|---|
| `DumpAssetRegistry` | `Page_*.txt`; switches include `Dependencies`, `DependencyDetails` |
| `AssetRegistryExport` (`Plugins/Editor/AssetRegistryExport`, unflagged, off) | SQLite or CSV of assets and tags; dependencies only via `-ListDependencies=<PrimaryAssetTypes>` |
| `AssetRegistryDump` (declared in `AssetRegUtilCommandlet.h`), `DiffAssetRegistries`, `ExportPakDependencies`, `AssetSizeQuery`, `PkgInfo` | Headers only; not read |
| `GenerateBlueprintAPI` | JSON of the Blueprint-exposed API |
| `DumpBlueprintsInfo` | Not read |
| `DataValidation`, `CompileAllBlueprints` | Validation/compile; relevant only as CI hooks |
| `PythonScript` | Runs any script, including `get_asset_registry().get_dependencies()` |
| `BatchProcess` / `BatchWorker` (`Editor/Kismet/Private/Commandlets`) | Fan-out across asset jobs |
| `SemanticSearchIndex` | Binary search index |

- **`Plugin` commandlet:** only enables or disables plugins.
- **Other console commands:** `AssetManager.FindDepChain`, `FindDepClasses`, `DumpAssetDependencies`.
- **`UnrealPak`:** `-ExportDependencies=`.

#### 6. Stringify, text export, AI
- **`UnrealAssetStringify.exe`:** ships in `Binaries/Win64`. Source is in source builds only (`Source/Programs/UnrealAssetStringify`). It links only Core, CoreUObject, Projects and JsonObjectGraph, and reads via `FLinkerLoad`.
- **Library:** `Runtime/Experimental/JsonObjectGraph`. Python access is through `UJsonObjectGraphFunctionLibrary::Stringify`, marked EXPERIMENTAL.
- **T3D:** `UExporter` and the `*ExporterT3D` classes exist. `UAssetExporter` does not exist under the two class folders I searched.
- **AI plugins (all `Experimental/`, all Experimental flag, all off):**
  - `ModelContextProtocol`: an HTTP server (default port 8000), with `ModelContextProtocolToolsetRegistryAdapter` exposing toolsets. `-ModelContextProtocolStartServer` overrides the commandlet auto-start skip.
  - `ToolsetRegistry`: `UToolsetRegistrySubsystem`, `meta=(AICallable)`.
  - `AIAssistant`: a browser client driven by `MainUrl`. I found no index in it.
  - `Toolsets/*`: `UPluginToolset::GetPluginDependencies`, `GetPluginDependents`, `GetPluginForAsset`, and `asset.py` `get_dependencies`, `get_referencers`.
  - `SemanticSearch`: BM25 plus vector search with asset processors only ("very early work in progress"). `Editor/AssetSearch` (Beta) is similar.
- **Name searches:** `EpicDeveloperAssistant`, `CodeIndex`, `SymbolIndex` and `MCPServer` matched no filenames. "EDA" appears only in the `MCPClientToolset` description.

#### 7. Other generic pieces
- **`Developer/VisualGraphUtils`:** `FVisualGraph::DumpDot`, a generic node/edge model that writes DOT.
- **`Experimental/GameplayGraph`:** a graph model with algorithms, aimed at gameplay.
- **`Developer/CookMetadata`:** `FCookMetadataPluginHierarchy`, a plugin DAG with sizes after cooking.
- **`Editor/BlueprintHeaderView`:** on by default, a view of Blueprints as headers.
- **`BlueprintStats`, `Experimental/EditorDataStorage`:** neither is an architecture tool.
- **Insights callers/callees:** runtime traced data only.

#### 8. Programs
- **UBT `-Mode=Analyze`** (`Modes/AnalyzeMode.cs`): writes `.Dependencies.gexf`, `.ShortestPath.gexf`, `.txt`, `.csv` and `.External.csv` beside the target receipt.
- **UBT `-Mode=JsonExport [-OutputFile=]`:** per-module Public, Private, DynamicallyLoaded and include-path dependencies, circular references, runtime dependencies, directory and rules file. It has no plugin field in the fields I read.
- **UBT other modes:** `GenerateClangDatabase`, `IWYU`, `WriteDocumentation`.
- **UHT `-Json`:** `UhtJsonExporter`, enabled through `-{exporter.Name}`. Writes reflected types per module.
- **UAT:** `ListThirdPartySoftware`, `AnalyzeThirdPartyLibs`, `BuildGraph`. `Scripts/PluginHierarchy.cs` is a descriptor-only helper, not a command. No command is named for module dependencies.
- **Source-build only, no shipped binary:**
  - `IoStoreDependencyViewer`: cooked-container dependencies with a plain Slate `SDependencyGraphPanel`.
  - `IncludeTool`.
  - `ShaderAuditViewer`.
- **Thin coverage:** Horde got a filename search only. `EpicGames.Build` got a listing plus `EnumeratePlugins.cs`. `EpicGames.UBA` was listed only.

#### 9. Key question
**Is there a unifying framework? No.** `FAssetIdentifier` only models packages, primary assets and searchable names. ToolsetRegistry/MCP is transport, not a data model.

Join keys do exist, so external unification is straightforward:
- `FPluginDescriptor.Modules` (plugin to module)
- `IPluginManager::GetModuleOwnerPlugin` (module to plugin)
- `FPackageName::TryConvertScriptPackageNameToModuleName` (`/Script/X` to module)
- `ModuleRelativePath` metadata via `FSourceCodeNavigation::FindClassHeaderPath` (reflected type to header)

**Is SGraphEditor usable outside Editor? Effectively no.**
- It is declared in `Editor/UnrealEd/Public/GraphEditor.h`.
- `GraphEditor.Build.cs` allows `TargetType.Program` but privately needs UnrealEd, Kismet and Persona.
- No `Source/Programs` Build.cs in either tree references it.

**Can it run headless?** The data can; the graph UI cannot.

**Does anything read C++ function bodies or calls? No call-edge extractor exists.**
- UHT parses headers and skips declarations it doesn't handle.
- `CodeView` gets symbol names only.
- `FKismetBytecodeDisassembler` reads Blueprint bytecode, not C++.
- `IncludeTool::FindReferences` (source-build only) is the nearest thing. It is a token scan classifying symbol use as `Opaque` or `RequiresDefinition`, for include cleanup.
- No libclang or tree-sitter parser turned up in `Source/Programs` or `Source/Developer`.
- **Coverage limit:** the full-text scan of `Plugins/` timed out. I reran it on the relevant subtrees and all Build.cs files. Only `NNERuntimeIREE` and `TextureGraphEngine` matched, and I did not open them.

#### Availability
**Usable now, headless**
- UBT `Analyze` and `JsonExport`, and UHT `-Json`
- `-run=PythonScript`, `DumpAssetRegistry`, `PkgInfo`, `BatchProcess`
- `UnrealAssetStringify.exe`, `UnrealPackageTool.exe` (source in source builds only, not read)
- `GenerateClangDatabase`, which enables external clangd

**Usable only in Editor UI**
- Plugin Reference Viewer graph and Reference Viewer
- Plugin Audit, Class Viewer, Code View
- Insights views (standalone UI)

**Requires integration**
- A small commandlet wrapping `FPluginReferenceViewerUtils` (console commands only today)
- MCP/Toolset extension, since I found no module or symbol tools (MCP in commandlets is an opt-in path I did not verify)
- A joined node/edge store built from the sources above
- A viewer: `FVisualGraph` for DOT, or an external GEXF viewer

**Requires engine change**
- Module-to-module edges in `FDependsNode`
- Exposing `ScanForViolations`
- Decoupling `SDependencyGraphPanel` from `FIoStoreAssetInfo`, or `SGraphEditor` from UnrealEd

C++ call edges need neither integration nor an engine change. They need a new external indexer, for example clangd over the generated compile database.

## 5. UHT and reflection sweep

Condensed. UHT gives a complete reflected model without the Editor, but only for reflected types, and the built-in `-Json`
exporter fails on 5.8.3. If reflection facts are ever needed, a UBT-plugin exporter is the safer route. Everything here comes
from reading code; only the `-Json` failure was later measured.

Path roots: `$UHT` = `Engine/Source/Programs/Shared/EpicGames.UHT`, `$UBT` = `Engine/Source/Programs/UnrealBuildTool`.

#### 1. Model and parsing
- **Types (`$UHT/Types/`):** `UhtModule`, `UhtPackage`, `UhtHeaderFile`, `UhtStruct` (parent of `UhtClass`, `UhtFunction`), `UhtScriptStruct`, `UhtEnum`, `UhtProperty` plus `Properties/*`. Interfaces are `UhtClass` with a `ClassType` of Interface or NativeInterface.
- **Non-UCLASS classes:** confirmed not modeled.
  - UBT only passes headers matching `ReflectionMarkupRegex` (`$UBT/System/SourceFileMetadataCache.cs:137`).
  - The global `class` keyword only handles `I*` native interfaces (`UhtNativeInterfaceClassParser.cs:21`). Everything else goes to `SkipDeclaration`.
- **Ordinary methods:** not modeled, with one caveat. Inside a UCLASS they survive as raw tokens in `UhtClass.Declarations` (`[JsonIgnore]`), used for constructor, destructor, Serialize and getter/setter matching (`ParseStatement`, `TryGetDeclaration`).
- **Bodies:** `.cpp` files are never read, and UFUNCTION inline bodies are skipped (`UhtFunctionParser.cs:599`). Ordinary inline bodies may land in those raw tokens (inferred).
- **Includes:** partial. `UhtHeaderFile.IncludedHeaders` (`[JsonIgnore]`) keeps only includes that resolve to a header known to UHT (`AddReferencedHeader`), so it is not a full include graph.

#### 2. Exporters
- **Framework:** `[UnrealHeaderTool]` on the class, `[UhtExporter]` on a static `(IUhtExportFactory)` method. `UhtExporterOptions` is None, Default or CompileOutput (`$UHT/Tables/UhtExporterTable.cs`).
- **Exporters that exist:** CodeGen (default), Json, Stats (log only), ScriptPlugin. There is no Stubs, AngelScript or Verse exporter, and `ParseAndCodeGen` does not exist.
- **Command:** `UnrealBuildTool -Mode=UnrealHeaderTool <uproject> <manifest> -NoDefaultExporters -Json` (or `"-Target=..."`).
  - Exporter switches are `-<Name>` and `-no<Name>` (`UhtSession.cs:1442`).
  - `-NoOutput` suppresses everything except `-WriteRef` output (`SaveIfChanged`).
- **Json output:** indented `<OutputDirectory>/<ShortName>.json`, one per module, including engine modules (no `SaveExportedHeaders` filter). It contains Packages and Children; headers and includes are excluded.
- **Why Json fails (static inference, later confirmed by measurement):**
  - `UhtType.EngineClass` isn't ignored, and `UClass.EngineClass` points to itself, so the serializer hits a cycle.
  - `UhtModule.Linking` is a dictionary keyed by `UhtModule`, always set by `StepLinkModules`.
  - No `-Json` callers were found in Shared or UBT.

**Third-party UBT plugins work without engine changes, including on a launcher engine:**
- Put `*.ubtplugin.csproj` under `<EnabledPlugin>/Source/`. A file directly in project `Source/` is found but never enabled (`SetupUbtPlugins`, `UEBuildTarget.cs:6051`).
- It compiles automatically through `BuildUbtPlugins`, then `dotnet build` (`CsProjBuilder`), with `EngineDir` passed as a global property. Build records go in `<project>/Intermediate/ScriptModules.UBT`.
- The launcher ships SDK 10.0.203, `UnrealEngine.csproj.props` and `EpicGames.UHT.dll`.
- `ModuleName` is mandatory. That module must be in the manifest, meaning it has reflected headers, or the exporter is skipped (`StepExport`).
- `UhtTables.IsUhtPlugin` qualifies the assembly, and it then appears in the manifest's `UhtPlugins`.
- The template is `Engine/Plugins/ScriptPlugin/Source/ScriptGeneratorUbtPlugin` in a source build.
- **Caveats:**
  - Two or more plugins write `Engine/Intermediate/Build/EpicGames.ScriptBuild.props` into the engine.
  - `BuildUbtPluginsInternal` ignores its computed `ToBuild` and `BuildFlags`, which looks like a bug.
- **Inferred, untested:** a scratch manifest copy with `UhtPlugins` edited could load an exporter with no project change.

#### 3. Inputs
- **Creator:** `UHTExecution.WriteUHTManifest`, only when UHT needs to run, or via `-Target`.
- **Location:** `Intermediate/Build/<Platform>/<Target>/<Target>.uhtmanifest`.
- **Shape:**
  - Top keys: `ExternalDependenciesFile, IsGameTarget, Modules, RootLocalPath, TargetName, TargetSettings, UhtPlugins`.
  - Module keys include `Name, ModuleType, BaseDirectory, IncludePaths, OutputDirectory, ClassesHeaders, PublicHeaders, InternalHeaders, PrivateHeaders, PublicDefines, ModuleDependencies, SaveExportedHeaders`.
  - `UhtPlugins` is empty for a project without UBT plugins.
- **Sidecars:** `.uhtpath` (DLL path), `.uhtsettings` and `.uhttimestamps` (binary), `.deps`.

#### 4. Build artifacts a project already has

| Artifact | Shape | Generated by |
|---|---|---|
| `Inc/<Module>/UHT` under the project and plugin intermediates | `.generated.h` and `.gen.cpp` | UHT CodeGen; `.conflict` files come from `-FailIfGeneratedCodeChanges` |
| `*.dep.json` | `Version`, `Data{Source, Includes, PCH, ...}` | Build. `Includes` lists per-source includes, the closest thing to a native include graph |
| `Binaries/<Platform>/<Target>.target` | Receipt with `BuildPlugins` | UBT |
| `Binaries/<Platform>/<Target>.json` | Module graph | The `-Mode=JsonExport` default path |
| `Intermediate/TargetInfo.json` | `Targets[]` | The `-Mode=QueryTargets` default path |
| `Intermediate/Build/BuildRules/` | Rules assembly, manifest with `EngineVersion` and `SourceFiles` | UBT rules compile |

- The launcher's `Inc/Engine/UHT` has `.generated.h` and no `.gen.cpp`, so engine metadata can't be scraped from generated files.
- `-Mode=GenerateProjectFiles -VSCode` writes `.vscode/compileCommands_<Project>.json` (`VSCodeProjectFileGenerator.cs`). Entries are `file`, `directory` and `arguments: [cl.exe, @rsp]`, and include `.h` and `Build.cs` entries. The file goes stale with the engine version it was generated for. `-Mode=GenerateClangDatabase` is the alternative.

#### 5. Native vs reflected split
- **Without the Editor:**
  - Reflected types and metadata (`UhtMetaData`; `#if WITH_METADATA` blocks in `.gen.cpp`).
  - Blueprint exposure: `BlueprintCallableSpecifier` sets `EFunctionFlags.BlueprintCallable`, and `.gen.cpp` stores flags as hex.
  - Registration declarations (`FRegisterCompiledInInfo`, `Z_CompiledInDeferFile_*`).
- **Requires UE:** live `UClass` iteration, CDO defaults and Blueprint classes (inferred from what UHT parses).
- **Commandlets:**
  - `-run=GenerateBlueprintAPI`: Blueprint actions as JSON in `Saved/Commandlets/`.
  - `-run=DumpArchetypeInfo <label>`: class plus CDO JSON, only for `BlueprintType` classes.
  - `DumpBlueprintsInfo`: removed, it just logs an error.
- **All-types dump:** none found. `GenerateTypeInfo`, `GenerateTypeScript`, `DumpClasses` and `unreal_stub` have no matches in Editor, Developer, Engine, CoreUObject or PythonScriptPlugin sources.
- **Console:** `obj classes`, `LISTPROPS`, `LISTFUNCS` (`Obj.cpp`).

#### 6. Python stubs
- `FPyWrapperTypeRegistry::GenerateStubCodeForWrappedTypes` writes `<ProjectIntermediate>/PythonStub/unreal.py` (`PyWrapperTypeRegistry.cpp:3307`).
- **Triggers:**
  - Editor startup with `bDeveloperMode`, not in commandlets (`FPythonScriptPlugin::GenerateStubCode`).
  - `-run=PythonOnlineDocs` with `-IncludeEngine`, `-IncludeInternal`, `-IncludeProject`, which also writes Sphinx files.

#### Unknowns
- UHT runtime on a large project.
- Whether a UBT plugin's NuGet restore works offline.
- `-run=PythonScript` arguments.
