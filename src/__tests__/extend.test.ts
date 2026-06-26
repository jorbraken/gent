import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

// Exercises `extend_global`: a project-local .gent/ that also inherits
// profiles, skills, and MCP servers from ~/.gent. GENT_HOME points the global
// dir at a temp location and GENT_PROJECT points the local dir at another, so
// the two are distinct and isolated from the real ~/.gent.

let globalHome: string;
let projectRoot: string;
let extraDirs: string[];

function globalGent() {
  return path.join(globalHome, ".gent");
}
function localGent() {
  return path.join(projectRoot, ".gent");
}

// Create a standalone .gent dir (with profiles/ + skills/) under a fresh temp
// root and return its path. Tracked for cleanup. `config` becomes config.yaml.
function makeGent(label: string, config: object = { mcp_servers: {} }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `gent-${label}-`));
  extraDirs.push(root);
  const g = path.join(root, ".gent");
  fs.mkdirSync(path.join(g, "profiles"), { recursive: true });
  fs.mkdirSync(path.join(g, "skills"), { recursive: true });
  fs.writeFileSync(path.join(g, "config.yaml"), yaml.dump(config), "utf8");
  return g;
}

function writeProfile(gentDir: string, name: string, body: object) {
  const dir = path.join(gentDir, "profiles");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.yaml`), yaml.dump(body), "utf8");
}

function writeConfig(gentDir: string, config: object) {
  fs.mkdirSync(gentDir, { recursive: true });
  fs.writeFileSync(path.join(gentDir, "config.yaml"), yaml.dump(config), "utf8");
}

function setExtend(on: boolean) {
  writeConfig(localGent(), { mcp_servers: {}, ...(on ? { extend_global: true } : {}) });
}

async function fresh() {
  vi.resetModules();
  const cfg = await import("../config.js");
  const prof = await import("../profiles.js");
  return { ...cfg, ...prof };
}

beforeEach(() => {
  globalHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-global-"));
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gent-project-"));
  extraDirs = [];
  process.env.GENT_HOME = globalHome;
  process.env.GENT_PROJECT = projectRoot;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  delete process.env.GENT_PROJECT;
  fs.rmSync(globalHome, { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
  for (const d of extraDirs) fs.rmSync(d, { recursive: true, force: true });
  vi.resetModules();
});

describe("extend_global — profiles", () => {
  it("resolves a profile that exists only in ~/.gent", async () => {
    setExtend(true);
    writeProfile(globalGent(), "shared", { description: "from global" });
    const { loadProfile } = await fresh();
    expect(loadProfile("shared").description).toBe("from global");
  });

  it("does NOT consult ~/.gent when extend_global is off", async () => {
    setExtend(false);
    writeProfile(globalGent(), "shared", { description: "from global" });
    const { loadProfile } = await fresh();
    expect(() => loadProfile("shared")).toThrow(/not found/);
  });

  it("local profile shadows a global one of the same name", async () => {
    setExtend(true);
    writeProfile(globalGent(), "dev", { description: "global dev" });
    writeProfile(localGent(), "dev", { description: "local dev" });
    const { loadProfile } = await fresh();
    expect(loadProfile("dev").description).toBe("local dev");
  });

  it("listProfiles unions both dirs, local winning on conflicts", async () => {
    setExtend(true);
    writeProfile(globalGent(), "dev", { description: "global dev" });
    writeProfile(globalGent(), "qa", { description: "global qa" });
    writeProfile(localGent(), "dev", { description: "local dev" });
    const { listProfiles } = await fresh();
    const byName = Object.fromEntries(listProfiles().map((p) => [p.name, p.description]));
    expect(byName).toEqual({ dev: "local dev", qa: "global qa" });
  });

  it("a local profile can extend a parent defined only in ~/.gent", async () => {
    setExtend(true);
    writeProfile(globalGent(), "base", { mcp: ["github"] });
    writeProfile(localGent(), "child", { extends: "base", mcp: ["fetch"] });
    const { loadProfile } = await fresh();
    expect(loadProfile("child").mcp).toEqual(["github", "fetch"]);
  });
});

describe("extend_global — config / skills", () => {
  it("merges MCP servers with local overriding global", async () => {
    writeConfig(globalGent(), {
      mcp_servers: {
        github: { type: "stdio", command: "global-npx" },
        fetch: { type: "stdio", command: "fetch-cmd" },
      },
    });
    writeConfig(localGent(), {
      extend_global: true,
      mcp_servers: { github: { type: "stdio", command: "local-npx" } },
    });
    const { loadConfig } = await fresh();
    const cfg = loadConfig();
    expect(cfg.mcp_servers.github.command).toBe("local-npx"); // local wins
    expect(cfg.mcp_servers.fetch.command).toBe("fetch-cmd"); // inherited
  });

  it("loadLocalConfig only sees local servers", async () => {
    writeConfig(globalGent(), {
      mcp_servers: { github: { type: "stdio", command: "global-npx" } },
    });
    writeConfig(localGent(), {
      extend_global: true,
      mcp_servers: { fetch: { type: "stdio", command: "fetch-cmd" } },
    });
    const { loadLocalConfig } = await fresh();
    expect(Object.keys(loadLocalConfig().mcp_servers)).toEqual(["fetch"]);
  });

  it("listSkills unions skills from both dirs", async () => {
    setExtend(true);
    fs.mkdirSync(path.join(globalGent(), "skills", "docker"), { recursive: true });
    fs.mkdirSync(path.join(localGent(), "skills", "local-skill"), { recursive: true });
    const { listSkills } = await fresh();
    expect(listSkills()).toEqual(["docker", "local-skill"]);
  });

  it("resolveSkillPath prefers the local skill over a global one", async () => {
    setExtend(true);
    fs.mkdirSync(path.join(globalGent(), "skills", "dup"), { recursive: true });
    fs.mkdirSync(path.join(localGent(), "skills", "dup"), { recursive: true });
    const { resolveSkillPath } = await fresh();
    expect(resolveSkillPath("dup")).toBe(path.join(localGent(), "skills", "dup"));
  });
});

// ─── composable hierarchies: chain order / cycles (buildGentDirChain) ────────

describe("buildGentDirChain — ordering & cycles", () => {
  it("flattens a multi-level chain local-first (A -> B -> C)", async () => {
    const c = makeGent("c");
    const b = makeGent("b", { mcp_servers: {}, extends: [c] });
    const a = makeGent("a", { mcp_servers: {}, extends: [b] });
    const { buildGentDirChain } = await fresh();
    expect(buildGentDirChain(a)).toEqual([a, b, c]);
  });

  it("keeps multiple parents in declared order (A extends [B, C])", async () => {
    const b = makeGent("b");
    const c = makeGent("c");
    const a = makeGent("a", { mcp_servers: {}, extends: [b, c] });
    const { buildGentDirChain } = await fresh();
    expect(buildGentDirChain(a)).toEqual([a, b, c]);
  });

  it("diamond resolves first-occurrence-wins (A,[B,C] -> D = A,B,D,C)", async () => {
    const d = makeGent("d");
    const b = makeGent("b", { mcp_servers: {}, extends: [d] });
    const c = makeGent("c", { mcp_servers: {}, extends: [d] });
    const a = makeGent("a", { mcp_servers: {}, extends: [b, c] });
    const { buildGentDirChain } = await fresh();
    expect(buildGentDirChain(a)).toEqual([a, b, d, c]);
  });

  it("throws on a mutual cycle (A <-> B)", async () => {
    const a = makeGent("a");
    const b = makeGent("b");
    writeConfig(a, { mcp_servers: {}, extends: [b] });
    writeConfig(b, { mcp_servers: {}, extends: [a] });
    const { buildGentDirChain } = await fresh();
    expect(() => buildGentDirChain(a)).toThrow(/circular/i);
  });

  it("throws on a self cycle (A -> A)", async () => {
    const a = makeGent("a");
    writeConfig(a, { mcp_servers: {}, extends: [a] });
    const { buildGentDirChain } = await fresh();
    expect(() => buildGentDirChain(a)).toThrow(/circular/i);
  });

  it("warns and skips a missing parent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = path.join(os.tmpdir(), "gent-does-not-exist-xyz", ".gent");
    const a = makeGent("a", { mcp_servers: {}, extends: [missing] });
    const { buildGentDirChain } = await fresh();
    expect(buildGentDirChain(a)).toEqual([a]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("expands a leading ~/ in extends entries", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = makeGent("a", { mcp_servers: {}, extends: ["~/__gent_missing_xyz__/.gent"] });
    const { buildGentDirChain } = await fresh();
    buildGentDirChain(a);
    // The (missing) target is warned with ~ expanded to the home directory.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(path.join(os.homedir(), "__gent_missing_xyz__", ".gent"))
    );
    warn.mockRestore();
  });

  it("appends ~/.gent last when extend_global composes with extends", async () => {
    const b = makeGent("b");
    writeConfig(localGent(), { mcp_servers: {}, extends: [b], extend_global: true });
    fs.mkdirSync(globalGent(), { recursive: true });
    const { buildGentDirChain, GENT_DIR, GLOBAL_GENT_DIR } = await fresh();
    expect(buildGentDirChain(GENT_DIR)).toEqual([GENT_DIR, b, GLOBAL_GENT_DIR]);
  });
});

// ─── composable hierarchies: end-to-end resolution ──────────────────────────

describe("composable hierarchies — resolution", () => {
  it("resolves profiles, skills, and MCP servers transitively (leaf -> mid -> root)", async () => {
    const root = makeGent("root", {
      mcp_servers: { github: { type: "stdio", command: "root-npx" } },
    });
    writeProfile(root, "shared", { description: "from root" });
    fs.mkdirSync(path.join(root, "skills", "root-skill"), { recursive: true });
    const mid = makeGent("mid", { mcp_servers: {}, extends: [root] });
    writeConfig(localGent(), { mcp_servers: {}, extends: [mid] });

    const { loadProfile, listProfiles, listSkills, loadConfig } = await fresh();
    expect(loadProfile("shared").description).toBe("from root");
    expect(listProfiles().map((p) => p.name)).toContain("shared");
    expect(listSkills()).toContain("root-skill");
    expect(loadConfig().mcp_servers.github.command).toBe("root-npx");
  });

  it("nearer dirs win on profile name conflicts", async () => {
    const root = makeGent("root");
    writeProfile(root, "p", { description: "root" });
    const mid = makeGent("mid", { mcp_servers: {}, extends: [root] });
    writeProfile(mid, "p", { description: "mid" });
    writeConfig(localGent(), { mcp_servers: {}, extends: [mid] });
    writeProfile(localGent(), "p", { description: "leaf" });

    const { loadProfile } = await fresh();
    expect(loadProfile("p").description).toBe("leaf");
  });

  it("merges MCP servers across 3 levels, nearest winning", async () => {
    const root = makeGent("root", {
      mcp_servers: {
        a: { type: "stdio", command: "root-a" },
        shared: { type: "stdio", command: "root-shared" },
      },
    });
    const mid = makeGent("mid", {
      mcp_servers: {
        b: { type: "stdio", command: "mid-b" },
        shared: { type: "stdio", command: "mid-shared" },
      },
      extends: [root],
    });
    writeConfig(localGent(), {
      mcp_servers: { c: { type: "stdio", command: "leaf-c" } },
      extends: [mid],
    });

    const { loadConfig } = await fresh();
    const m = loadConfig().mcp_servers;
    expect(m.a.command).toBe("root-a");
    expect(m.b.command).toBe("mid-b");
    expect(m.c.command).toBe("leaf-c");
    expect(m.shared.command).toBe("mid-shared"); // mid is nearer than root
  });

  it("resolves a relative extends path against the referencing .gent dir", async () => {
    const sibling = path.join(projectRoot, "sibling", ".gent");
    writeConfig(sibling, { mcp_servers: {} });
    writeProfile(sibling, "sib", { description: "from sibling" });
    writeConfig(localGent(), { mcp_servers: {}, extends: ["../sibling/.gent"] });

    const { loadProfile } = await fresh();
    expect(loadProfile("sib").description).toBe("from sibling");
  });

  it("throws a circular error through loadProfile when the chain loops", async () => {
    const other = makeGent("other");
    writeConfig(localGent(), { mcp_servers: {}, extends: [other] });
    writeConfig(other, { mcp_servers: {}, extends: [localGent()] });
    const { loadProfile } = await fresh();
    expect(() => loadProfile("anything")).toThrow(/circular/i);
  });
});
