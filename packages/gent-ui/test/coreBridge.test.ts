import { describe, expect, it } from "vitest";
import { GentCoreBridge } from "../src/coreBridge.js";

describe("GentCoreBridge", () => {
  it("exposes workspace snapshot and diagnostics methods", () => {
    const bridge = new GentCoreBridge();
    expect(typeof bridge.snapshot).toBe("function");
    expect(typeof bridge.validate).toBe("function");
    expect(typeof bridge.runGent).toBe("function");
  });
});
