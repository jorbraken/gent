import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Gent UI packaged extension", () => {
  it("builds the extension entrypoint", () => {
    const entry = path.resolve(__dirname, "../dist/extension.js");
    expect(fs.existsSync(entry)).toBe(true);
  });
});
