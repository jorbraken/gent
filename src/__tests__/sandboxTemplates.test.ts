import { describe, it, expect } from "vitest";
import { TEMPLATE_NAMES, isTemplateName, getTemplate } from "../sandboxTemplates.js";

describe("sandbox templates", () => {
  it("lists local and apple-container", () => {
    expect(TEMPLATE_NAMES).toEqual(["local", "apple-container"]);
  });

  it("isTemplateName accepts known templates and rejects unknown ones", () => {
    expect(isTemplateName("local")).toBe(true);
    expect(isTemplateName("apple-container")).toBe(true);
    expect(isTemplateName("podman")).toBe(false);
  });

  it("local template has driver local, full network, ephemeral lifecycle", () => {
    const t = getTemplate("local");
    expect(t.driver).toBe("local");
    expect(t.network).toBe("full");
    expect(t.lifecycle).toBe("ephemeral");
  });

  it("apple-container template has driver apple-container, none network, ephemeral lifecycle", () => {
    const t = getTemplate("apple-container");
    expect(t.driver).toBe("apple-container");
    expect(t.network).toBe("none");
    expect(t.lifecycle).toBe("ephemeral");
  });

  it("getTemplate throws for an unknown template", () => {
    expect(() => getTemplate("podman")).toThrow(/Unknown sandbox template/);
  });

  it("returns a fresh object each call (callers may mutate .id safely)", () => {
    const a = getTemplate("local");
    const b = getTemplate("local");
    expect(a).not.toBe(b);
  });
});
