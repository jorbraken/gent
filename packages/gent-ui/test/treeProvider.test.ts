import { describe, expect, it } from "vitest";
import { GentTreeProvider } from "../src/tree/GentTreeProvider.js";

const snapshot = {
  gentDir: "/repo/.gent",
  diagnostics: [],
  entities: {
    profile: [{ kind: "profile", id: "coder", label: "coder", path: "/repo/.gent/profiles/coder.yaml", readonly: false }],
    sandbox: [{ kind: "sandbox", id: "local", label: "local", path: "/repo/.gent/sandboxes/local.yaml", readonly: false }],
    contextPack: [],
    skill: [],
    mcpServer: [],
    memory: [],
    decision: [],
    pipeline: [],
    run: [],
  },
};

describe("GentTreeProvider", () => {
  it("renders root groups and child entities", async () => {
    const provider = new GentTreeProvider({ snapshot: () => snapshot } as any);
    const roots = await provider.getChildren();
    expect(roots.map((r) => r.label)).toContain("Profiles");
    expect(roots.map((r) => r.label)).toContain("Sandboxes");

    const profiles = roots.find((r) => r.kind === "profile")!;
    const children = await provider.getChildren(profiles);
    expect(children[0]).toMatchObject({ label: "coder", entityId: "coder", kind: "profile" });
  });
});
