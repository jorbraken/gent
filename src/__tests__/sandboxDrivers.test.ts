import { describe, it, expect, vi } from "vitest";
import type { Sandbox } from "../sandboxes.js";
import { buildLocalExecOptions, localDriver } from "../sandboxDrivers.js";
import {
  appleContainerDriver,
  containerName,
  buildStartArgs,
  buildDetachedRunArgs,
  buildEphemeralRunArgs,
  buildExecArgs,
  buildStopArgs,
  buildRemoveArgs,
  buildLogsArgs,
  buildImageInspectArgs,
} from "../sandboxDrivers.js";

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

const acSandbox: Sandbox = {
  id: "secure",
  driver: "apple-container",
  image: "ghcr.io/org/gent-agent:latest",
  workdir: "/workspace",
  mounts: [
    { source: "/host/project", target: "/workspace", mode: "rw" },
    { source: "/host/context", target: "/gent/context", mode: "ro" },
  ],
  environment: { GENT_PROFILE: "coding" },
};

describe("containerName", () => {
  it("prefixes the sandbox id with gent-", () => {
    expect(containerName(acSandbox)).toBe("gent-secure");
  });
});

describe("apple-container arg builders", () => {
  it("buildStartArgs", () => {
    expect(buildStartArgs(acSandbox)).toEqual(["start", "gent-secure"]);
  });

  it("buildDetachedRunArgs includes mounts, workdir, env, image, and keep-alive command", () => {
    const args = buildDetachedRunArgs(acSandbox, "/gent/runs/secure");
    expect(args).toEqual([
      "run", "--detach", "--name", "gent-secure",
      "-v", "/host/project:/workspace",
      "-v", "/host/context:/gent/context:ro",
      "-v", "/gent/runs/secure:/gent/runs/secure:ro",
      "-w", "/workspace",
      "-e", "GENT_PROFILE=coding",
      "ghcr.io/org/gent-agent:latest",
      "sleep", "infinity",
    ]);
  });

  it("buildDetachedRunArgs throws when no image is configured", () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container" };
    expect(() => buildDetachedRunArgs(sandbox, "/gent/runs/secure")).toThrow(/no image configured/);
  });

  it("buildEphemeralRunArgs includes --rm and the command/args to run", () => {
    const args = buildEphemeralRunArgs(acSandbox, "claude", ["--dangerously-skip-permissions"], "/gent/runs/secure");
    expect(args).toEqual([
      "run", "--rm",
      "-v", "/host/project:/workspace",
      "-v", "/host/context:/gent/context:ro",
      "-v", "/gent/runs/secure:/gent/runs/secure:ro",
      "-w", "/workspace",
      "-e", "GENT_PROFILE=coding",
      "ghcr.io/org/gent-agent:latest",
      "claude", "--dangerously-skip-permissions",
    ]);
  });

  it("buildExecArgs targets the named container", () => {
    expect(buildExecArgs(acSandbox, "claude", ["-p", "hi"])).toEqual([
      "exec", "gent-secure", "claude", "-p", "hi",
    ]);
  });

  it("buildStopArgs / buildRemoveArgs / buildLogsArgs target the named container", () => {
    expect(buildStopArgs(acSandbox)).toEqual(["stop", "gent-secure"]);
    expect(buildRemoveArgs(acSandbox)).toEqual(["rm", "gent-secure"]);
    expect(buildLogsArgs(acSandbox)).toEqual(["logs", "gent-secure"]);
  });

  it("buildImageInspectArgs targets the configured image", () => {
    expect(buildImageInspectArgs(acSandbox)).toEqual(["images", "inspect", "ghcr.io/org/gent-agent:latest"]);
  });
});

describe("appleContainerDriver", () => {
  it("has name 'apple-container'", () => {
    expect(appleContainerDriver.name).toBe("apple-container");
  });

  it("validate() flags a missing image", async () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container" };
    const problems = await appleContainerDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("no image configured"))).toBe(true);
  });

  it("validate() flags a missing mount source", async () => {
    const sandbox: Sandbox = {
      id: "secure",
      driver: "apple-container",
      image: "ghcr.io/org/gent-agent:latest",
      mounts: [{ source: "/definitely/does/not/exist/xyz", target: "/x", mode: "ro" }],
    };
    const problems = await appleContainerDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("/definitely/does/not/exist/xyz"))).toBe(true);
  });

  it("logs() prints a not-applicable message for ephemeral sandboxes", async () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container", lifecycle: "ephemeral" };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await appleContainerDriver.logs(sandbox);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ephemeral container has already exited"));
    logSpy.mockRestore();
  });
});
