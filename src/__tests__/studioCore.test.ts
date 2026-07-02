import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTITY_KINDS,
  ENTITY_REGISTRY,
  type GentEntityKind,
} from "../core/studio/index.js";

describe("studio entity registry", () => {
  it("lists every Gent UI sidebar entity in deterministic order", () => {
    expect(ENTITY_KINDS).toEqual([
      "profile",
      "sandbox",
      "contextPack",
      "skill",
      "mcpServer",
      "memory",
      "decision",
      "pipeline",
      "run",
    ] satisfies GentEntityKind[]);
  });

  it("marks runs read-only and every other sidebar entity editable", () => {
    expect(ENTITY_REGISTRY.run.readonly).toBe(true);
    for (const kind of ENTITY_KINDS.filter((k) => k !== "run")) {
      expect(ENTITY_REGISTRY[kind].readonly).toBe(false);
      expect(ENTITY_REGISTRY[kind].labelPlural.length).toBeGreaterThan(0);
    }
  });

  it("declares yaml-backed sandboxes with a sandboxes directory", () => {
    expect(ENTITY_REGISTRY.sandbox.directoryName).toBe("sandboxes");
    expect(ENTITY_REGISTRY.sandbox.fileExtension).toBe(".yaml");
  });
});

let tempHome: string;

async function freshStudio() {
  vi.resetModules();
  return import("../core/studio/index.js");
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-studio-test-"));
  process.env.GENT_HOME = tempHome;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("studio workspace listing", () => {
  it("lists profiles, sandboxes, skills, and runs from the active .gent dir", async () => {
    const { listStudioWorkspace } = await freshStudio();
    const gentDir = path.join(tempHome, ".gent");
    fs.mkdirSync(path.join(gentDir, "profiles"), { recursive: true });
    fs.mkdirSync(path.join(gentDir, "sandboxes"), { recursive: true });
    fs.mkdirSync(path.join(gentDir, "skills", "debugging"), { recursive: true });
    fs.mkdirSync(path.join(gentDir, "runs", "2026-07-01T00-00-00"), { recursive: true });
    fs.writeFileSync(path.join(gentDir, "profiles", "coder.yaml"), "name: coder\n", "utf8");
    fs.writeFileSync(path.join(gentDir, "sandboxes", "local.yaml"), "driver: local\n", "utf8");

    const snapshot = listStudioWorkspace();

    expect(snapshot.gentDir).toBe(gentDir);
    expect(snapshot.entities.profile.map((e) => e.id)).toEqual(["coder"]);
    expect(snapshot.entities.sandbox.map((e) => e.id)).toEqual(["local"]);
    expect(snapshot.entities.skill.map((e) => e.id)).toEqual(["debugging"]);
    expect(snapshot.entities.run[0]).toMatchObject({ id: "2026-07-01T00-00-00", readonly: true });
  });
});

describe("studio entity templates", () => {
  it("creates local and apple-container sandbox templates", async () => {
    const { templateForEntity } = await freshStudio();
    expect(templateForEntity("sandbox", "fast", "local").content).toContain("driver: local");
    const apple = templateForEntity("sandbox", "secure", "apple-container").content;
    expect(apple).toContain("driver: apple-container");
    expect(apple).toContain("network: none");
  });

  it("creates a profile template with optional sandbox reference", async () => {
    const { templateForEntity } = await freshStudio();
    const profile = templateForEntity("profile", "coder", "local").content;
    expect(profile).toContain("name: coder");
    expect(profile).toContain("sandbox: local");
  });
});
