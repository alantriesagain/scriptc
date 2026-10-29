// Values HELD from process.env under a type that is not the environment
// record (tsc-clean, outside the live-alias subset). Node's hold IS the
// environment object, so its reads see the live table; the hold here is a
// snapshot copy taken where it is created, so its reads would silently
// drift once the environment changes.

// a fixed-field annotation: tsc admits it through the index signature
const home: { HOME?: string } = process.env;
console.log(home.HOME);

// an `any` hold: no record shape to alias through
const anyEnv: any = process.env;
console.log(anyEnv.PATH);
