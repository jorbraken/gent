import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

let tempHome: string;

async function fresh() {
  vi.resetModules();
  const cfg = await import("../config.js");
  const prof = await import("../profiles.js");
  return { ...cfg, ...prof };
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

// ─── profilePath ─────────────────────────────────────────────────────────────

describe("profilePath", () => {
  it("returns path inside PROFILES_DIR ending with <name>.yaml", async () => {
    const { profilePath, PROFILES_DIR } = await fresh();
    expect(profilePath("dev")).toBe(path.join(PROFILES_DIR, "dev.yaml"));
  });

  it("rejects names with path traversal characters", async () => {
    const { profilePath } = await fresh();
    expect(() => profilePath("../../etc/passwd")).toThrow(/Invalid profile name/);
  });

  it("rejects names with spaces or special characters", async () => {
    const { profilePath } = await fresh();
    expect(() => profilePath("my profile!")).toThrow(/Invalid profile name/);
  });

  it("accepts names with hyphens and underscores", async () => {
    const { profilePath, PROFILES_DIR } = await fresh();
    expect(profilePath("my-profile_1")).toBe(path.join(PROFILES_DIR, "my-profile_1.yaml"));
  });
});

// ─── expandHome ──────────────────────────────────────────────────────────────

describe("expandHome", () => {
  it("expands ~/ to homedir", async () => {
    const { expandHome } = await fresh();
    expect(expandHome("~/skills/dev")).toBe(
      path.join(os.homedir(), "skills/dev")
    );
  });

  it("leaves absolute paths untouched", async () => {
    const { expandHome } = await fresh();
    expect(expandHome("/usr/local/skills")).toBe("/usr/local/skills");
  });

  it("leaves relative paths untouched", async () => {
    const { expandHome } = await fresh();
    expect(expandHome("skills/dev")).toBe("skills/dev");
  });
});

// ─── mergeProfiles ───────────────────────────────────────────────────────────

describe("mergeProfiles", () => {
  it("returns the single profile unchanged", async () => {
    const { mergeProfiles } = await fresh();
    const p = { name: "dev", mcp: ["github"] };
    expect(mergeProfiles([p])).toBe(p);
  });

  it("unions mcp arrays and deduplicates", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev", mcp: ["github", "fetch"] };
    const b = { name: "qa", mcp: ["fetch", "playwright"] };
    const result = mergeProfiles([a, b]);
    expect(result.mcp).toEqual(["github", "fetch", "playwright"]);
  });

  it("unions skills arrays and deduplicates", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev", skills: ["/a", "/b"] };
    const b = { name: "qa", skills: ["/b", "/c"] };
    const result = mergeProfiles([a, b]);
    expect(result.skills).toEqual(["/a", "/b", "/c"]);
  });

  it("ORs strict_mcp (false + true = true)", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev", strict_mcp: false };
    const b = { name: "qa", strict_mcp: true };
    expect(mergeProfiles([a, b]).strict_mcp).toBe(true);
  });

  it("later profile settings win (last-writer-wins)", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev", settings: { model: "claude-haiku-4-5-20251001", permissionMode: "auto" } };
    const b = { name: "qa", settings: { model: "claude-sonnet-4-6" } };
    const result = mergeProfiles([a, b]);
    expect(result.settings?.model).toBe("claude-sonnet-4-6");
    expect(result.settings?.permissionMode).toBe("auto");
  });

  it("concatenates system_prompt_append with double newline", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev", system_prompt_append: "Focus on clean code." };
    const b = { name: "qa", system_prompt_append: "Write comprehensive tests." };
    expect(mergeProfiles([a, b]).system_prompt_append).toBe(
      "Focus on clean code.\n\nWrite comprehensive tests."
    );
  });

  it("produces a synthetic name joined with +", async () => {
    const { mergeProfiles } = await fresh();
    const result = mergeProfiles([{ name: "dev" }, { name: "qa" }]);
    expect(result.name).toBe("dev+qa");
  });

  it("handles profiles with no mcp/skills gracefully", async () => {
    const { mergeProfiles } = await fresh();
    const a = { name: "dev" };
    const b = { name: "qa", mcp: ["playwright"] };
    const result = mergeProfiles([a, b]);
    expect(result.mcp).toEqual(["playwright"]);
    expect(result.skills).toEqual([]);
  });

  it("throws when called with an empty array", async () => {
    const { mergeProfiles } = await fresh();
    expect(() => mergeProfiles([])).toThrow(/at least one/);
  });
});

