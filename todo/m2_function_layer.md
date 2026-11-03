# Milestone 2 - classes, functions and calls

**Status:** NOT APPROVED. Starts only after M1 is accepted and the F1 gate is met.
**Scope:** module -> class -> function scopes with `inherits`, `overrides` and statically resolved `calls` edges, from clangd
over a compile database built in the tool's own copy of the project.
**Depends on:** [m1_build_graph.md](m1_build_graph.md) for decisions D1-D6, the workspace contract, the graph model and the
invariants. They are not restated here.
**Evidence appendix:** [evidence.md](evidence.md), sections 1, 3 and 5.

## Contents

- Goal
- Authority register
- Verified evidence
- Decision
- Realization
- Verification plan
- Completion criteria

## Goal

Drill from a module into its classes and functions, see inheritance, overrides and statically resolved calls, and jump to the
definition. The coverage of every fact must be honest.

## Authority register

Inherits D1-D6, Q1-Q4 and A1-A5 from M1.

- **A6 [ACTIVE]** The function layer is usable when a small known-good fixture, and a selected proof path in the private
  validation project, both have complete coverage, reported per module. Any broader threshold is a maintainer decision, made
  from those measurements. A single global percentage is not a bar, because it can hide a missing subsystem.
- **Q5 [OPEN - NON-BLOCKING]:** a source-built engine honours compile-database isolation natively. Is a second engine
  acceptable instead of the copy? Default: the copy (F2).

## Verified evidence

Measured on 2026-11-02 against the private validation project, at concurrency 8. Generic outcomes only (D6).

### Verified facts

**Tooling.**
- The official `clangd_indexing_tools-windows-21.1.8.zip` works on Windows. Its sha256 is
  `215195ea86801ae100c890bb853cf9cb1a0f9a5dead4a4ea987f92df96023a01`.
- `clangd-indexer --format=yaml` output has three parts:
  - Symbols.
  - Refs, each with Kind, Location and Container (the enclosing symbol).
  - Relations: BaseOf and OverriddenBy.
- UBT response files pin `-resource-dir` to the engine toolchain's clang. A newer indexer then degrades silently: rc=0, many
  errors, a stop at the error limit, and bogus operator refs. Two extra arguments fix this:
  `--extra-arg=-resource-dir=<indexer>/lib/clang/21` and `--extra-arg=/clang:-ferror-limit=0`.
- `IndexerMain.cpp` at tag `llvmorg-21.1.8` skips files it has already processed, and its `main` logs execution errors and then
  returns 0. So:
  - rc=0 proves nothing;
  - each file is indexed by one TU per run;
  - a failed TU can claim a shared header.
- LLVM documents the YAML format as for debugging and experiments. The binary format rejects non-current versions.
- `clangd` advertises call hierarchy over LSP, but `outgoingCalls` returned nothing without an index.

**Quality on a real plugin.**
- On a hand-checked method, most expected callees were present, including a cross-module call. One was lost to an incomplete
  type, and some refs pointed at IDs with no Symbol record.
- Class definition line, base class and override relation were correct.
- Removing a call in the copy and re-indexing that TU dropped the edge. Symbol IDs were identical before and after.
- In a non-unity, no-PCH index of one plugin of about 200 TUs, about a quarter of the TUs failed with `Failed to run action`.
  The named gaps were core engine types.
- Force-including the engine's shared editor PCH did not fix any failed TU.
- Feeding real MSVC response files to clang fails: clang reads MSVC-only flags as input files.

**Scale on that plugin.**
- About 3 minutes, 2.4 GB peak memory, 0.5 GB of YAML.
- About 2 percent of indexed symbols were project symbols; the rest were engine symbols.

**Compile database on a copy.**
- `-Mode=GenerateClangDatabase` on a copy of the project, with `-OutputDir` inside it, needs about 10 s including UHT. It left
  the original untouched.
- Exporting with JsonExport from the copy and from the original gave matching dependency, definition and PCH fields.
- Copy traps:
  - a `Build.cs` can read project files at rules time, such as data schemas;
  - source folders named like data folders can hold real headers;
  - many `Build.cs` files use file or process APIs.

  A denylist copy is needed, not an allowlist.
- A Git worktree is not a usable copy: it misses ignored plugins.

### Inferences

- The failed TUs come mostly from lost unity and PCH context. Real builds compile files together under a shared PCH wrapper,
  while the compile database forces non-unity `-NoPCH`.
- Failed TUs still yield partial facts. They can lose real edges, and could invent edges through error recovery.
- Scoped views stay small after filtering to project classes and functions.

### Assumptions / unverified areas

- The root cause of each failed TU. Three unity probes failed mechanically and prove nothing either way.
- Time and memory of a full-project run.
- Symbol ID stability across different checkout paths.
- Network silence of the clangd tools: no packet capture was taken.

## Decision

