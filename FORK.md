# This fork's patches

This fork carries patches to scriptc that light (and the apps built on it) need before a scriptc
release has them. Each patch is one branch on top of an upstream release tag, so it can be offered
upstream as a pull request on its own; this file lives on its own branch too, `fork-docs`.
`light-integration` is the release tag with every patch and this file merged; it is the compiler
light's native build runs (`SCRIPTC=...`, see light's `native/README.md`).

Current base: **v0.3.4** (`b5f73477`). Published 0.3.4 still has the problems all four fix.

## The patches

| Branch | What it changes | Files | Tests | Why light needs it | Upstream |
|---|---|---|---|---|---|
| `ts-unknown-fields` | A TypeScript class field declared `unknown`, `object` (either with `null` or `undefined`), or an array of those compiles, in the checked-dynamic storage JavaScript fields already use, instead of SC1090 "'unknown'-typed class fields". Parameter properties follow the same rule; `any`, other dynamic types (a `WeakMap`) and static fields stay refused. | `packages/compiler/src/frontend/lowering/lower-classes.ts` (`declaresUnknownField`, the two refusal sites), `lowerer.ts` (a comment) | corpus `4944-ts-unknown-fields.ts` and its ts7 order baseline; diagnostics fixtures `deferred-class-binding/crate.ts` (now a `WeakMap` field) and `json-dyn.ts`, with their snapshots | The template engine is host-agnostic: template values, host nodes and committed values are `unknown`. | not filed (#50 is an older PR for the same need) |
| `generic-method-slots` | When a write can replace methods by name, a method read through a receiver whose class can hold a generic class, a generic instantiation, a mixin instance or a subclass of one checks the instance's property bag for an own entry and falls back to the declared method, instead of reading the bag alone (those classes have no prototype data behind it, so the read gave `undefined`: "is not a function"). A method really replaced on one instance stays replaced. These reads no longer build the base class's prototype data (it broke a later `Object.keys`). Replaces the v0.3.2 version, which kept native dispatch for the whole family and so ignored real replacements, on plain base instances too. | `packages/compiler/src/frontend/lowering/class-prototypes.ts` (`prototypeMethodRead`), `class-callbacks.ts`, `class-dynamic-dispatch.ts` (two reads) | corpus `4945-generic-method-slots.ts` and its ts7 order baseline | `Signal<T>` and `Computed<T>` crashed natively ("this._track is not a function") whenever the program held a write that makes methods replaceable. | #963 (the same bug) |
| `census-typed-keys` | The method census reads a computed key's type as written (`slots[i as number]`, `slots[k!]`) when it decides between a number key, a symbol key and a key that can be any string. Literal names still come from the operand, so `target[k as string]` with `k: "a" \| "b"` still names only `a` and `b` (the v0.3.2 version lost them). | `packages/compiler/src/frontend/lowering/class-method-mutations.ts` | three tests in `packages/compiler/test/class-method-mutations.test.ts` | One such write in light (`oldParts[(oldIndex as number)] = null`) made all 176 methods dispatch dynamically, about seven times slower. | not filed |
| `census-report` | Coverage reports writes that make methods replaceable as slow paths (SC7001, a new SC7xxx band of notes) with the methods they affect and a hint; every such site is listed. `--fail-on=slow-paths` fails on them and on blockers. The diagnostics envelope gives them a `slow-path` category and `warning` severity; the coverage and CLI docs describe them. | `class-method-mutations.ts` (`noteAnyMethodWrite`), `frontend/lowering/slow-paths.ts` (new), `lowerer.ts` (`anyMethodWriteSites`, `slowPaths`), `frontend/analysis.ts`, `coverage/report.ts`, `diagnostics/diagnostic.ts` (`replaceableMethodsDiag`), `diagnostics/envelope.ts`, `cli/command.ts`, `cli/usage.ts`, `docs/content/docs/{coverage,cli}.mdx` | `tests/harness/coverage.test.ts` (two tests), fixtures `coverage-fixtures/slow-paths.ts` and `no-slow-paths.ts`, snapshot `coverage-slow-paths.txt`, `envelope.test.ts` | Coverage said "fully static" while every call was several times slower. light's and the harness's coverage gates run `--fail-on=slow-paths`. | not filed |

On v0.3.2 `census-typed-keys` and `census-report` were one branch, `census-report`; they are split so each can be offered upstream on its own. `light-integration-v0.3.2` keeps the old combination.

Not in `light-integration`: `js-class-callbacks` (an experiment on the old `7ffc2d93` base: JavaScript
methods join the method-write census). It slows light's benchmark about twofold, so it stays out.

Upstream context: vercel-labs/scriptc#934 (JSDoc-typed JavaScript classes compile 70 to 160 times
slower than the same TypeScript), which is why light moved to TypeScript and needed these patches.

For pull requests, each patch is also cherry-picked onto upstream `main` as `pr/<branch>` (no
conflicts on `1b3ed0bc6`).

## Building the fork for development

The CLI runs from source (`packages/cli/dist/main.js`); light's tools reach it through a wrapper,
`~/.local/bin/scriptc-dev`:

