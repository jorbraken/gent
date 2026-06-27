import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import type { GentConfig } from "../config.js";
import type { Profile } from "../profiles.js";

const emptyConfig: GentConfig = { mcp_servers: {} };

const configWithGithub: GentConfig = {
  mcp_servers: {
    github: { type: "stdio", command: "npx", args: ["-y", "server-github"] },
  },
};

// Skills resolve relative to the active gent dir; GENT_HOME redirects ~/.gent to
// a temp dir (in NODE_ENV=test) so we can lay down real SKILL.md fixtures.
let tempHome: string;
let skillsDir: string;

async function adapters() {
  vi.resetModules();
  return import("../agents.js");
}

// Create a single skill directory (<parent>/<name>/SKILL.md).
function writeSkill(parent: string, name: string, frontmatterExtra = ""): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill${frontmatterExtra}\n---\nbody\n`
  );
  return dir;
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-agents-"));
  process.env.GENT_HOME = tempHome;
  skillsDir = path.join(tempHome, ".gent", "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

// ─── pi adapter ──────────────────────────────────────────────────────────────

describe("pi adapter buildArgs", () => {
  it("maps settings.model to --model", async () => {
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", settings: { model: "anthropic/opus" } };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual(["--model", "anthropic/opus"]);
  });

  it("maps settings.effortLevel to --thinking", async () => {
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", settings: { effortLevel: "high" } };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual(["--thinking", "high"]);
  });

  it("maps each individual skill to a --skill path", async () => {
    writeSkill(skillsDir, "a");
    writeSkill(skillsDir, "b");
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", skills: ["a", "b"] };
    const args = pi.buildArgs(profile, emptyConfig, null);
    expect(args.filter((a) => a === "--skill")).toHaveLength(2);
    expect(args.some((a) => a.endsWith("/a"))).toBe(true);
    expect(args.some((a) => a.endsWith("/b"))).toBe(true);
  });

  it("flattens a categorized collection into one --skill per skill", async () => {
    // mattpocock-style: <name>/skills/<category>/<skill>/SKILL.md
    const collection = path.join(skillsDir, "coll", "skills", "engineering");
    fs.mkdirSync(collection, { recursive: true });
    writeSkill(collection, "tdd");
    writeSkill(collection, "implement");
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", skills: ["coll"] };
    const args = pi.buildArgs(profile, emptyConfig, null);
    expect(args.filter((a) => a === "--skill")).toHaveLength(2);
    expect(args.some((a) => a.endsWith("/tdd"))).toBe(true);
    expect(args.some((a) => a.endsWith("/implement"))).toBe(true);
  });

  it("inlines system_prompt_append in dry-run via --append-system-prompt", async () => {
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", system_prompt_append: "be concise" };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual([
      "--append-system-prompt",
      "be concise",
    ]);
  });

  it("warns and skips mcp servers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", mcp: ["github"] };
    const args = pi.buildArgs(profile, configWithGithub, null);
    expect(args).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("warns and skips strict_mcp", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = { name: "p", agent: "pi", strict_mcp: true };
    pi.buildArgs(profile, emptyConfig, null);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("warns and skips unsupported settings keys", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = (await adapters()).getAdapter("pi");
    const profile: Profile = {
      name: "p",
      agent: "pi",
      settings: { model: "x", permissionMode: "auto" },
    };
    const args = pi.buildArgs(profile, emptyConfig, null);
    expect(args).toEqual(["--model", "x"]);
    expect(warn).toHaveBeenCalledOnce(); // only permissionMode warns
    warn.mockRestore();
  });
});

// ─── claude adapter ──────────────────────────────────────────────────────────

describe("claude adapter buildArgs", () => {
  it("emits the expected flags in dry-run", async () => {
    const claude = (await adapters()).getAdapter("claude");
    const profile: Profile = {
      name: "p",
      mcp: ["github"],
      strict_mcp: true,
      settings: { model: "claude-sonnet-4-6" },
      system_prompt_append: "hi",
    };
    const args = claude.buildArgs(profile, configWithGithub, null);
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--settings");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("hi");
  });

  it("passes a real plugin (with .claude-plugin/plugin.json) straight through", async () => {
    const pluginDir = path.join(skillsDir, "my-plugin");
    fs.mkdirSync(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "my-plugin", version: "1.0.0" })
    );
    const claude = (await adapters()).getAdapter("claude");
    const profile: Profile = { name: "p", skills: ["my-plugin"] };
    const args = claude.buildArgs(profile, emptyConfig, null);
    const i = args.indexOf("--plugin-dir");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe(pluginDir);
  });

  it("dry-run summarizes aggregated loose skills", async () => {
    writeSkill(skillsDir, "a");
    writeSkill(skillsDir, "b");
    const claude = (await adapters()).getAdapter("claude");
    const profile: Profile = { name: "p", skills: ["a", "b"] };
    const args = claude.buildArgs(profile, emptyConfig, null);
    const i = args.indexOf("--plugin-dir");
    expect(args[i + 1]).toContain("skills-plugin");
    expect(args[i + 1]).toContain("a");
    expect(args[i + 1]).toContain("b");
  });

  it("builds a temp plugin with a manifest and flat skill symlinks", async () => {
    writeSkill(skillsDir, "solo");
    // categorized collection that must be flattened
    const coll = path.join(skillsDir, "coll", "skills", "engineering");
    fs.mkdirSync(coll, { recursive: true });
    writeSkill(coll, "tdd");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gent-run-"));

    const claude = (await adapters()).getAdapter("claude");
    const profile: Profile = { name: "p", skills: ["solo", "coll"] };
    const args = claude.buildArgs(profile, emptyConfig, tmpDir);

    const pluginRoot = path.join(tmpDir, "skills-plugin");
    expect(args).toContain("--plugin-dir");
    expect(args).toContain(pluginRoot);
    // manifest is required by claude's --plugin-dir
    expect(fs.existsSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"))).toBe(true);
    // each skill is a flat entry under skills/ pointing at the real dir
    expect(fs.existsSync(path.join(pluginRoot, "skills", "solo", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(pluginRoot, "skills", "tdd", "SKILL.md"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("warns when a referenced skill has no SKILL.md anywhere", async () => {
    fs.mkdirSync(path.join(skillsDir, "empty"), { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const claude = (await adapters()).getAdapter("claude");
    const profile: Profile = { name: "p", skills: ["empty"] };
    const args = claude.buildArgs(profile, emptyConfig, null);
    expect(args).not.toContain("--plugin-dir");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("getAdapter", () => {
  it("defaults to claude", async () => {
    const { getAdapter } = await adapters();
    expect(getAdapter().binary).toBe("claude");
    expect(getAdapter(undefined).binary).toBe("claude");
  });
});
