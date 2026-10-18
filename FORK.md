# This fork's patches

This fork carries patches to scriptc that light (and the apps built on it) need before a scriptc
release has them. Each patch is one branch on top of an upstream release tag, so it can be offered
upstream as a pull request on its own; this file lives on its own branch too, `fork-docs`.
`light-integration` is the release tag with every patch and this file cherry-picked on top, in the
order of the table below, so its log is the release's log plus one commit per change; it is the
compiler light's native build runs (`SCRIPTC=...`, see light's `native/README.md`). `refork.sh`
rebuilds all of it on a new release.

Current base: **v0.3.6** (`fab1a29b3`). Bare v0.3.6 still has the problems all eight fix.

## The patches

| Branch | What it changes | Files | Tests | Why light needs it | Upstream |
|---|---|---|---|---|---|
| `ts-unknown-fields` | A TypeScript class field declared `unknown`, `object` (either with `null` or `undefined`), or an array of those compiles, in the checked-dynamic storage JavaScript fields already use, instead of SC1090 "'unknown'-typed class fields". Parameter properties follow the same rule; `any`, other dynamic types (a `WeakMap`) and static fields stay refused. | `packages/compiler/src/frontend/lowering/lower-classes.ts` (`declaresUnknownField`, the two refusal sites), `lowerer.ts` (a comment) | corpus `4944-ts-unknown-fields.ts` and its ts7 order baseline; diagnostics fixtures `deferred-class-binding/crate.ts` (now a `WeakMap` field) and `json-dyn.ts`, with their snapshots | The template engine is host-agnostic: template values, host nodes and committed values are `unknown`. | issue #1147, PR #1151 (#50 is an older PR for the same need) |
| `generic-method-slots` | When a write can replace methods by name, a method read through a receiver whose class can hold a generic class, a generic instantiation, a mixin instance or a subclass of one checks the instance's property bag for an own entry and falls back to the declared method, instead of reading the bag alone (those classes have no prototype data behind it, so the read gave `undefined`: "is not a function"). A method really replaced on one instance stays replaced. These reads no longer build the base class's prototype data (it broke a later `Object.keys`). Replaces the v0.3.2 version, which kept native dispatch for the whole family and so ignored real replacements, on plain base instances too. | `packages/compiler/src/frontend/lowering/class-prototypes.ts` (`prototypeMethodRead`), `class-callbacks.ts`, `class-dynamic-dispatch.ts` (two reads) | corpus `4945-generic-method-slots.ts` and its ts7 order baseline | `Signal<T>` and `Computed<T>` crashed natively ("this._track is not a function") whenever the program held a write that makes methods replaceable. | issue #963 (the same bug), PR #1150 |
| `census-typed-keys` | The method census reads a computed key's type as written (`slots[i as number]`, `slots[k!]`) when it decides between a number key, a symbol key and a key that can be any string. Literal names still come from the operand, so `target[k as string]` with `k: "a" \| "b"` still names only `a` and `b` (the v0.3.2 version lost them). | `packages/compiler/src/frontend/lowering/class-method-mutations.ts` | three tests in `packages/compiler/test/class-method-mutations.test.ts` | One such write in light (`oldParts[(oldIndex as number)] = null`) made all 176 methods dispatch dynamically, about seven times slower. | issue #1148, PR #1152 |
| `census-report` | Coverage reports writes that make methods replaceable as slow paths (SC7001, a new SC7xxx band of notes) with the methods they affect and a hint; every such site is listed. `--fail-on=slow-paths` fails on them and on blockers. The diagnostics envelope gives them a `slow-path` category and `warning` severity; the coverage and CLI docs describe them. | `class-method-mutations.ts` (`noteAnyMethodWrite`), `frontend/lowering/slow-paths.ts` (new), `lowerer.ts` (`anyMethodWriteSites`, `slowPaths`), `frontend/analysis.ts`, `coverage/report.ts`, `diagnostics/diagnostic.ts` (`replaceableMethodsDiag`), `diagnostics/envelope.ts`, `cli/command.ts`, `cli/usage.ts`, `docs/content/docs/{coverage,cli}.mdx` | `tests/harness/coverage.test.ts` (two tests), fixtures `coverage-fixtures/slow-paths.ts` and `no-slow-paths.ts`, snapshot `coverage-slow-paths.txt`, `envelope.test.ts` | Coverage said "fully static" while every call was several times slower. light's and the harness's coverage gates run `--fail-on=slow-paths`. | issue #1149, PR #1153 |
| `generic-record-return` | A call of a JavaScript generic function (a JSDoc `@template`, or a generic type from a `.ts` file over a JavaScript body) whose instantiated return type does not map returns the checked-dynamic value a non-generic JavaScript function returns, instead of fencing the call with SC2009 (which names a member of the returned record). The call route, the pinned-value route and async generics (the promise ABI stays) share it; a result that is itself a generic function keeps its SC1090 fence, and TypeScript declarations keep their diagnostic. | `packages/compiler/src/frontend/lowering/generic-functions.ts` (`instanceReturnType`, `genericCallInstance`, `genericValueInstance`) | corpus `5791-jsdoc-generic-unmapped-return.js` and its ts7 order baseline | light's `defineModel(name, schema)` (`@template {ModelSchema} S`, returning `ModelApi<RowOf<S>, ModelSchema>`) fenced every model definition, while the same body behind a non-generic wrapper compiled. | not offered yet |
| `async-return-union` | `Promise.all`'s result holds `undefined` only where an entry is a hole or `undefined` (a typed promise settles with a value of its own type), instead of always. The old fact landed on the result's element type, so with `rows = await Promise.all(rows.map((row) => load(row, includes)))` the callback's `row`, `load`'s parameter and, through an early `return row`, `load`'s result widened to `Promise<T \| undefined>` while the callback's return became `Promise<T> \| undefined`: SC2003, and in JavaScript a deferred site plus SC9001 on a computed-key write in a loop over the result. `Promise.allSettled` keeps the old fact. A JavaScript array whose element type does not map (a dynamic value as a whole) no longer counts toward native arrays' facts outside a generic function or a class: one possibly undefined value stored into such an array (a `filter` over `Object.entries`) made every array in the program count as possibly undefined. A store or read at an index from `indexOf`/`lastIndexOf` on the same array, behind a test that rules out -1, is proven inside the array: such a store in a generic `Array<F \| null>` made every array in the program count as possibly holey. | `packages/compiler/src/frontend/lowering/runtime-optional-elements.ts` (`builtContents`), `lowerer.ts` (`arrayKeysUnsafe`, `inGenericScope`), `runtime-optional-bounds.ts` (`boundedBefore`, `searchesIndex`, `testsFound`, `testsMissing`, `exitsWhenMissing`) | corpus `4946-async-early-return-promise-all.ts`, `4947-async-early-return-promise-all.js`, `4948-js-unmapped-element-arrays.js`, `4956-indexof-store-bounds.ts` and their ts7 order baselines; two tests in `runtime-optional-bounds.test.ts`; one test in `packages/compiler/test/runtime-optional-precision.test.ts` | light's `loadRelationshipsForMany` gathers `loadRelationships` results with `Promise.all` and writes computed keys over them; it did not build natively. `types/validate.js`'s `virtual` filter over `[string, TypeDefinition]` entries widened the store's rows in every program that imports it, and `signals/listeners.ts`'s `delete` nulls a callback while the list runs. | not offered yet (the fact came in with #784) |
| `generic-unknown-fields` (on `ts-unknown-fields`) | A field typed by a type parameter (`_value: T`, `T \| null`, `T[]`, a parameter property) compiles when the instantiation binds the parameter to the checked-dynamic kind (`unknown`, `object`, and every argument that maps to it, such as a `WeakMap`, since they share one instantiation), in the storage a field declared `unknown` uses, instead of SC1090 "'unknown'-typed class fields (instantiating class 'X' with <unknown>)". `Box<any>` and fields declared `any` or `WeakMap` stay refused. | `packages/compiler/src/frontend/lowering/lower-classes.ts` (`declaresUnknownField`) | corpus `5813-generic-unknown-fields.ts` and its ts7 order baseline | `Signal<T>` is built with `unknown` values (the store adapter's `signal(value)`), so every signal the controller layer makes was refused. | a follow-up to issue #1147 and PR #1151 |
| `async-dynamic-return` | An async function with a typed result that returns a checked-dynamic value resolves its promise with that value, as JavaScript does, instead of checking the value against the result type directly (only statically typed promises were awaited first). A promise behind the value is adopted like a returned typed promise: the same microtask turns, after every crossed `finally`, outside the function's own `catch`; any other value settles the function at once, with no extra turn. Concise async arrow bodies follow the same rule. Before, such a return failed with "expected object at $, got Promise". | `packages/compiler/src/frontend/lowering/lowerer.ts` (`dynamicAsyncReturn`, `lowerReturnOf`, `lowerReturnValue`), `lower-functions.ts` (concise bodies) | corpus `4949-async-dynamic-returns.js` and its ts7 order baseline | light's store returned dynamic promises from typed async methods (`return uploadFiles(...)`, the adapter's `count` and `exists`); the model probe failed at its first `add`. | not offered yet |

On v0.3.2 `census-typed-keys` and `census-report` were one branch, `census-report`; they are split so each can be offered upstream on its own. `light-integration-v0.3.2` keeps the old combination.

Not in `light-integration`: `js-class-callbacks` (an experiment on the old `7ffc2d93` base: JavaScript
methods join the method-write census). It slows light's benchmark about twofold, so it stays out.

Upstream context: vercel-labs/scriptc#934 (JSDoc-typed JavaScript classes compile 70 to 160 times
slower than the same TypeScript), which is why light moved to TypeScript and needed these patches.

For pull requests, each patch branch is pushed to this fork (`origin`) as `pr/<branch>`, and
`main` on the fork is the upstream release itself; the numbers above are vercel-labs/scriptc's.

## Upstream after v0.3.6 (checked 2026-10-18, before v0.3.7)

Upstream wrote its own versions of three of these fixes and credited this fork with `Co-authored-by: Alan Leal`: #1208 (fixes #1147), #1218 (fixes #1148) and #1232 (fixes #934, JavaScript classes compile like TypeScript ones). PRs #1150 to #1153 are still open and unmerged. No release has the fixes yet: `upstream/main` (`f9682f3ed`) is 178 commits past v0.3.6 and still says 0.3.6, so the fork stays on v0.3.6 with every patch until v0.3.7.

Each patch's tests, run against an unpatched build of `f9682f3ed` (upstream's own corpus programs for the same fixes, 5930, 5932, 5933 and 5942, pass there):

