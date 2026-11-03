# AGENTS.md - Laniakea

Laniakea reads an Unreal C++ project and renders its structure as a regenerable graph. It treats every analysed project as a
black box: the project is read, never changed, and everything learned about it stays in this clone's ignored `workspace/`.
Architecture: [docs/architecture/README.md](docs/architecture/README.md).

## Privacy (never violate)

This repository is public. An analysed project may be private, and its owner may not want to be linked to this tool.

- Tracked files never contain data from an analysed project. That covers code, names, paths, logs, screenshots, receipts and
  identifying counts. Examples, fixtures and screenshots come from the synthetic `sample/` only.
- Project data lives only under `workspace/`. Never stage, force-add or copy anything from it, and never weaken the ignore
  rule. Keep browser snapshots and screenshots of a real project outside this clone.
- Ignore rules do not guarantee privacy. Every push passes the hook and the leak gate in
  [docs/publishing.md](docs/publishing.md).
- Commits use the identity already set in this clone's local Git config. Never change `user.name`, `user.email` or remotes,
  and never copy identity from another clone.
- No network at runtime: no CDN, web fonts, analytics or update checks. The server binds `127.0.0.1` only.

## Working rules

- Python 3.9+ standard library only, so a machine with Unreal installed needs nothing extra.
- Core, shards, schema and viewer stay language-neutral. Unreal-specific logic lives in `laniakea/unreal/`.
- The tool writes nothing into an analysed project. The only changes allowed there are Unreal Build Tool's own caches, listed
  in [docs/architecture/unreal-profile.md](docs/architecture/unreal-profile.md); the engine integration test enforces it.
- Never run `-Mode=GenerateClangDatabase` against an analysed project. On a launcher engine it rewrites the project's live
  build intermediates.
- ASCII only in documentation.
- Commits and pushes belong to the maintainer. Agents run them only when the current request names the operation.

## Commands

```text
python laniakea.py up <project>          extract, then serve; <project> is a .uproject, its folder, or a target id
python laniakea.py extract <project>     [--engine <root>] [--name <id>] [--target <name>]
python laniakea.py serve                 [--port <n>] [--no-browser]
python -m unittest discover -s tests     whole suite; engine tests run when the sample's engine resolves
python tests/record_fixture.py           re-record fixtures/sample.ubt.json after changing the sample
```

Set `LANIAKEA_TEST_ENGINE=<engine root>` to run the engine tests against a specific engine. The hook setup is in
[docs/publishing.md](docs/publishing.md).
