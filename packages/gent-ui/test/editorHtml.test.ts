import { describe, expect, it } from "vitest";
import { renderEntityEditorHtml } from "../src/editors/editorHtml.js";

describe("renderEntityEditorHtml", () => {
  it("renders source and visual panes with sandbox fields", () => {
    const html = renderEntityEditorHtml({
      nonce: "abc",
      entity: {
        kind: "sandbox",
        id: "local",
        label: "local",
        readonly: false,
        path: "/repo/.gent/sandboxes/local.yaml",
        content: "driver: local\nnetwork: full\n",
      },
      roundTrip: { safe: true, reason: "safe", message: "ok" },
    });
    expect(html).toContain("Source");
    expect(html).toContain("Visual");
    expect(html).toContain("name=\"driver\"");
    expect(html).toContain("name=\"network\"");
  });
});
