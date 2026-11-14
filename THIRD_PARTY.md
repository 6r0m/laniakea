# Third-party code

| component | version | license | where | provenance |
|---|---|---|---|---|
| Cytoscape.js | 3.34.4 | MIT, text in [viewer/vendor/cytoscape.LICENSE](viewer/vendor/cytoscape.LICENSE) | `viewer/vendor/cytoscape.min.js` | `dist/cytoscape.min.js` from the npm tarball `cytoscape-3.34.4.tgz`, unmodified, checked against the registry's sha512 integrity value |
| LLVM libclang | 21.1.8 | [Apache-2.0 with LLVM exceptions](https://github.com/llvm/llvm-project/blob/llvmorg-21.1.8/llvm/LICENSE.TXT) | supplied locally through `setup-symbols`, stored only in ignored workspace | native C indexing API and matching compiler resource headers |
| PMD CPD | 7.29.0 | [PMD BSD-style license and bundled component notices](https://github.com/pmd/pmd/blob/pmd_releases/7.29.0/LICENSE) | supplied locally through `setup-health`; libraries/notices remain in ignored workspace | optional strict C++ token-duplication analyzer; no PMD binaries are committed |
| Flatbush | 4.7.0 | ISC, [license](viewer/vendor/flatbush.LICENSE) | `viewer/vendor/flatbush.js` | unmodified UMD bundle from the npm tarball, checked against its sha512 integrity |
| Flatqueue | 3.1.0 | ISC, [license](viewer/vendor/flatqueue.LICENSE) | included in the Flatbush bundle | Flatbush's bundled priority queue |

PMD acknowledgement: "This product includes software developed in part by support from the Defense Advanced Research
Project Agency (DARPA)". Keep the supplied distribution's complete license and component notices with any redistributed
tools. Java is supplied separately under its distributor's terms. Laniakea's own code remains AGPL-3.0-or-later.
