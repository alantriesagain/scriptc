// A store at an index found by indexOf, with -1 ruled out first, writes
// inside the array and leaves no holes. Here a generic helper nulls a
// removed callback while the list runs: its element type is a type
// parameter, so a hole it could leave would count for every array in the
// program. The batch loader below then keeps its declared types: the
// map callback's row, the loader's parameter and its early return stay
// records, and Promise.all's result is assigned back and written through.

function release<F>(items: Array<F | null>, cb: F, running: boolean): boolean {
  const at = items.indexOf(cb);
  if (at === -1) return false;
  if (running) items[at] = null;
  else items.splice(at, 1);
  return true;
}

function compact<F>(items: Array<F | null>): Array<F | null> {
  return items.includes(null) ? items.filter((cb) => cb !== null) : items;
}

type Row = Record<string, unknown> & { id?: string | number };

async function loadRelationships(record: Row, includes: string[]): Promise<Row> {
  if (includes.length === 0) return record;
  const enriched: Row = Object.fromEntries(Object.entries(record));
  for (const name of includes) enriched[name] = await Promise.resolve(`${name}:${String(record.id)}`);
  return enriched;
}

async function loadMany(records: Row[], includes: string[]): Promise<Row[]> {
  let enriched = records.map((r): Row => Object.fromEntries(Object.entries(r)));
  if (includes.length > 0)
    enriched = await Promise.all(enriched.map((record) => loadRelationships(record, includes)));
  const key = includes.length > 0 ? "loaded" : "plain";
  for (const record of enriched) record[key] = true;
  return enriched;
}

function show(rows: Row[], keys: string[]): string {
  return rows.map((row) => keys.map((key) => `${key}=${String(row[key])}`).join(" ")).join(" | ");
}

const heard: string[] = [];
let callbacks: Array<((name: string) => void) | null> = [];
const second = (name: string): void => {
  heard.push(`second:${name}`);
};
const first = (name: string): void => {
  heard.push(`first:${name}`);
  release(callbacks, second, true);
};
callbacks.push(first, second);
for (const name of ["a", "b"]) {
  for (let i = 0; i < callbacks.length; i++) {
    const cb = callbacks[i];
    if (cb !== null && cb !== undefined) cb(name);
  }
  callbacks = compact(callbacks);
}
console.log(heard.join(" "), callbacks.length, release(callbacks, second, false));

const queue = [3, 1, 4, 1, 5];
const one = queue.indexOf(1);
if (one !== -1) queue[one] = 9;
const last = queue.lastIndexOf(1);
if (last >= 0) queue[last] = 8;
console.log(queue.join(","), queue.length);

const records: Row[] = [{ id: "a" }, { id: 2 }, { id: "c" }];
const includes: string[] = [];
if (process.argv.length < 99) includes.push("author");
const loaded = await loadMany(records, includes);
console.log(show(loaded, ["id", "author", "loaded", "plain"]));
const plain = await loadMany(records, []);
console.log(show(plain, ["id", "author", "loaded", "plain"]));
