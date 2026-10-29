// Records that keep undeclared own keys (a width spread, a checked
// JSON.parse) answer every reflective surface from those keys: for-in, `in`,
// hasOwnProperty, Object.hasOwn, Object.entries/values, Object.assign, and
// further spreads and clones of the same shape.

type Narrow = { a: number; b?: string };
type Wide = { a: number; b?: string; extra: string; tag: string };

const wide: Wide = { a: 1, extra: "x", tag: "t", b: "bee" };
const spread: Narrow = { ...wide };
const parsed = JSON.parse('{"a":1,"extra":"x","tag":"t","b":"bee"}') as Narrow;

function reflect(label: string, r: Narrow): void {
  const keys: string[] = [];
  for (const k in r) keys.push(k);
  console.log(label, "for-in", keys.join(","));
  console.log(label, "in", "extra" in r, "missing" in r, "a" in r);
  console.log(
    label,
    "own",
    Object.prototype.hasOwnProperty.call(r, "extra"),
    Object.hasOwn(r, "tag"),
    Object.hasOwn(r, "missing"),
  );
  console.log(label, "entries", JSON.stringify(Object.entries(r)));
  console.log(label, "values", JSON.stringify(Object.values(r)));
  console.log(label, "assign", JSON.stringify(Object.assign({}, r)));
  const same: Narrow = { ...r };
  console.log(label, "copy", JSON.stringify(same));
  const clone: Narrow = { ...r, a: 2 };
  console.log(label, "clone", JSON.stringify(clone), Object.keys(clone).join(","));
}
reflect("spread", spread);
reflect("parsed", parsed);

// A record without undeclared keys answers from its declared fields.
reflect("plain", { a: 3 });