```text
<project> --denylist copy--> workspace/targets/<id>/copy/  (copy marker)
                               -> UBT GenerateClangDatabase -OutputDir=<copy>
                               -> pinned clangd-indexer YAML (workspace/tools/)
                               -> normalize: status per TU, remap <copy> to <project>, engine symbols to boundary nodes
                               -> class and function scopes in the same run folder
```

**Failure policy (D2).**
- Ignore the indexer's exit code. Take TU status from `Failed to run action on <file>` and the `[n/N]` count.
- Index clean TUs first and label their facts `resolved`.
- Index each failed TU alone, label its facts `partial`, and badge the node.
- Nothing from Clang is labelled `verified`: a TU can finish with wrong or missing references, and static resolution is not a
  runtime call.
- Always publish with coverage. Abort only on a tool hash mismatch, a TU count mismatch, or an unknown record type.

**Quality measures (D2).** Four are reported separately, per module: index execution, diagnostics, symbol resolution, and
relationship correctness against known-good cases. No single percentage stands in for them.

**Alternatives considered.**
- Feeding real MSVC response files to clang directly. It needs no copy, but needs a flag translator. Not recommended unless F1
  shows it is cheaper.
- A source-built engine (Q5).

## Realization

**F1. Parse-quality spike: the gate for everything below.** Run on the workspace copy.
1. Diagnose first. Take representative failed TUs across modules and establish the actual root cause of each. A blind
   force-include already failed, so no remedy is chosen before this step.
2. Then try remedies that fit the causes. Two examples:
   - a per-TU `/FI` of the UBT PCH wrapper header;
   - `-Mode=Build -Compiler=Clang -WriteOutdatedActions` on a never-built copy, with `/Yu` and `/Fp` stripped.
3. Report the four quality measures per module.

Stop when A6 is met. If it cannot be met, the maintainer decides whether to accept the measured state or stop at M1.

**F2. Denylist copy.** Mirror the project into `workspace/targets/<id>/copy/`, excluding `Content`, `Binaries`,
`Intermediate`, `Saved`, `DerivedDataCache`, `.git`, `node_modules` and asset suffixes. Everything else is copied, because a
`Build.cs` may read it. Extra excludes per project go in `target.json`. The copy carries a marker file the tool wrote.

**F3. Guards.**
- Refuse `GenerateClangDatabase` unless the project sits inside the workspace copy and carries the marker, on any engine type.
- Export from the copy and from the original, and fail if dependency, definition or PCH fields differ.
- After the run, confirm the original is untouched: makefile hash, response-file set, and no newer files in its
  intermediates.

**F4. Compile database, on the copy only.**

```text
<engine>/Engine/Build/BatchFiles/RunDotnet.bat <engine>/Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll
  -Mode=GenerateClangDatabase <Target> Win64 Development -Project=<copy>/<Name>.uproject -OutputDir=<copy>
  -OutputFilename=compile_commands.json
```

**F5. Pinned indexer.** Fetch `clangd_indexing_tools-windows-21.1.8.zip` from `github.com/clangd/clangd/releases/tag/21.1.8`
into `workspace/tools/`. Abort unless the sha256 matches the value above.

```text
clangd-indexer --executor=all-TUs --execute-concurrency=8 --format=yaml
  --extra-arg=-resource-dir=<indexer>/lib/clang/21 --extra-arg=/clang:-ferror-limit=0 compile_commands.json
```

The download is a setup step the user starts. It never runs during `extract` or `serve`.

**F6. Normalize.** Apply the failure policy. Remap `<copy>` to `<project>`, keep project symbols, and collapse engine symbols to
boundary nodes. Unknown record types abort.

**F7. Viewer.**
- Add module -> class -> function scopes, status badges and source links.
- Label calls as statically resolved, not runtime calls.
- A cross-module call pair with no direct dependency is flagged for review with its transitive and public-exposure path. It is
  not reported as a violation.

**F8. Scale.** Measure one full-project run: time, peak memory, index size, shard size and frame time.

## Verification plan

Red cases:

| Case | Wrong behaviour today |
|---|---|
| R8 compile database on a real checkout | A direct run corrupts live intermediates on a launcher engine (measured) |
| R9 rc=0 degraded indexer | The tool reports success on a degraded run (measured) |
| R10 failed TU claims a header | Facts are silently partial, with no attribution |

Permanent guards:
- refusal of `GenerateClangDatabase` outside the marked copy, on any engine type;
- tool hash mismatch aborts;
- TU count mismatch aborts;
- copy-fidelity failure aborts.

Green evidence, on the sample and then on the private proof path:

1. A class and a method are found by symbol ID.
2. Navigation module -> class -> method.
3. A source link opens the definition line.
4. A build edge and a call edge render as distinct types. A known call shows as `calls`, labelled `resolved`.
5. Editing a call in the project removes the edge after regeneration.
6. A module scope renders without engine symbols.
7. Every cross-module call pair has a declared dependency, or is flagged per F7.

## Completion criteria

- A6 met, or the maintainer accepts the measured state.
- Green items 1-7.
- The F8 measurement is recorded.
- Durable content has moved to `docs/`, and this file is removed.
