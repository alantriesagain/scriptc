# This fork's patches

This fork carries patches to scriptc that light (and the apps built on it) need before a scriptc
release has them. Each patch is one branch on top of an upstream release tag, so it can be offered
upstream as a pull request on its own; this file lives on its own branch too, `fork-docs`.
`light-integration` is the release tag with every patch and this file merged; it is the compiler
light's native build runs (`SCRIPTC=...`, see light's `native/README.md`).

Current base: **v0.3.2** (`c3492505`). Published 0.3.2 still has the problems all three fix.

## The patches

| Branch | What it changes | Files | Tests | Why light needs it | Upstream |
|---|---|---|---|---|---|
| `ts-unknown-fields` | A TypeScript class field declared `unknown`, `object` (either with `null` or `undefined`), or an array of those compiles, in the checked-dynamic storage JavaScript fields already use, instead of SC1090 "'unknown'-typed class fields". Parameter properties follow the same rule; `any` and other dynamic types (a `WeakMap`) stay refused. | `packages/compiler/src/frontend/lowering/lower-classes.ts` (`declaresUnknownField`, the two refusal sites) | corpus `4944-ts-unknown-fields.ts`; diagnostics fixtures `deferred-class-binding/crate.ts` (now a `WeakMap` field) and `json-dyn.ts`, with their snapshots | The template engine is host-agnostic: template values, host nodes and committed values are `unknown`. | not filed |
| `generic-method-slots` | A class family with a generic class, a generic instantiation or a mixin instance keeps native dispatch even when a method name is observable. Before, such calls read the method from a prototype table those classes do not have and failed with "is not a function". | `packages/compiler/src/frontend/lowering/class-callbacks.ts` (`familyLacksPrototypeData`) | corpus `4945-generic-method-slots.ts` | `Signal<T>` and `Computed<T>` crashed natively ("this._track is not a function") whenever the program held a write that makes methods replaceable. | not filed |
| `census-report` | Coverage reports writes that make methods replaceable as slow paths (SC7001, a new SC7xxx family of notes) with the methods they affect and a hint; every such site is listed. `--fail-on=slow-paths` fails on them and on blockers. The method census also types a computed key as written, so `slots[i as number]` and `slots[k!]` are number keys. | `packages/compiler/src/frontend/lowering/class-method-mutations.ts` (typed keys, `noteAnyMethodWrite`), `frontend/lowering/slow-paths.ts` (new), `frontend/lowering/lowerer.ts` (`anyMethodWriteSites`, `slowPaths`), `frontend/analysis.ts`, `coverage/report.ts`, `diagnostics/diagnostic.ts` (`replaceableMethodsDiag`), `cli/command.ts`, `cli/usage.ts` | `tests/harness/coverage.test.ts` (two tests), fixtures `coverage-fixtures/slow-paths.ts` and `no-slow-paths.ts`, snapshot `coverage-slow-paths.txt` | One such write in light (`oldParts[(oldIndex as number)] = null`) made all 176 methods dispatch dynamically, about seven times slower, with coverage still saying "fully static". light's and the harness's coverage gates run `--fail-on=slow-paths`. | not filed |

Not in `light-integration`: `js-class-callbacks` (an experiment on the old `7ffc2d93` base: JavaScript
methods join the method-write census). It slows light's benchmark about twofold, so it stays out.

Upstream context: vercel-labs/scriptc#934 (JSDoc-typed JavaScript classes compile 70 to 160 times
slower than the same TypeScript), which is why light moved to TypeScript and needed these patches.

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

1. **The compiler**: `pnpm install` (when the lockfile changed), then `pnpm build`.
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
NEW=v0.3.2 OLD=v0.3.1                           # the new tag and the current base

BRANCHES="ts-unknown-fields generic-method-slots census-report"

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
   pnpm exec vitest run tests/harness/coverage.test.ts tests/harness/diagnostics.test.ts
   ```
2. The whole corpus, in six parallel shards (one test file runs in one worker, so
   `SCRIPTC_TEST_WORKERS` alone does not parallelize it; about 40 minutes):
   ```
   for i in 1 2 3 4 5 6; do SCRIPTC_TEST_SHARD=$i/6 pnpm exec vitest run tests/harness/llvm-differential.test.ts > shard-$i.log 2>&1 & done; wait
   grep -hE '^\s+× ' shard-*.log
   ```
   Any failure must also fail on the bare tag (`git checkout $NEW`, rebuild, run it with `-t`).
   On v0.3.1 with node 25 the same 18 programs fail with and without the patches (node 24
   behaviors the corpus pins: `node24-*`, `process-version-pin`, text codecs, `fs.statfs`).
3. light, with this compiler: `SCRIPTC=scriptc-dev npm run verify` in `~/Projects/light`, then
   `native/pty.sh` and `node native/bench.js` against the binary.
4. The harness: `SCRIPTC=scriptc-dev npm test`, `npm run coverage`, `npm run build`, and
   `scripts/desktop.sh --selftest` in `~/Projects/writting-harness`.
5. Check published `scriptc@<version>` against each patch's corpus program; when one passes
   unpatched, drop that branch from the list.
