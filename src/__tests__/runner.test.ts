import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("expands ~/  paths and sets skillsDirectories", () => {
    const profile: Profile = {
      name: "dev",
      skills: ["~/skills/dev", "/abs/path"],
    };
    const result = buildSettings(profile);
    const dirs = result?.skillsDirectories as string[];
    expect(dirs[0]).not.toContain("~/");
    expect(dirs[1]).toBe("/abs/path");
  });

  it("merges skills into an otherwise-empty settings object", () => {
    const profile: Profile = { name: "dev", skills: ["/some/path"] };
    const result = buildSettings(profile);
    expect(result?.skillsDirectories).toEqual(["/some/path"]);
    expect(Object.keys(result ?? {}).length).toBe(1);
  });

  it("merges skills alongside existing settings", () => {
    const profile: Profile = {
      name: "dev",
      settings: { model: "claude-sonnet-4-6" },
      skills: ["/skills"],
    };
    const result = buildSettings(profile);
    expect(result?.model).toBe("claude-sonnet-4-6");
    expect(result?.skillsDirectories).toEqual(["/skills"]);
  });
});
