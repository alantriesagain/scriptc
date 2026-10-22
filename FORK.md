# This fork's patches

This fork carries patches to scriptc that light (and the apps built on it) need before a scriptc
release has them. Each patch is one branch on top of an upstream release tag, so it can be offered
upstream as a pull request on its own; this file lives on its own branch too, `fork-docs`.
`light-integration` is the release tag with every patch and this file cherry-picked on top, in the
order of the table below, so its log is the release's log plus one commit per change; it is the
compiler light's native build runs (`SCRIPTC=...`, see light's `native/README.md`). `refork.sh`
rebuilds all of it on a new release.

Current base: **v0.4.1** (`87c87b3ab`). Bare v0.4.1 still has the problems all six fix. The v0.3.6 fork stays as `light-integration-v0.3.6` and its patch branches as `<branch>-v0.3.6`.

## The patches

| Branch | What it changes | Files | Tests | Why light needs it | Upstream |
|---|---|---|---|---|---|
| `census-report` | Coverage reports writes that make methods replaceable as slow paths (SC7001, a new SC7xxx band of notes) with the methods they affect and a hint; every such site is listed. `--fail-on=slow-paths` fails on them and on blockers. The diagnostics envelope gives them a `slow-path` category and `warning` severity; the coverage and CLI docs describe them. | `class-method-mutations.ts` (`noteAnyMethodWrite`), `frontend/lowering/slow-paths.ts` (new), `lowerer.ts` (`anyMethodWriteSites`, `slowPaths`), `frontend/analysis.ts`, `coverage/report.ts`, `diagnostics/diagnostic.ts` (`replaceableMethodsDiag`), `diagnostics/envelope.ts`, `cli/command.ts`, `cli/usage.ts`, `docs/content/docs/{coverage,cli}.mdx` | `tests/harness/coverage.test.ts` (two tests), fixtures `coverage-fixtures/slow-paths.ts` and `no-slow-paths.ts`, snapshots `coverage-slow-paths.txt` and `coverage-tier-demotions.txt` (v0.4.1's tier-demotions fixture has a slow path, and its report a dynamic-tier line), `envelope.test.ts` | Coverage said "fully static" while every call was several times slower. light's and the harness's coverage gates run `--fail-on=slow-paths`. | issue #1149, PR #1153 |
| `generic-record-return` | A call of a JavaScript generic function (a JSDoc `@template`, or a generic type from a `.ts` file over a JavaScript body) whose instantiated return type does not map returns the checked-dynamic value a non-generic JavaScript function returns, instead of fencing the call with SC2009 (which names a member of the returned record). The call route, the pinned-value route and async generics (the promise ABI stays) share it; a result that is itself a generic function keeps its SC1090 fence, and TypeScript declarations keep their diagnostic. | `packages/compiler/src/frontend/lowering/generic-functions.ts` (`instanceReturnType`, `genericCallInstance`, `genericValueInstance`) | corpus `5791-jsdoc-generic-unmapped-return.js` and its ts7 order baseline | light's `defineModel(name, schema)` (`@template {ModelSchema} S`, returning `ModelApi<RowOf<S>, ModelSchema>`) fenced every model definition, while the same body behind a non-generic wrapper compiled. | not offered yet |
| `async-return-union` | `Promise.all`'s result holds `undefined` only where an entry is a hole or `undefined` (a typed promise settles with a value of its own type), instead of always. The old fact landed on the result's element type, so with `rows = await Promise.all(rows.map((row) => load(row, includes)))` the callback's `row`, `load`'s parameter and, through an early `return row`, `load`'s result widened to `Promise<T \| undefined>` while the callback's return became `Promise<T> \| undefined`: SC2003, and in JavaScript a deferred site plus SC9001 on a computed-key write in a loop over the result. `Promise.allSettled` keeps the old fact. A JavaScript array whose element type does not map (a dynamic value as a whole) no longer counts toward native arrays' facts outside a generic function or a class: one possibly undefined value stored into such an array (a `filter` over `Object.entries`) made every array in the program count as possibly undefined. A store or read at an index from `indexOf`/`lastIndexOf` on the same array, behind a test that rules out -1, is proven inside the array: such a store in a generic `Array<F \| null>` made every array in the program count as possibly holey. | `packages/compiler/src/frontend/lowering/runtime-optional-elements.ts` (`builtContents`), `lowerer.ts` (`arrayKeysUnsafe`, `inGenericScope`), `runtime-optional-bounds.ts` (`boundedBefore`, `searchesIndex`, `testsFound`, `testsMissing`, `exitsWhenMissing`) | corpus `4946-async-early-return-promise-all.ts`, `4947-async-early-return-promise-all.js`, `4948-js-unmapped-element-arrays.js`, `4956-indexof-store-bounds.ts` and their ts7 order baselines; two tests in `runtime-optional-bounds.test.ts`; one test in `packages/compiler/test/runtime-optional-precision.test.ts` | light's `loadRelationshipsForMany` gathers `loadRelationships` results with `Promise.all` and writes computed keys over them; it did not build natively. `types/validate.js`'s `virtual` filter over `[string, TypeDefinition]` entries widened the store's rows in every program that imports it, and `signals/listeners.ts`'s `delete` nulls a callback while the list runs. | not offered yet (the fact came in with #784) |
| `generic-unknown-fields` | A field typed by a type parameter (`_value: T`, `T \| null`, `T[]`, a parameter property) compiles when the instantiation binds the parameter to the checked-dynamic kind (`unknown`, `object`, and every argument that maps to it, such as a `WeakMap`, since they share one instantiation), in the storage a field declared `unknown` uses, instead of SC1090 "'unknown'-typed class fields (instantiating class 'X' with <unknown>)". `Box<any>` and fields declared `any` or `WeakMap` stay refused. | `packages/compiler/src/frontend/lowering/lowerer.ts` (`opaqueValueType`, which upstream's `classFieldStoresDyn` asks for every class field) | corpus `5813-generic-unknown-fields.ts` and its ts7 order baseline | `Signal<T>` is built with `unknown` values (the store adapter's `signal(value)`), so every signal the controller layer makes was refused. | a follow-up to issue #1147 and PR #1151 |
| `async-dynamic-return` | An async function with a typed result that returns a checked-dynamic value resolves its promise with that value, as JavaScript does, instead of checking the value against the result type directly (only statically typed promises were awaited first). A promise behind the value is adopted like a returned typed promise: the same microtask turns, after every crossed `finally`, outside the function's own `catch`; any other value settles the function at once, with no extra turn. Concise async arrow bodies follow the same rule. Before, such a return failed with "expected object at $, got Promise". | `packages/compiler/src/frontend/lowering/lowerer.ts` (`dynamicAsyncReturn`, `lowerReturnOf`, `lowerReturnValue`), `lower-functions.ts` (concise bodies) | corpus `4949-async-dynamic-returns.js` and its ts7 order baseline | light's store returned dynamic promises from typed async methods (`return uploadFiles(...)`, the adapter's `count` and `exists`); the model probe failed at its first `add`. | not offered yet |
| `workspace-source-js` | A workspace-linked package whose bare import is answered by its TypeScript source (a `.ts` file outside node_modules, the package compiled from source) is program source as a whole: the JavaScript modules its sources reach relatively lower like the TypeScript ones, instead of staying out of the program as unselected package JS, where every reference to one of their bindings was fenced (SC1090 "a binding form with no lowering") and threw when it ran. A workspace link answered by declarations and JavaScript keeps the old rule. | `packages/compiler/src/frontend/workspace-registry.ts` (`registerWorkspaceSourcePackage`, `isWorkspaceSourcePackage`), `program.ts` (the up-front probe of bare specifiers, `unselectedPackageJsFile`) | `tests/harness/workspace-source-js.test.ts` | widecode imports `@bootstrapp/light/types` (`types/types.ts`, which re-exports `types/index.js`) and light's model layer reaches `types/index.js` from its TypeScript; `T.string("")` threw at the first descriptor. | not offered yet |

Dropped at v0.4.1, since upstream fixed what light needs in its own way: `ts-unknown-fields` (#1208, which still refuses a field typed `(object | null)[]`), `census-typed-keys` (#1218, which still makes every method replaceable for `target[k as string]` with `k: "a" | "b"`) and `generic-method-slots` (#1215, under which a method read on a generic instance through a receiver typed as its non-generic base, `const asBase: Dep = new Box(4); asBase.track()`, still throws "is not a function"; light reads only fields through `Dep`). Their v0.3.6 branches stay as `<branch>-v0.3.6`.

On v0.3.2 `census-typed-keys` and `census-report` were one branch, `census-report`; they are split so each can be offered upstream on its own. `light-integration-v0.3.2` keeps the old combination.

Not in `light-integration`: `js-class-callbacks` (an experiment on the old `7ffc2d93` base: JavaScript
methods join the method-write census). It slows light's benchmark about twofold, so it stays out.

Upstream context: vercel-labs/scriptc#934 (JSDoc-typed JavaScript classes compile 70 to 160 times
slower than the same TypeScript), which is why light moved to TypeScript and needed these patches.

For pull requests, each patch branch is pushed to this fork (`origin`) as `pr/<branch>`, and
`main` on the fork is the upstream release itself; the numbers above are vercel-labs/scriptc's.

## Upstream after v0.3.6 (checked 2026-10-18; v0.4.0 and v0.4.1 rechecked 2026-10-21)

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

### Rechecked 2026-10-19

Still no v0.3.7: npm's latest is 0.3.6, the last GitHub release is v0.3.6, and `upstream/main` (`26946d6b2`, 569 commits past v0.3.6) still says 0.3.6. ctate closed #1151 and #1152 on 2026-10-18 as landed by #1208 and #1218 ("If you see a class field type that's still refused, send it over."); #1150 and #1153 are open with no review.

On an unpatched build of `26946d6b2` (the 0.3.6 LLVM helper, a runtime pack built from that commit), every patch's tests fail as in the table above, except that 5791 now fails at run time ("values of type 'Api<Record<string, unknown>>' cannot be compiled: … member 'schema' has type 'Schema'") instead of with SC2009. Light's native entries do not build there: `native/index.js` stops at `Signal<unknown>` (SC1090 "'T'-typed class fields … instantiating class 'Signal' with <unknown>", what `generic-unknown-fields` fixes) and the uses it fences, and `examples/tasks/main.js` also at SC2003 in `model/relationship-loader.ts` (`async-return-union`). `coverage --fail-on` takes `blockers` or `divergences` only, so light's gate still needs `census-report`'s `slow-paths`. `native/` now changes `partition.cpp` too (how functions too large to inline are placed), not only WebAssembly: at v0.3.7, take the release's LLVM helper.

`census-report`, `generic-record-return` and `async-dynamic-return` cherry-pick cleanly onto `f9682f3ed`. `census-report`'s note uses SC7001, which the contracts checker already uses (SC7001 to SC7008, on v0.3.6 too), so #1153 needs another code either way.

Between v0.3.6 and `f9682f3ed`, `native/` changed only for WebAssembly (`emit.cpp`), so the published 0.3.6 LLVM helper builds that commit for linux-x64; `refork.sh` still refuses it as a base because `native/` moved.

At v0.3.7: rerun this check against the release, drop the branches above from `PATCHES` and `DEP` in `refork.sh` and from the table, port `generic-unknown-fields`, then run the whole verification below. Not yet done upstream, since it posts publicly: comment on #1151 and #1152 as superseded and report the three gaps above (`(object | null)[]` fields, base-typed receivers, literal keys under `as string`).

### Rechecked 2026-10-21: v0.4.0 (2026-10-20) and v0.4.1 (2026-10-21)

The release after v0.3.6 is v0.4.0, then v0.4.1 a day later: 1364 commits, npm's latest. The notes name tsc-ts 0.0.5 as the default checker (scriptc's own install first, then the working directory's; `SCRIPTC_CHECKER=tsgo` selects tsgo), program type errors as build failures, `--npm-static=auto` compiling more packages, discriminated unions of records represented as the record pointer, NaN-boxed dynamic values, `coverage --explain-dynamic` and `--tier=static-only`, and profile-guided optimization (`--profile-generate`, `merge-profiles`, `--profile-use`). `native/` changed for it (`emit.cpp`, `partition.cpp`, `profile.h`), so a build of the tag needs the published 0.4.1 LLVM helper; `refork.sh` fetches it when the base is the tag itself. #1150 and #1153 are still open, unreviewed.

On an unpatched build of v0.4.1 (pnpm 11.1.3, its own runtime pack, the 0.4.1 helper), every remaining patch's tests fail as before: 4944 (`(object | null)[]`), 4945 (a base-typed receiver), 4946 to 4948 and 4956 (`Promise.all`), 4949 (a dynamic async return), 5791 (now a run-time "values of type 'Api<…>' cannot be compiled"), 5813 (`Signal<unknown>`). Light's `native/index.js` stops at `Signal<unknown>` and at `tdom/view.ts`'s `Map<string, Signal<unknown>> | null`, 96% static; `examples/tasks/main.js` also at SC2003 in `model/relationship-loader.ts` and SC2001 on a `Signal<unknown>` in the store adapter, 97% static. `--fail-on` still takes `blockers` or `divergences` only.

Cherry-picked onto the v0.4.1 tag: `workspace-source-js` applies clean; `async-return-union` and `generic-unknown-fields` conflict in one hunk each (the latter still on `lower-classes.ts`, where #1208 landed; it is to be ported onto upstream's `classFieldStoresDyn`); `census-report`, `generic-record-return` and `async-dynamic-return` in three hunks each; the three upstream superseded conflict most (`ts-unknown-fields` seven hunks, fixtures included; `generic-method-slots` nine; `census-typed-keys` three) and are the ones to drop, `generic-method-slots` once light's verify passes without it.

Of the problems below, v0.4.0 fixed the `instanceof` internal error, the missing `Record` key read and `bind` on a cast function; v0.4.1 also fixed the multi-source spread into an annotated union index signature. The record-alias field and the record lift into a union index signature still fail on v0.4.1, as `f2-record-alias-field.ts` and `f4-lift-known-into-union.ts` show.

## Problems light hit that no patch covers (found 2026-10-18 on the v0.3.6 fork, extended 2026-10-21 on v0.4.1)

Found while typing light without `any` and measuring its core with paired probes (light's `native/probes/pairs/`). Light works around each one; none is offered upstream yet.

| Problem | Smallest form | Light's workaround |
|---|---|---|
| Internal compiler error "lowerer bug: unknown class B" in `instanceof` (fixed in v0.4.0) | `class B { keys: unknown[] \| null = null }` in a union of classes, tested with `u instanceof B`. `unknown[] \| undefined`, `Array<unknown> \| null` and `readonly unknown[] \| null` fail the same way; `unknown[]`, `number[] \| null` and `unknown` compile. | `ItemsState` holds `keys: unknown[]` (empty when unkeyed) and `keyed: boolean`. |
| SC1090 "'unknown'-typed class fields" for a field typed with a record alias that holds `unknown` | `type Def = { default: unknown }; class Slot { def: Def }`. A field typed `unknown`, or with a class that has an `unknown` field, compiles. | The store's `Slot` keeps the default, `pack` and `unpack` as its own fields. |
| SC1090 "object spread of 'unknown' sources into an index-signature shape" (fixed in v0.4.1) | Two or more spread sources into a JSDoc-annotated union-valued index signature: `/** @type {{ [k: string]: string \| Shades }} */ const c = { ...a, ...D.colors }`. The same spread into an unannotated `const` compiles and has the same type. A single source compiles. | The theme's colour merge is not annotated. |
| SC2002 "record shapes must match exactly or width-coerce" | A known-key record (`{ DEFAULT: string; bg: string }`) lifted into an index signature whose values are a union (`{ [k: string]: string \| Shades }`), as `@returns {Theme}` on a literal spreading the defaults did. Lifting into `Record<string, string>` or `Record<string, unknown>` compiles, and so does a literal written with that annotation. | The default theme's tables are annotated with their scale types, and `buildTheme`'s result type is inferred. |
| A read of a missing key from a `Record<string, string>` throws natively (fixed in v0.4.0, #1236) | `const r: Record<string, string> = { a: "x" }; r["b"]` throws "expected string at $, got undefined"; node answers `undefined`. TypeScript's index signature claims the key is present, and the native build checks the claim on every read. | Light's theme scales declare `string \| undefined` values. |
| SC1090 "Function.prototype.bind on a function whose signature cannot cross the checked-value boundary" (fixed in v0.4.0) | `typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(o) : v`. The same `bind` on the narrowed `Function` compiles. | `controller/define.ts` binds the narrowed `Function`; light's `types/lib.d.ts` types `Function.prototype.bind`'s result as `unknown`. |
| Seven number parameters cost more than two objects | A frame diff calling `sgrBetween(fromNothing, fg, bg, attrs, nextFg, nextBg, nextAttrs)` per changed cell ran 2.7x slower natively than calling `sgrTransition(prev, next)` with two `Style` objects; under node it ran 0.8x. | The diff reuses two scratch `Style` objects. |
| One loop pushing into two arrays costs more than two `.map` calls | `for (const item of raw) { values.push(...); keys.push(...); }` ran 1.9x slower natively than two `raw.map(...)`; under node 0.9x. | The keyed commit keeps its two `.map` calls. |
| SC1090 "generic functions as values (call 'f' directly)", new in v0.4 | `function pick<T>(xs: T[], i: number): T { return xs[i]; } const api = { pick }; api.pick([1, 2, 3], 1)` compiles on 0.3.6 and is refused on v0.4.1 (`g1-generic-fn-in-object.ts`). | `model/query-builder.ts`'s default-export bag names its four generic helpers through plain arrows (light `f8f4366`). |
| SC1090 "functions with optional or defaulted parameters as values", deferred, new in v0.4 | Two `export const f = (rest, table = {}, options = {}) => …` arrows in `theme/classes/resolve.js`, imported and called by `rules.js`; thrown when `native/classes.test.js` reaches them. A one-file copy compiles on both, so the trigger is not reduced yet. | The two are function declarations (light `f95e240`). |
| SC2002 "record shapes must match exactly or width-coerce: expected '[unknown, unknown]', got 'string[]'" | `const [size, line] = Array.isArray(hit) ? hit : [hit, null]` with `hit: string \| string[]` (`g3-array-into-pair.ts`), on 0.3.6 and v0.4.1 alike; light reached it only on v0.4.1. | Read by index (light `f95e240`). |
| SC1090 "values of abstract method declarations", deferred | light `main`'s `tdom/lines.ts` `LineSource` (`abstract count()`, `abstract line()`, called from the base's own methods), nine sites in the tasks example; tui's `packages/chat/host.ts`, 91 sites in widecode. The same on 0.3.6 and v0.4.1; a small abstract class whose base method calls the abstract one compiles, so the trigger is not reduced yet. | None yet: deferred sites throw only when reached. Concrete methods that throw would sidestep it. |

## Building the fork for development

The CLI runs from source (`packages/cli/dist/main.js`); light's tools reach it through a wrapper,
`~/.local/bin/scriptc-dev`:

```
#!/usr/bin/env bash
fork=/home/alanleal/Projects/scriptc
id="$(git -C "$fork" rev-parse --short HEAD 2>/dev/null || echo nogit)-$(stat -c %Y "$fork/packages/compiler/dist/index.js" 2>/dev/null || echo 0)"
export SCRIPTC_CACHE_DIR="${SCRIPTC_CACHE_DIR:-$HOME/.cache/scriptc-fork/$id}"
mkdir -p -m 700 "$SCRIPTC_CACHE_DIR" && chmod 700 "$SCRIPTC_CACHE_DIR"
unset SCRIPTC_NO_CACHE
exec node "$fork/packages/cli/dist/main.js" "$@"
```

The cache directory matters: the build cache is keyed by the compiler's version, not its source,
so a patched compiler would replay binaries the unpatched one built from a shared cache. Naming
the directory by the fork's commit and its build's time gives each build of the compiler a cache of
its own (an unchanged program comes back from it in a second), and scriptc uses an override root
only when it is private (mode 700).

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