```
#!/usr/bin/env bash
SCRIPTC_NO_CACHE=1 exec node /home/alanleal/Projects/scriptc/packages/cli/dist/main.js "$@"
```

`SCRIPTC_NO_CACHE=1` matters: the build cache is keyed by the compiler's version, not its source,
so a patched compiler would otherwise replay binaries the unpatched one built.

Three pieces must match the compiler's version (`packages/cli/package.json`):

1. **The compiler**: `pnpm install` (when the lockfile changed), then `pnpm build`. Use the pnpm
   version upstream's CI pins (`npx -y pnpm@11.1.3 install --frozen-lockfile`); pnpm 10 rejects the
   lockfile's `patchedDependencies` hash.
2. **The runtime pack** (`packages/runtime-linux-x64-gnu`, built from `packages/runtime` C sources
   with zig 0.16.0):
   ```
   PATH=$HOME/.local/zig/zig-x86_64-linux-0.16.0:$PATH pnpm --filter @scriptc/runtime-linux-x64-gnu run build:native
   ```
3. **The LLVM helper** (`packages/llvm-linux-x64-gnu/bin/scriptc-llvm-codegen`, gitignored): the
   published binary for the same version, since its source (`native/`) rarely changes. It embeds
   its version; a mismatch fails every build with SC3003.
   ```
   cd "$(mktemp -d)" && npm pack @scriptc/llvm-linux-x64-gnu@<version> && tar xzf scriptc-llvm-linux-x64-gnu-<version>.tgz
   cp package/bin/scriptc-llvm-codegen ~/Projects/scriptc/packages/llvm-linux-x64-gnu/bin/
   ```
   Check first that `git diff --stat v<old> v<new> -- native/` is empty; if the helper's source
   changed, the published binary is still right for an unpatched helper.

`scriptc-dev --version` then prints the new version.

## Re-patching on a new scriptc release

```
cd ~/Projects/scriptc
git fetch upstream --tags                       # upstream = https://github.com/vercel-labs/scriptc.git
NEW=v0.3.5 OLD=v0.3.4                           # the new tag and the current base

BRANCHES="ts-unknown-fields generic-method-slots census-typed-keys census-report"

# 1. Is a patch already upstream? Each prints nothing once its change is in NEW.
for b in $BRANCHES; do echo "== $b"; git cherry $NEW $b; done
git log --oneline $OLD..$NEW -- packages/compiler/src/frontend/lowering/lower-classes.ts \
  packages/compiler/src/frontend/lowering/class-callbacks.ts \
  packages/compiler/src/frontend/lowering/class-method-mutations.ts

# 2. Move each remaining patch, and this file, onto the new tag (resolve conflicts per branch).
#    Drop a branch from BRANCHES (and from the table above) once step 1 shows it upstream.
for b in $BRANCHES fork-docs; do git rebase --onto $NEW $OLD $b; done

# 3. Rebuild the combined branch, then update "Current base" in this file on fork-docs.
git branch -f light-integration $NEW && git checkout light-integration
git merge --no-edit $BRANCHES fork-docs

# 4. Rebuild: compiler, runtime pack, LLVM helper (above).
```

Then verify, in this order:

1. The patches' own tests:
   ```
   SCRIPTC_TEST_WORKERS=2 pnpm exec vitest run tests/harness/llvm-differential.test.ts -t '494[45]'
   pnpm exec vitest run tests/harness/coverage.test.ts tests/harness/diagnostics.test.ts \
     packages/compiler/test/class-method-mutations.test.ts packages/compiler/src/diagnostics/envelope.test.ts
   ```
2. The whole corpus, in six parallel shards (one test file runs in one worker, so
   `SCRIPTC_TEST_WORKERS` alone does not parallelize it; about 40 minutes):
   ```
   for i in 1 2 3 4 5 6; do SCRIPTC_TEST_SHARD=$i/6 pnpm exec vitest run tests/harness/llvm-differential.test.ts > shard-$i.log 2>&1 & done; wait
   grep -hE '^\s+× ' shard-*.log
   ```
   Any failure must also fail on the bare tag (`git checkout $NEW`, rebuild, run it with `-t`).
   On v0.3.4 with node 25 the same 82 programs fail with and without the patches (node 24
   behaviors the corpus pins: crypto, zlib, URL, fs, streams, `node24-*`, `process-version-pin`).
   The sanitized lane (`SCRIPTC_SAN=1`) needs a clang that reads LLVM 22's IR; Ubuntu's clang 14
   fails on every program.
3. light, with this compiler: `SCRIPTC=scriptc-dev npm run verify` in `~/Projects/light`, then
   `native/pty.sh` and `node native/bench.js` against the binary.
4. The harness: `SCRIPTC=scriptc-dev npm test`, `npm run coverage`, `npm run build`, and
   `scripts/desktop.sh --selftest` in `~/Projects/writting-harness`.
5. Check published `scriptc@<version>` against each patch's corpus program; when one passes
   unpatched, drop that branch from the list.
