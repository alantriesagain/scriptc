// A WeakMap/WeakSet method read as a value in a JavaScript source is the
// interned prototype function: it applies the method to its own receiver and
// throws Node's brand-check TypeError for a foreign one.

const wm = new WeakMap();
const key = {};
wm.set(key, 41);

const ws = new WeakSet();
ws.add(key);

function report(label, fn) {
  try {
    console.log(label, "value=" + String(fn()));
  } catch (e) {
    console.log(label, e.name, e.constructor === TypeError);
  }
}

report("proto-foreign-array", () => WeakMap.prototype.has.call([], key));
report("instance-foreign-array", () => {
  const has = wm.has;
  return has.call([], key, 1);
});
report("instance-foreign-plain", () => wm.get.call({}, key));
report("instance-primitive-this", () => wm.set.call(false, key, 2));
report("weakset-foreign-plain", () => ws.add.call({}, key));
report("weakset-primitive-this", () => ws.has.call(undefined, key));

report("instance-valid-get", () => {
  const get = wm.get;
  return get.call(wm, key);
});
report("instance-valid-has", () => wm.has.call(wm, key));
report("weakset-valid-delete", () => ws.delete.call(ws, key));
report("proto-valid-has", () => WeakMap.prototype.has.call(wm, key));

function withReceiver() {
  console.log("receiver evaluated");
  return wm;
}
report("call-receiver-foreign", () => withReceiver().has.call({}, key));
report("value-type", () => typeof wm.has);
