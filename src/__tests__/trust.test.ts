import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tempHome: string;

async function freshTrust() {
  vi.resetModules();
  return import("../trust.js");
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-trust-test-"));
  process.env.GENT_HOME = tempHome;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("trust registry", () => {
  it("trusts, lists, and untrusts a gent dir", async () => {
    const trust = await freshTrust();
    const gentDir = path.join(tempHome, "repo", ".gent");
    fs.mkdirSync(gentDir, { recursive: true });

    expect(trust.isGentDirTrusted(gentDir)).toBe(false);
    const trusted = trust.trustGentDir(gentDir);
    expect(trust.isGentDirTrusted(gentDir)).toBe(true);
    expect(trust.listTrustedGentDirs()).toEqual([trusted]);

    trust.untrustGentDir(gentDir);
    expect(trust.isGentDirTrusted(gentDir)).toBe(false);
  });
});
