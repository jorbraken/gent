// Child-process fixture for the runner.test.ts "process.exit cleanup" test.
//
// This exercises `run()`'s real sandbox-dispatch branch — including its real
// `process.exit(code)` call — in a throwaway subprocess. A regular in-process
// vitest test cannot prove the fix: mocking `process.exit` to a no-op or a
// throw restores normal JS finally-on-unwind semantics for BOTH the buggy and
// fixed code, so it can't distinguish them. The bug is specifically that a
// *real* `process.exit()` terminates the process before an enclosing
// `finally` above it on the stack runs. Only running the real thing in a real
// (sub)process proves the fix.
import { run } from "../../runner.js";
import type { Profile } from "../../profiles.js";

const profile: Profile = {
  name: "ephemeral-test",
  agent: "claude",
  sandbox: "ephemeral-test-sandbox",
};

await run(profile, [], false, false);
