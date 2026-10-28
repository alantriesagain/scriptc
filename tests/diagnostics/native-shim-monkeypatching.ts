// Patching a NATIVE host function: Node lets a library swap
// `process.stdout.write`, hand out `process.stdout.write.bind(...)`, or
// redefine a module member with Object.defineProperty. A compiled binary
// has no host object to patch — the natives are direct calls — so each form
// keeps an explicit refusal instead of silently patching nothing. The
// working split: call the function directly, or give the library a callback
// the program owns.

import * as fs from "node:fs";

export function guardStdout(): void {
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    process.stderr.write(chunk);
    return true;
  };
}

export function bindStdoutWrite(): typeof process.stdout.write {
  return process.stdout.write.bind(process.stdout);
}

export function bindReadFileSync(): typeof fs.readFileSync {
  return fs.readFileSync.bind(fs);
}

export function defineReadFileSync(): void {
  Object.defineProperty(fs, "readFileSync", { value: () => "" });
}

guardStdout();
bindStdoutWrite();
bindReadFileSync();
defineReadFileSync();
