import { describe, it, expect, vi } from "vitest";
import { getAdapter } from "../agents.js";
import type { GentConfig } from "../config.js";
import type { Profile } from "../profiles.js";

const emptyConfig: GentConfig = { mcp_servers: {} };

const configWithGithub: GentConfig = {
  mcp_servers: {
    github: { type: "stdio", command: "npx", args: ["-y", "server-github"] },
  },
};

// ─── pi adapter ──────────────────────────────────────────────────────────────

describe("pi adapter buildArgs", () => {
  const pi = getAdapter("pi");

  it("maps settings.model to --model", () => {
    const profile: Profile = { name: "p", agent: "pi", settings: { model: "anthropic/opus" } };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual(["--model", "anthropic/opus"]);
  });

  it("maps settings.effortLevel to --thinking", () => {
    const profile: Profile = { name: "p", agent: "pi", settings: { effortLevel: "high" } };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual(["--thinking", "high"]);
  });

  it("maps each skill to a --skill path", () => {
    const profile: Profile = { name: "p", agent: "pi", skills: ["a", "b"] };
    const args = pi.buildArgs(profile, emptyConfig, null);
    const skillFlags = args.filter((a) => a === "--skill");
    expect(skillFlags).toHaveLength(2);
    expect(args.some((a) => a.endsWith("/a"))).toBe(true);
    expect(args.some((a) => a.endsWith("/b"))).toBe(true);
  });

  it("inlines system_prompt_append in dry-run via --append-system-prompt", () => {
    const profile: Profile = { name: "p", agent: "pi", system_prompt_append: "be concise" };
    expect(pi.buildArgs(profile, emptyConfig, null)).toEqual([
      "--append-system-prompt",
      "be concise",
    ]);
  });

  it("warns and skips mcp servers", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const profile: Profile = { name: "p", agent: "pi", mcp: ["github"] };
    const args = pi.buildArgs(profile, configWithGithub, null);
    expect(args).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("warns and skips strict_mcp", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const profile: Profile = { name: "p", agent: "pi", strict_mcp: true };
    pi.buildArgs(profile, emptyConfig, null);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("warns and skips unsupported settings keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

// ─── claude adapter (refactor guard) ─────────────────────────────────────────

describe("claude adapter buildArgs", () => {
  const claude = getAdapter("claude");

  it("emits the expected flags in dry-run", () => {
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
});

describe("getAdapter", () => {
  it("defaults to claude", () => {
    expect(getAdapter().binary).toBe("claude");
    expect(getAdapter(undefined).binary).toBe("claude");
  });
});
