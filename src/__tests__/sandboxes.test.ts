import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

let tempHome: string;

async function fresh() {
  vi.resetModules();
  const cfg = await import("../config.js");
  const sb = await import("../sandboxes.js");
  return { ...cfg, ...sb };
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gent-test-"));
  process.env.GENT_HOME = tempHome;
});

afterEach(() => {
  delete process.env.GENT_HOME;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("sandboxPath", () => {
  it("returns path inside SANDBOXES_DIR ending with <id>.yaml", async () => {
    const { sandboxPath, SANDBOXES_DIR } = await fresh();
    expect(sandboxPath("dev")).toBe(path.join(SANDBOXES_DIR, "dev.yaml"));
  });

  it("rejects ids with path traversal characters", async () => {
    const { sandboxPath } = await fresh();
    expect(() => sandboxPath("../../etc/passwd")).toThrow(/Invalid sandbox name/);
  });

  it("rejects ids with spaces or special characters", async () => {
    const { sandboxPath } = await fresh();
    expect(() => sandboxPath("my sandbox!")).toThrow(/Invalid sandbox name/);
  });
});

describe("loadSandbox", () => {
  it("throws when sandbox file does not exist", async () => {
    const { loadSandbox } = await fresh();
    expect(() => loadSandbox("nonexistent")).toThrow(/nonexistent/);
  });

  it("parses a sandbox YAML file and filename overrides id", async () => {
    const { loadSandbox, SANDBOXES_DIR } = await fresh();
    fs.mkdirSync(SANDBOXES_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(SANDBOXES_DIR, "dev.yaml"),
      `driver: local\nworkdir: /workspace\n`,
      "utf8"
    );
    const sandbox = loadSandbox("dev");
    expect(sandbox.id).toBe("dev");
    expect(sandbox.driver).toBe("local");
    expect(sandbox.workdir).toBe("/workspace");
  });

  it("rejects an invalid sandbox YAML shape", async () => {
    const { loadSandbox, SANDBOXES_DIR } = await fresh();
    fs.mkdirSync(SANDBOXES_DIR, { recursive: true });
    fs.writeFileSync(path.join(SANDBOXES_DIR, "dev.yaml"), "driver: docker\n", "utf8");
    expect(() => loadSandbox("dev")).toThrow(/Invalid sandbox.*driver/);
  });
});

describe("saveSandbox → loadSandbox round-trip", () => {
  it("persists and restores a sandbox", async () => {
    const { saveSandbox, loadSandbox } = await fresh();
    const sandbox = {
      id: "dev",
      driver: "apple-container" as const,
      image: "ghcr.io/org/gent-agent:latest",
      workdir: "/workspace",
      lifecycle: "persistent" as const,
      mounts: [{ source: "~/Projects/app", target: "/workspace", mode: "rw" as const }],
      environment: { GENT_PROFILE: "coding" },
      network: "none" as const,
    };
    saveSandbox(sandbox);
    const loaded = loadSandbox("dev");
    expect(loaded.driver).toBe("apple-container");
    expect(loaded.image).toBe("ghcr.io/org/gent-agent:latest");
    expect(loaded.lifecycle).toBe("persistent");
    expect(loaded.mounts).toEqual(sandbox.mounts);
    expect(loaded.network).toBe("none");
  });
});

describe("listSandboxes", () => {
  it("returns [] when sandboxes directory does not exist", async () => {
    const { listSandboxes } = await fresh();
    expect(listSandboxes()).toEqual([]);
  });

  it("returns one entry per .yaml file", async () => {
    const { listSandboxes, saveSandbox } = await fresh();
    saveSandbox({ id: "dev", driver: "local" });
    saveSandbox({ id: "secure", driver: "apple-container", image: "img:latest" });
    const ids = listSandboxes().map((s) => s.id).sort();
    expect(ids).toEqual(["dev", "secure"]);
  });
});

describe("sandboxExists", () => {
  it("returns false when no sandbox file exists", async () => {
    const { sandboxExists } = await fresh();
    expect(sandboxExists("dev")).toBe(false);
  });

  it("returns true once saved", async () => {
    const { sandboxExists, saveSandbox } = await fresh();
    saveSandbox({ id: "dev", driver: "local" });
    expect(sandboxExists("dev")).toBe(true);
  });
});

describe("ensureSandboxRunsDir", () => {
  it("creates and returns <GENT_DIR>/runs/<id>", async () => {
    const { ensureSandboxRunsDir, RUNS_DIR } = await fresh();
    const dir = ensureSandboxRunsDir("dev");
    expect(dir).toBe(path.join(RUNS_DIR, "dev"));
    expect(fs.existsSync(dir)).toBe(true);
  });
});
