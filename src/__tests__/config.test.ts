import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

// Each test suite that touches the filesystem gets its own temp home dir.
// GENT_HOME is read at module load, so we reset modules before each test.

let tempHome: string;

async function freshConfig() {
  vi.resetModules();
  return import("../config.js");
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-test-"));
  process.env.GENT_HOME = tempHome;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

// ─── interpolateEnv ─────────────────────────────────────────────────────────

describe("interpolateEnv", () => {
  it("substitutes a known env var", async () => {
    const { interpolateEnv } = await freshConfig();
    process.env._GENT_TEST_VAR = "hello";
    expect(interpolateEnv("${_GENT_TEST_VAR}")).toBe("hello");
    delete process.env._GENT_TEST_VAR;
  });

  it("leaves unknown vars as empty string", async () => {
    const { interpolateEnv } = await freshConfig();
    expect(interpolateEnv("${_GENT_UNDEFINED_XYZ}")).toBe("");
  });

  it("passes through strings with no placeholder", async () => {
    const { interpolateEnv } = await freshConfig();
    expect(interpolateEnv("plain-value")).toBe("plain-value");
  });

  it("handles multiple placeholders in one string", async () => {
    const { interpolateEnv } = await freshConfig();
    process.env._A = "foo";
    process.env._B = "bar";
    expect(interpolateEnv("${_A}:${_B}")).toBe("foo:bar");
    delete process.env._A;
    delete process.env._B;
  });
});

// ─── resolveEnv ─────────────────────────────────────────────────────────────

describe("resolveEnv", () => {
  it("applies interpolation to every value", async () => {
    const { resolveEnv } = await freshConfig();
    process.env._TOKEN = "secret";
    const result = resolveEnv({ TOKEN: "${_TOKEN}", STATIC: "val" });
    expect(result).toEqual({ TOKEN: "secret", STATIC: "val" });
    delete process.env._TOKEN;
  });
});

// ─── loadConfig ─────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  it("returns empty mcp_servers when config file does not exist", async () => {
    const { loadConfig } = await freshConfig();
    expect(loadConfig()).toEqual({ mcp_servers: {} });
  });

  it("parses a valid config YAML file", async () => {
    const { loadConfig, GENT_DIR, CONFIG_PATH } = await freshConfig();
    fs.mkdirSync(GENT_DIR, { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      `mcp_servers:\n  github:\n    type: stdio\n    command: npx\n    args:\n      - -y\n      - "@modelcontextprotocol/server-github"\n`,
      "utf8"
    );
    const config = loadConfig();
    expect(config.mcp_servers.github).toMatchObject({
      type: "stdio",
      command: "npx",
    });
  });
});

// ─── saveConfig / loadConfig round-trip ─────────────────────────────────────

describe("saveConfig → loadConfig round-trip", () => {
  it("persists and restores a config", async () => {
    const { saveConfig, loadConfig } = await freshConfig();
    const config = {
      mcp_servers: {
        slack: {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-slack"],
          env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
        },
      },
    };
    saveConfig(config);
    expect(loadConfig()).toEqual(config);
  });
});
