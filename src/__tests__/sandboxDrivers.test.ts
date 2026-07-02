import { describe, it, expect } from "vitest";
import type { Sandbox } from "../sandboxes.js";
import { buildLocalExecOptions, localDriver } from "../sandboxDrivers.js";

const localSandbox: Sandbox = {
  id: "dev",
  driver: "local",
  workdir: "/tmp/workspace",
  environment: { GENT_PROFILE: "coding" },
};

describe("buildLocalExecOptions", () => {
  it("uses sandbox.workdir as cwd", () => {
    const { cwd } = buildLocalExecOptions(localSandbox);
    expect(cwd).toBe("/tmp/workspace");
  });

  it("falls back to process.cwd() when workdir is unset", () => {
    const { cwd } = buildLocalExecOptions({ id: "dev", driver: "local" });
    expect(cwd).toBe(process.cwd());
  });

  it("merges sandbox.environment on top of process.env", () => {
    const { env } = buildLocalExecOptions(localSandbox);
    expect(env.GENT_PROFILE).toBe("coding");
    expect(env.PATH).toBe(process.env.PATH);
  });
});

describe("localDriver", () => {
  it("has name 'local'", () => {
    expect(localDriver.name).toBe("local");
  });

  it("validate() flags a missing mount source", async () => {
    const sandbox: Sandbox = {
      id: "dev",
      driver: "local",
      mounts: [{ source: "/definitely/does/not/exist/xyz", target: "/x", mode: "ro" }],
    };
    const problems = await localDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("/definitely/does/not/exist/xyz"))).toBe(true);
  });

  it("validate() returns no problems when mounts exist", async () => {
    const sandbox: Sandbox = {
      id: "dev",
      driver: "local",
      mounts: [{ source: process.cwd(), target: "/x", mode: "ro" }],
    };
    expect(await localDriver.validate(sandbox)).toEqual([]);
  });

  it("exec() runs the command and returns its exit code", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await localDriver.exec(sandbox, process.execPath, ["-e", "process.exit(0)"], "/tmp");
    expect(code).toBe(0);
  });

  it("exec() propagates a non-zero exit code", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await localDriver.exec(sandbox, process.execPath, ["-e", "process.exit(3)"], "/tmp");
    expect(code).toBe(3);
  });

  it("ensureRunning/stop/destroy are no-ops that resolve", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    await expect(localDriver.ensureRunning(sandbox, "/tmp")).resolves.toBeUndefined();
    await expect(localDriver.stop(sandbox)).resolves.toBeUndefined();
    await expect(localDriver.destroy(sandbox)).resolves.toBeUndefined();
  });
});
