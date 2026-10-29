/* Undeclared properties of checked records.
 *
 * A checked conversion from an ordinary object into a closed declared-field
 * record (JSON.parse results, `any` values) stores only the declared fields
 * natively. When the source object carried other own properties, the
 * runtime keeps them beside the record (scr_record_source_note), and the
 * reflective surfaces that Node answers from the whole object — JSON
 * serialization, untyped views, inspect, Object.keys/values/entries —
 * answer through the record's live checked view instead of its static
 * field list. This module names the record types that can carry such a
 * source, the runtime test the surfaces branch on, and whether the program
 * converts anything into one at all (a program without such a conversion
 * answers the test false everywhere, so its captures keep static copies). */
import type { IrExpr, IrFunction, IrType, SrcLoc } from "../../ir/ir.js";
import { BOOL, DYN, recordTextCodecClass, shapeHasAccessorSlots } from "../../ir/ir.js";
import { everyStmtList } from "../../ir/traverse.js";
import { varRef } from "../../ir/build.js";
import type { Lowerer } from "./lowerer.js";
import { isPerfEntryType } from "./builtins/performance.js";

/** Closed declared-field layouts with an ordinary data surface: the targets
 * the checked record builder notes sources for. */
export function recordMayKeepSource(lowerer: Lowerer, t: IrType & { kind: "record" }): boolean {
  const shape = lowerer.shapes.get(t.shapeId);
  return (
    shape !== undefined &&
    !shape.tuple &&
    shape.indexValue === undefined &&
    shape.fields.length > 0 &&
    !shapeHasAccessorSlots(shape) &&
    recordTextCodecClass(shape) === null &&
    !isPerfEntryType(lowerer, t) &&
    lowerer.dynConvertible(t)
  );
}

/** `record.sourceHas(value)`: whether this record kept undeclared source
 * properties. */
export function recordSourceTest(value: IrExpr, loc: SrcLoc): IrExpr {
  return { kind: "libCall", fn: "record.sourceHas", args: [value], type: BOOL, loc };
}

/** A union revisited while it is being visited answers as if its cycle arm
 * were empty (`keeps: false`), so the caller's answer is incomplete until the
 * outer union settles. `cycled` marks that incompleteness: such an answer is
 * never memoized, because another entry point into the same cycle could reach
 * the missing arm. */
interface KeepsSourceAnswer {
  keeps: boolean;
  cycled: boolean;
}

/** Shared work list of the whole-program scan: settled union answers, and the
 * unions on the current path. */
export interface KeepsSourceScan {
  memo: Map<string, boolean>;
  visiting: Set<string>;
}

/** Whether a checked conversion into `target` can leave a record holding
 * undeclared source keys. The conversion reads one record at a time, so the
 * records nested in a union arm, a promise, or an array count too. */
function conversionKeepsSource(
  lowerer: Lowerer,
  target: IrType,
  scan: KeepsSourceScan,
): KeepsSourceAnswer {
  if (target.kind === "record")
    return { keeps: recordMayKeepSource(lowerer, target), cycled: false };
  if (target.kind === "promise") return conversionKeepsSource(lowerer, target.inner, scan);
  if (target.kind === "array") return conversionKeepsSource(lowerer, target.elem, scan);
  if (target.kind !== "union") return { keeps: false, cycled: false };
  const known = scan.memo.get(target.unionId);
  if (known !== undefined) return { keeps: known, cycled: false };
  if (scan.visiting.has(target.unionId)) return { keeps: false, cycled: true };
  const union = lowerer.unions.get(target.unionId);
  if (union === undefined) return { keeps: false, cycled: false };
  scan.visiting.add(target.unionId);
  let keeps = false;
  let cycled = false;
  for (const arm of union.arms) {
    const answer = conversionKeepsSource(lowerer, arm, scan);
    keeps = keeps || answer.keeps;
    cycled = cycled || answer.cycled;
  }
  scan.visiting.delete(target.unionId);
  if (!cycled) scan.memo.set(target.unionId, keeps);
  return { keeps, cycled };
}

/** Whether `fn` holds a validated conversion that can note a record source:
 * a `dynCheck` whose target accepts `recordMayKeepSource`. Only such a
 * conversion creates the kept view `recordSourceTest` answers, so a program
 * without one never needs a capture to consult the view. */
export function functionKeepsRecordSources(
  lowerer: Lowerer,
  fn: IrFunction,
  scan: KeepsSourceScan,
): boolean {
  return !everyStmtList(fn.body, {
    expr: (expr) =>
      expr.kind !== "dynCheck" || !conversionKeepsSource(lowerer, expr.type, scan).keeps,
    stmt: () => true,
  });
}

/** A reflective answer over a record value that branches on its kept
 * source: `staticAnswer` walks the declared fields, `viewAnswer` answers
 * from the live checked view (typed `type`, the static answer's type). The
 * receiver evaluates once. */
export function throughRecordSource(
  lowerer: Lowerer,
  receiver: IrExpr,
  loc: SrcLoc,
  staticAnswer: (record: IrExpr) => IrExpr,
  viewAnswer: (view: IrExpr, type: IrType) => IrExpr,
): IrExpr {
  const local = lowerer.declareHiddenLocal("%sourcedRecord", receiver.type);
  const record = (): IrExpr => varRef(local.id, receiver.type, loc);
  const plain = staticAnswer(record());
  const view: IrExpr = { kind: "dynFrom", value: record(), liveRef: true, type: DYN, loc };
  return {
    kind: "seqExpr",
    stmts: [{ kind: "varDecl", localId: local.id, init: receiver, loc }],
    result: {
      kind: "ternary",
      cond: recordSourceTest(record(), loc),
      then: viewAnswer(view, plain.type),
      else_: plain,
      type: plain.type,
      loc,
    },
    type: plain.type,
    loc,
  };
}