| Branch | Upstream | On `f9682f3ed` | At v0.3.7 |
|---|---|---|---|
| `census-typed-keys` | #1218 | `slots[i as number]` and `slots[i!]` pass. `target[k as string]` with `k: "a" \| "b"` still makes every method replaceable (#1218 reads the asserted type for literal names too); light has no such write. | Drop |
| `ts-unknown-fields` | #1208 | 4944 passes except one field typed `(object \| null)[]` (#1208 does not look through a union inside an array). #1208 also covers static fields. Light has no such field. | Drop |
| `generic-method-slots` | #1215 (fixes #963) | Direct reads pass. A method read on a generic instance through a receiver typed as its non-generic base (`const asBase: Dep = new Box(4); asBase.track()`) still throws "is not a function". `Signal<T> extends Dep` has that shape, but light reads only fields through `Dep` (`dep._subscribers`). | Drop if light's verify passes without it |
| `generic-unknown-fields` | none | 5813 still SC1090. Its commit conflicts with #1208 in `lower-classes.ts`. | Port onto #1208's `classFieldStoresDyn` (in `lowerer.ts`); it no longer depends on `ts-unknown-fields` |
| `census-report` | none (#1149 open) | No slow-path report | Keep |
| `generic-record-return` | none | 5791 still SC2009 | Keep |
| `async-return-union` | none | 4946, 4947, 4948, 4956 and the Promise.all unit test still fail (SC2003, SC9001) | Keep; a conflict in `runtime-optional-precision.test.ts` only (both sides append a test) |
| `async-dynamic-return` | none | 4949: "expected object at $, got Promise" | Keep |

`census-report`, `generic-record-return` and `async-dynamic-return` cherry-pick cleanly onto `f9682f3ed`. `census-report`'s note uses SC7001, which the contracts checker already uses (SC7001 to SC7008, on v0.3.6 too), so #1153 needs another code either way.

Between v0.3.6 and `f9682f3ed`, `native/` changed only for WebAssembly (`emit.cpp`), so the published 0.3.6 LLVM helper builds that commit for linux-x64; `refork.sh` still refuses it as a base because `native/` moved.

At v0.3.7: rerun this check against the release, drop the branches above from `PATCHES` and `DEP` in `refork.sh` and from the table, port `generic-unknown-fields`, then run the whole verification below. Not yet done upstream, since it posts publicly: comment on #1151 and #1152 as superseded and report the three gaps above (`(object | null)[]` fields, base-typed receivers, literal keys under `as string`).

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
   lockfile's `patchedDependencies` hash. Over a pnpm 10 install it asks before replacing
   `node_modules`; without a terminal, add `--config.confirm-modules-purge=false`.
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

`./refork.sh [<ref>] [--no-build]`, from a clean checkout of this fork, does it:

1. Fetches upstream with its tags and takes the newest `v*` tag as the base, or `<ref>`. A ref past
   a tag is refused when `native/` moved since that tag: the published LLVM helper would no longer
   match. `main` becomes that commit, so a push of `main` mirrors upstream.
2. Keeps the old `light-integration` as `light-integration-prev`, then rebases every patch branch
   from its old base onto the new one (`generic-unknown-fields` onto the rebased
   `ts-unknown-fields`). A conflict stops the script inside that branch: resolve it, `git rebase
   --continue`, run the script again.
3. Writes the new base into this file on `fork-docs` ("Rebase the fork on <tag>").
4. Rebuilds `light-integration` as the base plus each patch's commits cherry-picked in the order of
   `PATCHES` in the script (the table's order, `fork-docs` last) and leaves the checkout on it.
5. Unless `--no-build`: `pnpm install` when the lockfile changed, `pnpm build`, the runtime pack
   with zig (`$ZIG` names the zig directory; the default is the path above), and the published LLVM
   helper for the new version when the one on disk reports another.

Before a run, `for b in <branches>; do git cherry <tag> $b; done` names the patches upstream took as
they are; step 5 of the verification below finds the ones it fixed another way. Drop such a branch
from `PATCHES` in the script and from the table.

After a run, push the same shape to this fork; every branch is rewritten, so the push is forced:

```
BRANCHES="ts-unknown-fields generic-method-slots census-typed-keys census-report generic-record-return async-return-union generic-unknown-fields async-dynamic-return"
git push -f origin main light-integration fork-docs $(for b in $BRANCHES; do echo $b:pr/$b; done)
```

Then verify, in this order:

1. The patches' own tests:
   ```
   SCRIPTC_TEST_WORKERS=2 pnpm exec vitest run tests/harness/llvm-differential.test.ts -t '494[4-9]|4956|5791|5813'
   pnpm exec vitest run tests/harness/diagnostics.test.ts \
     packages/compiler/test/class-method-mutations.test.ts packages/compiler/src/diagnostics/envelope.test.ts \
     packages/compiler/test/runtime-optional-precision.test.ts
   for i in 1 2 3 4 5 6; do SCRIPTC_TEST_SHARD=$i/6 pnpm exec vitest run tests/harness/coverage.test.ts > coverage-$i.log 2>&1 & done; wait
   grep -hE '^\s+× ' coverage-*.log
   ```
   `coverage.test.ts` sweeps the whole corpus inside one test with a fixed 600 s limit, which only
   fits in shards on this machine (about twelve minutes for the six).
2. The whole corpus, in six parallel shards (one test file runs in one worker, so
   `SCRIPTC_TEST_WORKERS` alone does not parallelize it; 40 to 80 minutes), under the node
   `.node-version` pins (`nvm install 24.22.0`; under node 25, 82 programs fail with and without
   the patches):
   ```
   export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
   for i in 1 2 3 4 5 6; do SCRIPTC_TEST_SHARD=$i/6 pnpm exec vitest run tests/harness/llvm-differential.test.ts > shard-$i.log 2>&1 & done; wait
   grep -hE '^\s+× ' shard-*.log
   ```
   Leave this checkout on `light-integration` while it runs: the compiler hashes its own source
   tree per program, and a file missing from the tree (a checkout of the bare tag, say) fails that
   program with ENOENT. Any failure must also fail on the bare tag (`git checkout $NEW`, rebuild,
   run it with `-t`), or on the published `scriptc@<version>` with `scriptc run`.
   On v0.3.5 with node 24.22 every program passes; `timers-clear-many` can fail on a loaded
   machine (it counts interval ticks against a timeout) and passes when run alone. The sanitized lane (`SCRIPTC_SAN=1`) needs a clang that reads LLVM 22's IR; Ubuntu's clang 14
   fails on every program.
3. light, with this compiler: `SCRIPTC=scriptc-dev npm run verify` in `~/Projects/light`, then
   `native/pty.sh` and `node native/bench.js` against the binary.
4. The harness: `SCRIPTC=scriptc-dev npm test`, `npm run coverage`, `npm run build`, and
   `scripts/widecode.sh --selftest shell` (then `fake` and `fake-acp`) in
   `~/Projects/writting-harness`. `scripts/desktop.sh --selftest` sends a real turn to Claude, so it
   runs only when asked.
   To leave a checkout another session is using alone, run 3 and 4 in worktrees of light and the
   harness under one directory, beside a `light` (and `scriptc`) they can reach as `../light`.
5. Check published `scriptc@<version>` against each patch's corpus program; when one passes
   unpatched, drop that branch from the list.
