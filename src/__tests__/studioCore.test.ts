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

describe("studio CRUD and validation", () => {
  it("creates, reads, updates, and deletes a sandbox file", async () => {
    const { createEntity, readEntity, updateEntity, deleteEntity } = await freshStudio();
    const created = createEntity({ kind: "sandbox", id: "secure", variant: "apple-container" });
    expect(created).toMatchObject({ kind: "sandbox", id: "secure", readonly: false });

    const loaded = readEntity(created);
    expect(loaded.content).toContain("driver: apple-container");

    const updated = updateEntity(created, loaded.content.replace("network: none", "network: full"));
    expect(updated.content).toContain("network: full");

    deleteEntity(created);
    expect(fs.existsSync(created.path!)).toBe(false);
  });

  it("reports a diagnostic when a profile references a missing sandbox", async () => {
    const { createEntity, validateStudioWorkspace } = await freshStudio();
    createEntity({ kind: "profile", id: "coder", variant: "local" });
    const diagnostics = validateStudioWorkspace();
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: "profile.sandbox.missing",
      severity: "error",
      message: expect.stringContaining("local"),
    }));
  });

  it("allows a profile sandbox reference when the sandbox exists", async () => {
    const { createEntity, validateStudioWorkspace } = await freshStudio();
    createEntity({ kind: "sandbox", id: "local", variant: "local" });
    createEntity({ kind: "profile", id: "coder", variant: "local" });
    expect(validateStudioWorkspace().filter((d) => d.code === "profile.sandbox.missing")).toEqual([]);
  });

  it("marks invalid custom yaml as unsafe for visual save", async () => {
    const { createEntity, readEntity, updateEntity, assessRoundTripSafety } = await freshStudio();
    const ref = createEntity({ kind: "sandbox", id: "broken", variant: "local" });
    const loaded = updateEntity(ref, "driver: [unterminated\n", { allowInvalid: true });
    expect(readEntity(ref).content).toContain("unterminated");
    expect(assessRoundTripSafety(loaded)).toMatchObject({ safe: false, reason: "parse-error" });
  });
});
