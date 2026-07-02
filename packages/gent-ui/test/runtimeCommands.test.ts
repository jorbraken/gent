import { describe, expect, it } from "vitest";
import { buildSandboxLifecycleArgs, buildInspectArgs, buildPreviewArgs } from "../src/commands/runtimeCommands.js";

describe("runtime command args", () => {
  it("builds inspect and preview args", () => {
    expect(buildInspectArgs("coder")).toEqual(["inspect", "coder"]);
    expect(buildPreviewArgs("coder", "feature.md")).toEqual(["preview", "coder", "feature.md"]);
  });

  it("builds sandbox lifecycle args", () => {
    expect(buildSandboxLifecycleArgs("local", "validate")).toEqual(["sandbox", "local", "validate"]);
    expect(buildSandboxLifecycleArgs("local", "destroy")).toEqual(["sandbox", "local", "destroy"]);
  });
});
