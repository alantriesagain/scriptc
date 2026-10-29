# Updating the fork on a new scriptc release

`refork.sh` does the mechanical port. This checklist keeps the run short: do every branch edit before the one build, and ask for the expensive gates instead of starting them by habit.

## 1. Preflight, about 2 minutes

```
./refork.sh --check
```

It fetches upstream, prints the newest tag, refuses a ref whose `native/` moved without the matching LLVM helper, warns when the base already pins the fork's tsc-ts, and looks at `~/Projects/light` and `~/Projects/widecode` for uncommitted changes or a stale light package name.

Fix external drift before porting. The usual failure is light renaming its package (for example `@bootstrapp/light` to `@lightstart/light`) while widecode still names the old one; rename widecode's workspace dependencies, run `pnpm install` there, and commit or stash both checkouts. Verify in worktrees when another session is using those repositories.

Drop a patch from `PATCHES` in `refork.sh` when the preflight or FORK.md's recheck says upstream now covers it, then remove its table row.

## 2. Port the branches, 10 to 30 minutes

```
./refork.sh --no-build
```

Resolve each conflict, `git rebase --continue`, and rerun the same command until every branch and `light-integration` are rebuilt. Fix the patch branches while they are being touched: snapshots that intentionally change, `pnpm format`, and `pnpm lint` failures belong in the patch commit or a small follow-up on that branch, not in a later build cycle.

Check the focused programs against the published base when the answer is not obvious; `scriptc@<version>` in a scratch directory is faster than a source build.

## 3. Build once and run the focused gates, about 15 minutes

```
./refork.sh --tests
```

The script builds the compiler, the runtime pack and the published LLVM helper once, then runs the patch corpus, the diagnostics/envelope/runtime/workspace harness tests, the slow-path coverage tests, and `pnpm test:ts7 --baselines-only`.

If the build is already current, `./refork.sh --no-build --tests` uses it instead of rebuilding.

## 4. Coverage and the shipping corpus

```
./refork.sh --no-build --coverage
./refork.sh --no-build --corpus
```

The coverage sweep is six parallel shards and takes about ten minutes. The full corpus is six parallel shards and takes 40 to 80 minutes; run it only for a shipping gate, and say so before starting it. Logs land in a temporary directory, and a failure prints the failing tests while keeping the logs.

## 5. External projects

With `SCRIPTC=scriptc-dev`, run light's and widecode's gates. Prefer worktrees so another session's checkouts stay alone. A widecode `verify` covers the widecode app; the desktop app can have its own unsupported light-server APIs, which are scriptc limits rather than a failed rebuild.

## What made the v0.4.5 run slow

- The full corpus was started without asking and was aborted at 70 minutes; the focused gates had already found the real issues.
- Widecode's old light package name was discovered only during verification.
- Snapshots, formatting, and a lint fix each triggered another branch amend, refork, and rebuild.
- Full `verify` ran serially in widecode and light instead of targeted tests first.

The flags above make those mistakes choices instead of defaults.
