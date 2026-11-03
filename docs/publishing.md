# Publishing safely

This repository is public, and analysed projects may be private. A push must carry no data from an analysed project
and no private identifier of the maintainer. The ignore rule on `workspace/` reduces the risk; it is not the guard.

## The pre-push hook

`.githooks/pre-push` checks every commit a push would add:

- author and committer equal this clone's `user.name` and `user.email`;
- both dates are UTC (+0000);
- no changed path is under `workspace/`;
- no binary file;
- no line of a changed file, no commit message line and no path matches a private pattern.

It reports commit, path and line, never the matched text. It fails closed when its patterns file is unset, missing,
has no active pattern, or holds an invalid one. It strips CR from the patterns, because a CRLF file would otherwise
silently match nothing.

Set it up once per clone:

```bash
git config core.hooksPath .githooks
git config laniakea.forbiddenPatternsFile <path outside the repository>
```

The patterns file holds one extended regular expression per line; `#` starts a comment. It contains the identifiers
that must never appear: real names, personal email addresses, private project, plugin and module names, local path
roots. It never contains the repository's own account handle, which the repository names legitimately. It is never
committed, since a list of identifiers would itself leak them.

Commit with `TZ=UTC` set, or the hook refuses the local offset.

## The leak gate

Hooks can be missing, bypassed or misconfigured, so this manual check runs before every push:

```bash
p="$(mktemp)"
tr -d '\r' < "<patterns file>" | grep -Ev '^[[:space:]]*(#|$)' > "$p"
git log --all --format='%an|%ae|%cn|%ce' | sort -u                     # only the repository identity
git log --all --format=%ad --date=format:%z | sort -u                  # +0000 for every new commit
git log --all --name-only --format= | sort -u                          # review every path
git log --all --format=%B | grep -c -i -E -f "$p"                      # 0
git grep -l -I -i -E -f "$p" $(git rev-list --all)                     # prints nothing
rm -f "$p"
```

Also review tag metadata with `git for-each-ref --format='%(taggername)|%(taggeremail)|%(taggerdate)' refs/tags`.
Screenshots come from `sample/` only, with no window titles or local paths, and with metadata stripped. GitHub's email
privacy settings stay on, including blocking command-line pushes that expose an email.
