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

function globalGent() {
  return path.join(globalHome, ".gent");
}
function localGent() {
  return path.join(projectRoot, ".gent");
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
  process.env.GENT_HOME = globalHome;
  process.env.GENT_PROJECT = projectRoot;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  delete process.env.GENT_PROJECT;
  fs.rmSync(globalHome, { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
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
