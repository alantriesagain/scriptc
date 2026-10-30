// @normalize-pid
// While mock.timers mocks setTimeout and setInterval, the mocked functions
// build no Timeout, so a negative or overflowing delay warns nothing;
// after reset the real functions warn again, and a node:timers import is
// never mocked.
import { mock } from "node:test";
import { setTimeout as realSetTimeout } from "node:timers";

process.on("warning", (warning) => console.log("warning", warning.name));

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
setTimeout(() => console.log("mocked negative"), -5);
const interval = setInterval(() => {
  console.log("mocked interval");
  clearInterval(interval);
}, 2 ** 31);
realSetTimeout(() => console.log("imported overflow"), 2 ** 32);
mock.timers.tick(1);
mock.timers.reset();

setTimeout(() => console.log("real negative"), -5);
setTimeout(() => console.log("real overflow"), 2 ** 31);
