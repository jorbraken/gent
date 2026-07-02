import { describe, expect, it } from "vitest";
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
