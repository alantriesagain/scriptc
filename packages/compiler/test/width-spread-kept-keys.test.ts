import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { compile, deserializeModule } from "../src/index.js";

/** The `record.sourceNote` libCalls of the module, with the IR text. */
async function sourceNotes(source: string): Promise<{ notes: number; ir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "scriptc-width-keys-"));
  try {
    const entry = join(dir, "main.ts");
    await writeFile(entry, source);
    const outPath = join(dir, "main.ir.json");
    const result = await compile(entry, { outDir: dir, outPath, outputKind: "ir" });
    if (!result.ok)
      throw new Error(result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    const ir = await readFile(outPath, "utf8");
    const mod = deserializeModule(ir);
    let notes = 0;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const node = value as { kind?: unknown; fn?: unknown };
      if (node.kind === "libCall" && node.fn === "record.sourceNote") notes++;
      for (const child of Object.values(value)) visit(child);
    };
    visit(mod.functions);
    return { notes, ir };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const WIDE = `type Narrow = { a: number; b: number };
type Wide = { a: number; b: number; c: number };
function narrow(w: Wide): Narrow {
  return { ...w };
}
`;

test("an unobserved width spread keeps the static copy", async () => {
  const { notes, ir } = await sourceNotes(
    `${WIDE}const n = narrow({ a: 1, b: 2, c: 3 });
console.log(String(n.a + n.b));
export {};
`,
  );
  expect(notes).toBe(0);
  expect(ir).not.toContain("%widthKeys");
  expect(ir).not.toContain("dyn.assign");
});

test("an observed width spread keeps the copy's own keys", async () => {
  const { notes, ir } = await sourceNotes(
    `${WIDE}console.log(JSON.stringify(narrow({ a: 1, b: 2, c: 3 })));
export {};
`,
  );
  expect(notes).toBe(1);
  expect(ir).toContain("%widthKeys");
});

test("an observation through a container counts", async () => {
  const { notes } = await sourceNotes(
    `${WIDE}const all: Narrow[] = [narrow({ a: 1, b: 2, c: 3 })];
console.log(all);
export {};
`,
  );
  expect(notes).toBe(1);
});

