// `null` and `undefined` in an arithmetic or bitwise position are legal
// JavaScript: ToNumber gives them 0 and NaN, and `+` concatenates when the
// other operand is a string. TypeScript reports TS18050 under strictNullChecks
// and refuses the program; a JavaScript source applies the numeric rule.
console.log(null + undefined, undefined + null, null + null, undefined + undefined);
console.log(null * 3, undefined * 3, null - 2, undefined - 2);
console.log(null / 2, undefined / 2, null % 2, undefined % 2);
console.log(null | 0, undefined | 0, null << 1, -null, +undefined, ~null);
console.log(null + 1, 1 + null, undefined + 1, null + "x", undefined + "x");
console.log(`${null + ""}`, null + "" === "null", undefined + "" === "undefined");
var a = null;
var b;
console.log(a * 2, b * 2, a + b, a - b, a ** 2);
console.log(null < 1, undefined >= 0, null <= undefined, undefined > null);
console.log(null == 0, null === 0, undefined == null);
var n = 1;
n += null;
n *= undefined;
n -= null;
console.log(n);
var o = { v: 1 };
o.v += null;
o.v *= undefined;
console.log(o.v);
