# AGENTS.md - Laniakea

Laniakea reads an Unreal C++ project and renders its structure as a regenerable graph. It treats every analysed project as a
black box: the project is read, never changed, and everything learned about it stays in this clone's ignored `workspace/`.

## Privacy (never violate)

This repository is public. An analysed project may be private, and its owner may not want to be linked to this tool.

- Tracked files never contain data from an analysed project. That covers code, names, paths, logs, screenshots, receipts and
  identifying counts. Examples, fixtures and screenshots come from the synthetic `sample/` only.
- Project data lives only under `workspace/`. Never stage, force-add or copy anything from it, and never weaken the ignore
  rule.
- Ignore rules do not guarantee privacy. Every push first passes a leak gate that checks commit metadata, paths and text.
- Commits use the identity already set in this clone's local Git config. Never change `user.name`, `user.email` or remotes,
  and never copy identity from another clone.
- No network at runtime: no CDN, web fonts, analytics or update checks. The server binds `127.0.0.1` only.

## Working rules

- Python 3 standard library only, so a machine with Unreal installed needs nothing extra.
- Core and viewer stay language-neutral. Unreal-specific logic lives in the `unreal` profile.
- The tool writes nothing into an analysed project. The only change allowed there is Unreal Build Tool's own rules cache
  under `Intermediate/Build/BuildRules/`.
- Never run `-Mode=GenerateClangDatabase` against an analysed project. On a launcher engine it rewrites the project's live
  build intermediates.
- ASCII only in documentation.
- Commits and pushes belong to the maintainer. Agents run them only when the current request names the operation.

## Commands

None yet. The repository is in its design phase; see [README.md](README.md).