// ─── loadProfile ─────────────────────────────────────────────────────────────

describe("loadProfile", () => {
  it("throws when profile file does not exist", async () => {
    const { loadProfile } = await fresh();
    expect(() => loadProfile("nonexistent")).toThrow(/nonexistent/);
  });

  it("parses a profile YAML file", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "dev.yaml"),
      `name: dev\ndescription: Dev profile\nmcp:\n  - github\n`,
      "utf8"
    );
    const profile = loadProfile("dev");
    expect(profile.description).toBe("Dev profile");
    expect(profile.mcp).toEqual(["github"]);
  });

  it("filename overrides the name field inside the YAML", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "ui.yaml"),
      `name: designer\ndescription: UI profile\n`,
      "utf8"
    );
    const profile = loadProfile("ui");
    expect(profile.name).toBe("ui");
  });

  it("resolves extends: child inherits parent mcp list", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "base.yaml"),
      `description: Base\nmcp:\n  - github\n  - fetch\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "child.yaml"),
      `extends: base\nmcp:\n  - playwright\n`,
      "utf8"
    );
    const profile = loadProfile("child");
    expect(profile.mcp).toEqual(["github", "fetch", "playwright"]);
  });

  it("resolves extends: child fields override parent fields", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "base.yaml"),
      `description: Base\nsettings:\n  model: claude-haiku-4-5-20251001\n  permissionMode: auto\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "child.yaml"),
      `extends: base\nsettings:\n  model: claude-sonnet-4-6\n`,
      "utf8"
    );
    const profile = loadProfile("child");
    expect(profile.settings?.model).toBe("claude-sonnet-4-6");
    expect(profile.settings?.permissionMode).toBe("auto");
  });

  it("resolves multi-level extends chain (grandparent → parent → child)", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "gp.yaml"),
      `mcp:\n  - github\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "parent.yaml"),
      `extends: gp\nmcp:\n  - fetch\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "child.yaml"),
      `extends: parent\nmcp:\n  - playwright\n`,
      "utf8"
    );
    const profile = loadProfile("child");
    expect(profile.mcp).toEqual(["github", "fetch", "playwright"]);
  });

  it("throws on circular extends", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "a.yaml"),
      `extends: b\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "b.yaml"),
      `extends: a\n`,
      "utf8"
    );
    expect(() => loadProfile("a")).toThrow(/[Cc]ircular/);
  });

  it("resolves extends with multiple parents (array form)", async () => {
    const { loadProfile, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "p1.yaml"),
      `mcp:\n  - github\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "p2.yaml"),
      `mcp:\n  - playwright\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(PROFILES_DIR, "child.yaml"),
      `extends:\n  - p1\n  - p2\nmcp:\n  - fetch\n`,
      "utf8"
    );
    const profile = loadProfile("child");
    expect(profile.mcp).toEqual(["github", "playwright", "fetch"]);
  });
});

// ─── saveProfile / loadProfile round-trip ────────────────────────────────────

describe("saveProfile → loadProfile round-trip", () => {
  it("persists and restores a profile", async () => {
    const { saveProfile, loadProfile } = await fresh();
    const profile = {
      name: "qa",
      description: "QA testing",
      mcp: ["playwright", "sentry"],
      strict_mcp: true,
      settings: { model: "claude-sonnet-4-6", permissionMode: "auto" },
    };
    saveProfile(profile);
    const loaded = loadProfile("qa");
    expect(loaded.description).toBe("QA testing");
    expect(loaded.mcp).toEqual(["playwright", "sentry"]);
    expect(loaded.strict_mcp).toBe(true);
    expect(loaded.settings?.model).toBe("claude-sonnet-4-6");
  });
});

// ─── listProfiles ─────────────────────────────────────────────────────────────

describe("listProfiles", () => {
  it("returns [] when profiles directory does not exist", async () => {
    const { listProfiles } = await fresh();
    expect(listProfiles()).toEqual([]);
  });

  it("returns one entry per .yaml file", async () => {
    const { listProfiles, saveProfile } = await fresh();
    saveProfile({ name: "dev", description: "Dev" });
    saveProfile({ name: "qa", description: "QA" });
    const names = listProfiles().map((p) => p.name).sort();
    expect(names).toEqual(["dev", "qa"]);
  });

  it("ignores non-.yaml files", async () => {
    const { listProfiles, PROFILES_DIR } = await fresh();
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(path.join(PROFILES_DIR, "README.md"), "# profiles", "utf8");
    expect(listProfiles()).toEqual([]);
  });
});
