import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

// The scaffold registry lives in the global ~/.gent; GENT_HOME redirects that
// to a temp dir so these tests stay isolated from the real home.

let tempHome: string;

async function fresh() {
  vi.resetModules();
  return import("../scaffolds.js");
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-scaffolds-"));
  process.env.GENT_HOME = tempHome;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("scaffold registry", () => {
  it("returns [] when nothing is registered", async () => {
    const { listScaffolds } = await fresh();
    expect(listScaffolds()).toEqual([]);
  });

  it("registers a folder and lists it", async () => {
    const { registerScaffold, listScaffolds } = await fresh();
    registerScaffold("/some/project/.gent");
    expect(listScaffolds()).toEqual(["/some/project/.gent"]);
  });

  it("is idempotent (no duplicates on re-register)", async () => {
    const { registerScaffold, listScaffolds } = await fresh();
    registerScaffold("/a/.gent");
    registerScaffold("/a/.gent");
    expect(listScaffolds()).toEqual(["/a/.gent"]);
  });

  it("preserves registration order", async () => {
    const { registerScaffold, listScaffolds } = await fresh();
    registerScaffold("/a/.gent");
    registerScaffold("/b/.gent");
    registerScaffold("/c/.gent");
    expect(listScaffolds()).toEqual(["/a/.gent", "/b/.gent", "/c/.gent"]);
  });

  it("stores an absolute path", async () => {
    const { registerScaffold, listScaffolds } = await fresh();
    registerScaffold("relative/.gent");
    expect(listScaffolds()).toEqual([path.resolve("relative/.gent")]);
  });

  it("persists across reloads", async () => {
    const first = await fresh();
    first.registerScaffold("/x/.gent");
    const second = await fresh(); // resetModules → re-reads the file
    expect(second.listScaffolds()).toEqual(["/x/.gent"]);
  });
});
