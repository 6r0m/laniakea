# Prior art

Tool choices for Windows, evaluated module ownership and semantic code references. The
[research reports](prior-art-audits.md) record the 2026-11-02 investigation. Current extraction uses LLVM libclang;
see the [native-analysis contract](architecture/unreal-profile.md#native-symbol-analysis).

| Candidate | License | Verdict |
|---|---|---|
| Unreal Build Tool `-Mode=JsonExport` and `.uplugin` | Engine | **Reused**: the evaluated module graph and plugin ownership |
| LLVM libclang | [Apache-2.0 with LLVM exceptions](https://llvm.org/docs/DeveloperPolicy.html) | **Reused** for opt-in native semantic facts, with AST-validated call roles and an isolated compiler copy |
| clangd and clangd-indexer | Apache-2.0 with LLVM exceptions | **Comparison/probe only**: text argument preparation and an optional adjacent-PCH regression, not the published symbol extractor |
| Cytoscape.js 3.x | MIT | **Reused** as the viewer library: compound graphs, Canvas, used by Nx and Mermaid |
| Prerendered Graphviz SVG per scope | EPL-2.0 engine | **Fallback option, not shipped**: no runtime library, but no live filtering |
| Sourcetrail fork | GPL-3.0 | Optional experiment only: sponsor-only Windows binaries, a heavy source build, an import SDK archived in 2021, no Unreal scale evidence |
| Doxygen | GPL-2.0 | Rejected as primary: static output, no custom hierarchy |
| CodeCompass | GPL-3.0 | Rejected: Linux only, LLVM 15 |
| scip-clang and Sourcegraph | Apache-2.0 and commercial | Rejected: no Windows, no clang-cl, no `@rsp`; the viewer is Enterprise |
| Kythe, Glean, Searchfox | Various | Rejected: Linux or WSL only |
| Repowise, GitNexus, tree-sitter graphs | Various | Rejected: not semantic; GitNexus is noncommercial |
| CodeQL, Understand | Commercial terms | Rejected: paid or restricted |
| Spyglass, Monolith, ue-codegraph-mcp | MIT, MIT, none | Rejected: `.uplugin`-only, or regex and tree-sitter heuristics |
| Epic Plugin Reference Viewer, Plugin Audit | Engine | Rejected: `.uplugin` and Asset Registry only, Editor UI only, no module or code edges |
| UHT `-Json` exporter | Engine | Rejected for now: reflected types only, and it fails on 5.8.3 with an object cycle |
| UBT `-Mode=Analyze` | Engine | Rejected: writes a pruned graph |
| Neo4j or a graph service | Various | Rejected as the primary graph store: canonical JSON remains authoritative; the disposable SQLite read index supplies compact topology and exact pages |

Other viewer libraries: React Flow (MIT) is the alternative, but its capacity beyond hundreds of nodes is unproven.
G6 v5 has open performance reports, and Sigma has no documented nesting. elkjs (EPL-2.0 or GPL-3.0-or-later) is
unnecessary while Cytoscape's built-in layouts suffice.
