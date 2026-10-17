# JSDoc-typed JavaScript under scriptc: issues found by light

scriptc treats a JavaScript file more loosely than TypeScript: a JSDoc type that does not map becomes a checked-dynamic value instead of an error. That fallback is where most of these come from. They were found porting light's model and controller layers (JavaScript checked with JSDoc) to native, between 2026-10-15 and 2026-10-16, on v0.3.5 with the fork's patches. Each entry says whether it is verified JavaScript-only (the TypeScript equivalent was compiled and behaves), its status, the repro, what light does about it, and the upstream references. Light's direction is to port code that runs natively to TypeScript, so most of these stop affecting light once that lands; they are still worth fixing or reporting upstream.

## Summary

| # | Issue | JavaScript-only | Status | Upstream |
|---|---|---|---|---|
| 1 | A generic JSDoc function whose return type does not map refuses every call (SC2009) | yes (TypeScript keeps its diagnostic by design) | fixed in the fork: `generic-record-return` | issue and PR drafted, not posted |
| 2 | A JSDoc-typed function returns a copy of a record argument: identity and writes through the result are lost | yes (verified) | open | issue drafted, not posted; related #1158 |
| 3 | SC9001 "union u0: fewer than 2 arms" reading a member of a call result typed with a self-referencing union and an intersected index signature | yes: TypeScript refuses the same type cleanly (SC2006) | open | issue drafted, not posted |
| 4 | Calls through an object literal behind a JSDoc cast do not lower; the same object declared with `@type` compiles | yes (verified) | open, worked around in light | not drafted |
| 5 | A `function` declaration that reads a module-level `Map` of an interface type defers its reads; arrow consts compile | yes (verified) | open, worked around in light | not drafted |
| 6 | Values from `Object.entries` captured by a closure defer ("runtime-optional capture whose narrowed value type is not representable") | unknown | open, worked around in light; not reduced | not drafted |
| 7 | A site JavaScript defers lets the build continue into an internal compiler error at a later site | yes (by construction: TypeScript stops at the first error) | fixed for the case seen (`async-return-union`) | covered by the `Promise.all` issue |
| 8 | JSDoc-typed JavaScript classes compile 70 to 160 times slower than the same TypeScript | yes | known upstream | vercel-labs/scriptc#934 |
| 9 | One possibly undefined value stored into a JavaScript array whose element type does not map makes every array in the program count as possibly undefined | yes (the fallback is JavaScript's) | fixed in the fork: `async-return-union` (`6b01f0f90`) | to be added to the `Promise.all` issue |
| 10 | An async function that returns a dynamic value which is a promise fails at run time (`expected object at $, got Promise`) | likely (dynamic values come from unmappable JSDoc types); TypeScript untested | fixed in the fork: `async-dynamic-return` | issue and PR drafted, not posted |

## 1. A generic JSDoc function whose return type does not map refuses every call

```js
/** @typedef {{ $type: string, props?: Record<string, Field | object> } & Record<string, unknown>} Field */
/** @typedef {Record<string, Field> & { $label?: string }} Schema */
/** @typedef {{ name: string, schema: Schema, count(): number }} Api */

/** @param {string} name @param {Schema} schema @returns {Api} */
const api = (name, schema) => ({ name, schema, count: () => Object.keys(schema).length });

/** @param {string} name @param {Schema} schema @returns {Api} */
const definePlain = (name, schema) => api(name, schema);

/**
 * @template {Schema} S
 * @param {string} name
 * @param {S} schema
 * @returns {Api}
 */
const define = (name, schema) => api(name, schema);

const plain = definePlain("notes", { body: { $type: "string" } });
const generic = define("todos", { title: { $type: "string" }, done: { $type: "boolean" } });
console.log(plain.name, plain.count(), generic.name, generic.count());
```

Node prints `notes 1 todos 2`. On v0.3.5 coverage reports `SC2009 the record shape is supported, but its member 'schema' has type 'Schema', which does not compile` at the `define(...)` call only. A non-generic JavaScript function returns an unmappable type checked-dynamic (`declaredReturnType` in `function-returns.ts`); the generic routes (`genericCallInstance`, `genericValueInstance` in `generic-functions.ts`) did not. Fixed by the fork's `generic-record-return` (corpus `5791-jsdoc-generic-unmapped-return.js`). Light hit it in `defineModel(name, schema)`.

## 2. A JSDoc-typed function returns a copy of a record argument

```js
/** @typedef {Record<string, unknown> & { id?: string }} Row */

/** @param {Row} row @returns {Row} */
function same(row) {
  return row;
}

const head = { id: "a", title: "one" };
const back = same(head);
back.title = "two";
console.log(back === head, head.title);
```

Node prints `true two`; the native binary prints `false one`. The record is copied crossing the JSDoc-typed boundary, so identity is lost and a write through the result never reaches the caller's object, with no diagnostic. The same function in TypeScript (`function same(row: Row): Row`) prints `true two` natively. Related: a JavaScript object passed through a JSDoc record-typed parameter is copied too, and its keys can come back reordered when the program also calls `Object.keys` on another checked-dynamic read. Upstream `main` has #1158 (class instance identity through structural record views) and a commit that reports record width copies at assertions, assignments and array elements (`8f5ec2d94`); whether they cover this case is to be checked on a build of `main`. This is the main reason light ports its native code to TypeScript: the store returns loaded rows, the signals store skips a write when `oldValue === value`, and a controller mirrors rows it is handed.

## 3. SC9001 reading a member of a call result typed with a self-referencing union and an intersected index signature

```js
/** @typedef {{ p?: Field | object } & Record<string, unknown>} Field */
/** @returns {Field} */
const make = () => ({});
console.log(make().p);
```

Node prints `undefined`; v0.3.5 fails with `error SC9001: internal compiler error: union u0: fewer than 2 arms`. It takes all three of: a self-reference unioned with `object` (`Record<string, object>` or `Field | string` build), an index signature added by intersection (the same signature inside the literal builds), and a member read on a call result (a local annotated `Field`, or a parameter, builds). The TypeScript equivalent is refused with `SC2006 ... this index signature is outside the supported shape`, a clean refusal, so the crash is on the JavaScript fallback path. Light's `TypeDefinition` (`props?: Record<string, PropertyDeclaration>`, a union with `object`) has this shape.

## 4. Calls through an object literal behind a JSDoc cast do not lower

In light, `const T = /** @type {TypesAPI} */ ({ string: primitive("string"), ... })` made every `T.string(...)` call a deferred site (`SC1090 method calls like 'T.string'`). With the identical type as a declaration annotation (`/** @type {X} */ const T = { ... }`) the calls compile; a cast to a small record type also compiles; a cast to a type whose members return `TypeDefinition` does not. The TypeScript form (`({ ... }) as Api`) compiles. Light's workaround: `T` is declared with `/** @type {TypesAPI} */`, and its factories answer `TypeDefinition<never>` so the declaration typechecks against the phantom-typed slots.

## 5. A `function` declaration that reads a module-level `Map` of an interface type defers its reads

```js
/** @import { StorageAdapter } from "./types.ts" */
/** @type {Map<string, StorageAdapter>} */
const REGISTRY = new Map();
/** @param {string} type @param {StorageAdapter} definition */
export function register(type, definition) {
  if (REGISTRY.has(type)) console.log("again");
  REGISTRY.set(type, definition);
}
```

Coverage reports `SC2020 'Map<…>.has' ... has no scriptc lowering yet` (and `.set`, `.get`, `Object.assign` in the same function family). The same code as `export const register = (type, definition) => { ... }` compiles, as does a function declaration over a `Map` of a plain record type, and the TypeScript version with `function` declarations compiles. Likely the hoisted declaration counts as able to run before the binding is initialized, and the "runtime-optional capture" of an interface-typed `Map` is not representable. Light's workaround: arrow consts in `model/factory.js` and `controller/sync.js`.

## 6. Values from `Object.entries` captured by a closure defer

In light's `T.registerTypes`, `for (const [name, factory] of Object.entries(extension.types)) T[name] = wrapExtensionFactory(factory)` made the closure inside `wrapExtensionFactory` a deferred site (`SC1090 a runtime-optional capture whose narrowed value type is not representable`, at the captured `factory`). Walking `Object.keys(types)` and reading `types[name]` compiles. A reduction with a plain `(options?) => object` factory compiles in both JavaScript and TypeScript, so the trigger involves light's `TypeOptions`/`TypeExtension` types and needs more reduction before it can be reported.

## 7. A deferred site lets the build continue into an internal compiler error

In TypeScript a site that does not map is a build error; in JavaScript it is deferred (it throws only if executed) and the build continues. Seen with the `Promise.all` case: the JavaScript version deferred the SC2003 and then failed with `SC9001: recordKeySet receiver: expected record, got union` at a computed-key write over the same values. Fixed for that case by the fork's `async-return-union`; worth keeping in mind when a JavaScript build reports an internal error: look for a deferred site upstream of it.

## 8. JSDoc-typed JavaScript classes compile far slower than TypeScript

Reported upstream as vercel-labs/scriptc#934 (70 to 160 times slower); why light's core moved to TypeScript and needed the fork's class patches.

## 9. An unmappable JavaScript array spreads "possibly undefined" to every array

Light's `types/validate.js` has `Object.fromEntries(Object.entries(schema).filter(([_, prop]) => "virtual" in prop))`. The element type `[string, TypeDefinition]` has no native layout, and for such an array the runtime-optional analysis answered "unknown" (`arrayKeysUnsafe` in `lowerer.ts`), an answer meant for element types that are type parameters. `Object.entries` can list undefined values and `filter` keeps that, so storing into the "unknown" element type set a global flag: every native array in the program counted as possibly holding undefined. In light that widened the store's `Row[]` and ended in SC2003 and SC9001 in `relationship-loader.js`, in any program that imports `validate.js`. Fixed on `async-return-union` (`6b01f0f90`, corpus `4948-js-unmapped-element-arrays.js`): outside a generic function or a class, a JavaScript array whose element type does not map no longer counts toward native arrays' facts.

## 10. An async function that returns a dynamic value which is a promise

When an async function returns a value of dynamic type, the compiler checks it against the declared return type directly; only promises with a static type are awaited first. A dynamic value that is a promise is rejected: `Uncaught TypeError: expected object at $, got Promise`. In light it stops the native model probe at the first write: `store.js` returns `uploadFiles(...)`, `adapterFor(model).count(...)`, `adapter.exists(...)` and `facets(...)`, which are dynamic because `ModelSchema` and `StorageAdapter` do not map. `return await` at those lines makes the native output match Node. Fixed by the fork's `async-dynamic-return` (corpus `4949-async-dynamic-returns.js`): a dynamic promise is adopted like a typed one, and any other value settles at once.

## Also seen, not specific to JSDoc

Found in the same work and reproduced in TypeScript too, so they belong to the upstream drafts or FORK.md rather than here. One of them is the TypeScript side of entry 2: casting a typed object literal to `Record<string, unknown>` (`store as unknown as Record<string, unknown>`) makes a copy natively, so `Object.defineProperty` through the cast lands on the copy and a write through the defined accessor never reaches the original (node prints `5 5`, the binary `2 5`); building the object as a `Record` from the start keeps identity, and light's `createStore` does that. The others: `Promise.all` marking its result as possibly undefined (fixed, `async-return-union`); SC9001 on a computed-key write through an element that can be undefined; SC2003 when an async function that returns its parameter is called with an element that can be undefined inside a callback; `Signal<unknown>` (a generic class instantiated with `unknown` is refused even though `unknown` fields compile); spreading an object with an index signature; a typed function held in a literal that spreads an open record; generic overloaded members on a record type; computed-key writes reported as slow paths that make every method call dynamic.
