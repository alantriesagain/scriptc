// A JavaScript array whose element type does not map (the entries of a table
// of functions here) is a checked-dynamic value as a whole, so what it can
// hold says nothing about native arrays: a filter over Object.entries of the
// table, which can list undefined values, leaves the program's record arrays
// present. The batch loader below then keeps its declared types: the map
// callback's record, the loader's parameter and its early return stay
// records, Promise.all's result is assigned back, and loop bindings over it
// take computed-key writes. A JSDoc generic in the same program keeps its own
// per-instantiation element types.

/** @typedef {Record<string, unknown> & { id?: string | number }} Row */

/** @type {Record<string, Function>} */
const formatters = {
  upper: (value) => String(value).toUpperCase(),
  lower: (value) => String(value).toLowerCase(),
  trim: (value) => String(value).trim(),
};

/**
 * @param {Record<string, Function>} table
 * @param {string} prefix
 * @returns {string[]}
 */
function namesWith(table, prefix) {
  const picked = Object.fromEntries(Object.entries(table).filter(([name]) => name.startsWith(prefix)));
  return Object.keys(picked);
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunks(items, size) {
  /** @type {T[][]} */
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * @param {Row} record
 * @param {string[]} includes
 * @returns {Promise<Row>}
 */
async function loadRelationships(record, includes) {
  if (!includes || includes.length === 0 || !record) return record;
  /** @type {Row} */
  const enriched = Object.fromEntries(Object.entries(record));
  for (const name of includes) enriched[name] = await Promise.resolve(`${name}:${String(record.id)}`);
  return enriched;
}

/**
 * @param {Row[]} records
 * @param {string[]} includes
 * @returns {Promise<Row[]>}
 */
async function loadMany(records, includes) {
  /** @type {Row[]} */
  let enriched = records.map((r) => ({ ...r }));
  if (includes.length > 0)
    enriched = await Promise.all(enriched.map((record) => loadRelationships(record, includes)));
  const key = includes.length > 0 ? "loaded" : "plain";
  for (const record of enriched) record[key] = true;
  return enriched;
}

/** @param {Row[]} rows @param {string[]} keys */
function show(rows, keys) {
  return rows.map((row) => keys.map((key) => `${key}=${String(row[key])}`).join(" ")).join(" | ");
}

console.log(namesWith(formatters, "u").join(","), namesWith(formatters, "").length);

/** @type {Row[]} */
const records = [{ id: "a" }, { id: 2 }, { id: "c" }];
/** @type {string[]} */
const includes = [];
if (process.argv.length < 99) includes.push("author");

const loaded = await loadMany(records, includes);
console.log(show(loaded, ["id", "author", "loaded", "plain"]));
const plain = await loadMany(records, []);
console.log(show(plain, ["id", "author", "loaded", "plain"]));

const grouped = chunks(loaded, 2);
console.log(grouped.length, grouped.map((group) => group.map((row) => String(row.id)).join("+")).join(" "));
const labels = chunks(namesWith(formatters, ""), 2);
console.log(labels.map((group) => group.join("+")).join(" "));
