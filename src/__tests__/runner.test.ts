import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { buildMcpConfig, buildSettings } from "../runner.js";
import type { McpServerConfig } from "../config.js";
import type { Profile } from "../profiles.js";

const githubDef: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
};

const fetchDef: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-fetch"],
};

const registry = { github: githubDef, fetch: fetchDef };

// ─── buildMcpConfig ──────────────────────────────────────────────────────────

describe("buildMcpConfig", () => {
  it("returns null when profile has no mcp list", () => {
    const profile: Profile = { name: "dev" };
    expect(buildMcpConfig(profile, registry)).toBeNull();
  });

  it("returns null when profile.mcp is empty", () => {
    const profile: Profile = { name: "dev", mcp: [] };
    expect(buildMcpConfig(profile, registry)).toBeNull();
  });

  it("returns null and warns when all referenced servers are missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const profile: Profile = { name: "dev", mcp: ["nonexistent"] };
    expect(buildMcpConfig(profile, registry)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("only includes servers listed in profile.mcp", () => {
    const profile: Profile = { name: "dev", mcp: ["fetch"] };
    const result = buildMcpConfig(profile, registry);
    expect(result?.mcpServers).toHaveProperty("fetch");
    expect(result?.mcpServers).not.toHaveProperty("github");
  });

  it("resolves env var placeholders in server env", () => {
    process.env.GITHUB_TOKEN = "tok-123";
    const profile: Profile = { name: "dev", mcp: ["github"] };
    const result = buildMcpConfig(profile, registry);
    expect(result?.mcpServers.github.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
      "tok-123"
    );
    delete process.env.GITHUB_TOKEN;
  });

  it("omits env key entirely for servers with no env config", () => {
    const profile: Profile = { name: "dev", mcp: ["fetch"] };
    const result = buildMcpConfig(profile, registry);
    expect(result?.mcpServers.fetch.env).toBeUndefined();
  });
});

// ─── buildSettings ───────────────────────────────────────────────────────────

describe("buildSettings", () => {
  it("returns null when neither settings nor skills are present", () => {
    const profile: Profile = { name: "dev" };
    expect(buildSettings(profile)).toBeNull();
  });

  it("passes through settings fields", () => {
    const profile: Profile = {
      name: "dev",
      settings: { model: "claude-sonnet-4-6", permissionMode: "auto" },
    };
    const result = buildSettings(profile);
    expect(result?.model).toBe("claude-sonnet-4-6");
    expect(result?.permissionMode).toBe("auto");
  });

  it("returns null when profile only has skills (skills go via --plugin-dir, not settings)", () => {
    const profile: Profile = { name: "dev", skills: ["ollama"] };
    expect(buildSettings(profile)).toBeNull();
  });

  it("passes through arbitrary unknown settings keys", () => {
    const profile: Profile = {
      name: "dev",
      settings: { model: "claude-sonnet-4-6", customKey: "custom-value" },
    };
    const result = buildSettings(profile);
    expect(result?.model).toBe("claude-sonnet-4-6");
    expect(result?.customKey).toBe("custom-value");
  });
});

// ─── runInSandbox ────────────────────────────────────────────────────────────

import { runInSandbox } from "../runner.js";
import type { Sandbox } from "../sandboxes.js";
import type { SandboxDriver } from "../sandboxDrivers.js";

function fakeDriver(overrides: Partial<SandboxDriver> = {}): SandboxDriver {
  return {
    name: "local",
    validate: vi.fn().mockResolvedValue([]),
    ensureRunning: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue(0),
    stop: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    logs: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runInSandbox", () => {
  it("calls ensureRunning then exec with the adapter binary and args", async () => {
    const driver = fakeDriver({ exec: vi.fn().mockResolvedValue(0) });
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "ephemeral" };
    const code = await runInSandbox(driver, sandbox, "claude", ["--settings", "{}"], "/tmp/runs/dev");
    expect(driver.ensureRunning).toHaveBeenCalledWith(sandbox, "/tmp/runs/dev");
    expect(driver.exec).toHaveBeenCalledWith(sandbox, "claude", ["--settings", "{}"], "/tmp/runs/dev");
    expect(code).toBe(0);
  });

  it("destroys the sandbox after exec when lifecycle is ephemeral", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "ephemeral" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).toHaveBeenCalledWith(sandbox);
  });

  it("does not destroy the sandbox after exec when lifecycle is persistent", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "persistent" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).not.toHaveBeenCalled();
  });

  it("treats an unset lifecycle as ephemeral (destroys after exec)", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).toHaveBeenCalledWith(sandbox);
  });

  it("propagates the exit code from exec", async () => {
    const driver = fakeDriver({ exec: vi.fn().mockResolvedValue(7) });
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(code).toBe(7);
  });
});

// ─── run() ephemeral sandbox cleanup vs. process.exit ───────────────────────
//
// Regression test for the bug where `process.exit(code)` sat inside the
// `try` of a try/finally: a real process.exit() terminates the process
// immediately without running an enclosing finally still on the stack, so
// the ephemeral runs-dir cleanup (fs.rmSync) never happened. Mocking
// process.exit in-process can't distinguish the buggy code from the fix
// (any mock that doesn't actually terminate the process restores normal
// finally-on-unwind semantics for both), so this drives run()'s real
// sandbox-dispatch branch — including its real process.exit call — in a
// throwaway child process, then asserts the runs dir is gone afterward.
describe("run() sandbox dispatch (child-process integration)", () => {
  it("removes the ephemeral sandbox runs dir even though process.exit is called", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gent-run-test-"));
    const sandboxesDir = path.join(projectRoot, ".gent", "sandboxes");
    fs.mkdirSync(sandboxesDir, { recursive: true });
    fs.writeFileSync(
      path.join(sandboxesDir, "ephemeral-test-sandbox.yaml"),
      "driver: local\nlifecycle: ephemeral\n",
      "utf8"
    );

    const fixture = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "run-ephemeral-sandbox.ts"
    );

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", fixture],
      {
        // cwd stays at the repo root so Node can resolve the `tsx` loader
        // from its node_modules; GENT_PROJECT (not cwd) is what redirects
        // gent's own .gent lookup to the throwaway project dir. PATH is
        // stubbed out so adapter.binary ("claude") reliably resolves to
        // ENOENT inside the sandbox's local driver instead of invoking a
        // real, possibly-installed `claude` CLI.
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          GENT_PROJECT: projectRoot,
          PATH: "/nonexistent",
        },
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const runsDir = path.join(projectRoot, ".gent", "runs", "ephemeral-test-sandbox");
    expect(fs.existsSync(runsDir)).toBe(false);

    fs.rmSync(projectRoot, { recursive: true, force: true });
  });
});
