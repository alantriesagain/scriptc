// Array.prototype's methods are generic: they run over any object with a
// length, reading and writing ordinary properties. A call on such an
// object used to answer "not supported yet" for every method other than
// at/slice/indexOf/includes and the callback methods.
const resolved = [];
const report = (label, value) => resolved.push(label + '=' + value);

const box = { length: 3, 0: 'a', 1: 'b', 2: 'c' };
report('join', Array.prototype.join.call(box, '-'));
report('push', Array.prototype.push.call(box, 'd'));
report('after-push', Array.prototype.join.call(box, ''));
report('pop', Array.prototype.pop.call(box));
report('length', box.length);
report('shift', Array.prototype.shift.call(box));
report('unshift', Array.prototype.unshift.call(box, 'x', 'y'));
report('after-unshift', Array.prototype.join.call(box, ','));
report('reverse', Array.prototype.join.call(Array.prototype.reverse.call(box), '/'));
report('concat', Array.prototype.concat.call(box, ['z']).join('+'));
report('slice', Array.prototype.slice.call(box).join('|'));

const filler = { length: 4, 0: 1, 1: 2, 2: 3, 3: 4 };
report('fill', Array.prototype.join.call(Array.prototype.fill.call(filler, 0, 1, 3), ''));
report('copyWithin', Array.prototype.join.call(Array.prototype.copyWithin.call(filler, 0, 2), ''));

const spliced = { length: 4, 0: 'a', 1: 'b', 2: 'c', 3: 'd' };
report('splice', Array.prototype.splice.call(spliced, 1, 2, 'X').join(''));
report('after-splice', Array.prototype.join.call(spliced, ''));
report('splice-none', Array.prototype.splice.call(spliced).length);

const ordered = { length: 3, 0: 3, 1: 1, 2: 2 };
report('toSorted', Array.prototype.toSorted.call(ordered).join(''));
report('toReversed', Array.prototype.toReversed.call(ordered).join(''));
report('toSpliced', Array.prototype.toSpliced.call(ordered, 1, 1).join(''));
report('with', Array.prototype.with.call(ordered, 0, 9).join(''));
report('with-negative', Array.prototype.with.call(ordered, -1, 9).join(''));
report('unsorted', Array.prototype.join.call(ordered, ''));

const nested = { length: 3, 0: [1, 2], 1: 3, 2: [4, [5]] };
report('flat', Array.prototype.flat.call(nested, 1).join(''));
report('flat-deep', Array.prototype.flat.call(nested, 2).join(''));
report('flatMap', Array.prototype.flatMap.call(nested, (value) => [value, value]).length);

// Holes and absent indexes stay holes.
const sparse = { length: 3, 0: 'a', 2: 'c' };
const copied = Array.prototype.toReversed.call(sparse);
report('holes', '1' in copied ? 'present' : 'absent');
report('holes-join', copied.join(''));

// Writes beyond the receiver's length extend it, as the length assignment
// at the end of push/splice does.
const extended = { length: 1, 0: 'only' };
Array.prototype.push.call(extended, 'next');
report('extended', JSON.stringify(extended));

// Every one of the algorithms starts with `? ToObject(this value)`, so a
// nullish receiver is a TypeError before any length is read.
const attempt = (label, run) => {
  try {
    report(label, 'no-throw ' + JSON.stringify(run()));
  } catch (error) {
    report(label, error.constructor.name + ': ' + error.message);
  }
};
attempt('null-join', () => Array.prototype.join.call(null));
attempt('undefined-push', () => Array.prototype.push.call(undefined, 1));
attempt('null-copyWithin', () => Array.prototype.copyWithin.call(null, 0, 0));
attempt('undefined-fill', () => Array.prototype.fill.call(undefined, 0));
attempt('null-toReversed', () => Array.prototype.toReversed.call(null));
attempt('undefined-with', () => Array.prototype.with.call(undefined, 0, 1));
attempt('null-splice', () => Array.prototype.splice.call(null, 0, 1));

console.log(resolved.join('\n'));
