// Object.defineProperty accepts any object as the descriptor (ES
// ToPropertyDescriptor), and reads each field through [[HasProperty]] and
// [[Get]], so an array, a function or a descriptor inheriting its fields from
// a prototype answers with the fields it carries.
const target = {};

const arrayDesc = [];
arrayDesc.value = 3;
arrayDesc.enumerable = true;
arrayDesc.writable = true;
arrayDesc.configurable = true;
Object.defineProperty(target, "fromArray", arrayDesc);
console.log(target.fromArray, Object.keys(target));

const emptyArrayDesc = [];
Object.defineProperty(target, "fromEmptyArray", emptyArrayDesc);
const empty = Object.getOwnPropertyDescriptor(target, "fromEmptyArray");
console.log(empty && empty.value, empty && empty.writable, empty && empty.enumerable, empty && empty.configurable);

function fnDesc() {}
fnDesc.value = 7;
Object.defineProperty(target, "fromFunction", fnDesc);
console.log(target.fromFunction, Object.keys(target));

const proto = { value: 11, enumerable: true, writable: true, configurable: true };
const inherited = Object.create(proto);
Object.defineProperty(target, "inherited", inherited);
console.log(target.inherited, Object.keys(target));

const getterDesc = {};
Object.defineProperty(getterDesc, "value", { get() { return 21; } });
Object.defineProperty(target, "viaGetter", getterDesc);
console.log(target.viaGetter);

try {
  Object.defineProperty(target, "mixed", { value: 1, get: undefined });
} catch (error) {
  console.log("mixed", error.name);
}
try {
  Object.defineProperty(target, "notCallable", { get: 1 });
} catch (error) {
  console.log("notCallable", error.name);
}
for (const primitive of [null, 1, "s", true]) {
  try {
    Object.defineProperty(target, "primitive", primitive);
  } catch (error) {
    console.log("primitive", typeof primitive, error.name);
  }
}

const arrayInfo = Object.getOwnPropertyDescriptor(target, "fromArray");
console.log(arrayInfo.value, arrayInfo.writable, arrayInfo.enumerable, arrayInfo.configurable);
const inheritedInfo = Object.getOwnPropertyDescriptor(target, "inherited");
console.log(inheritedInfo.value, inheritedInfo.writable, inheritedInfo.enumerable, inheritedInfo.configurable);
