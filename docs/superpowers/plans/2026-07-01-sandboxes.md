# Sandboxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Sandboxes — a version-controlled definition of where/how an agent runs — with two drivers (`local`, `apple-container`) and transparent integration into the existing `gent <profile>` launch path.

**Architecture:** A new `Sandbox` data model (mirrors `Profile`) resolved through the existing `.gent` dir chain. A small `SandboxDriver` interface (mirrors `AgentAdapter`) implemented by `local` (passthrough) and `apple-container` (wraps Apple's `container` CLI). `src/runner.ts` dispatches to a driver when `profile.sandbox` is set, otherwise behaves exactly as it does today.

**Tech Stack:** TypeScript, commander, js-yaml, @inquirer/prompts, vitest, Node's `child_process.spawnSync`.

## Global Constraints

- Node.js >= 22, project uses ESM (`"type": "module"`) — all imports use `.js` extensions per existing convention.
- Sandbox ids follow the same `^[a-zA-Z0-9_-]+$` validation as profile names.
- Sandbox YAML files live at `.gent/sandboxes/<id>.yaml`, resolved via the same nearest-first `.gent` chain walk as profiles (`gentDirChain()`), local-only for writes.
- No sandbox `extends` support in this slice.
- Config surface is the reduced set only: `driver`, `image` (apple-container only), `workdir`, `lifecycle` (`ephemeral` default | `persistent`), `mounts` (`source`/`target`/`mode: ro|rw`), `environment`, `network` (`none` | `full`, default `full`). No resource limits, no filesystem modes beyond ro/rw, no network allow/deny lists.
- CLI grammar: CRUD (`create`/`show`/`update`/`delete`/`list sandbox`) matches the profile/mcp verb pattern exactly. Lifecycle actions (`validate`/`run`/`exec`/`logs`/`stop`/`destroy`) are a `gent sandbox <name> <action>` subgroup.
- Docker, Podman, the extension UI, resource limits, and network allow/deny lists are explicitly out of scope — do not implement them.

---

### Task 1: Sandbox data model & config resolution

**Files:**
- Modify: `src/config.ts` (add `SANDBOXES_DIR`, `RUNS_DIR`, `resolveSandboxPath`, update `ensureGentDir`)
- Create: `src/sandboxes.ts`
- Test: `src/__tests__/sandboxes.test.ts`

**Interfaces:**
- Produces: `SANDBOXES_DIR: string`, `RUNS_DIR: string`, `resolveSandboxPath(id: string): string | null` (from `config.ts`); `Sandbox`, `SandboxMount`, `SandboxDriverName`, `SandboxLifecycle`, `MountMode`, `NetworkMode` types, `validateSandboxName`, `sandboxPath`, `sandboxExists`, `loadSandbox`, `saveSandbox`, `listSandboxes`, `sandboxRunsDir`, `ensureSandboxRunsDir` (from `sandboxes.ts`).

- [ ] **Step 1: Write failing tests for `sandboxes.ts`**

Create `src/__tests__/sandboxes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/sandboxes.test.ts`
Expected: FAIL — `Cannot find module '../sandboxes.js'`

- [ ] **Step 3: Add `SANDBOXES_DIR`, `RUNS_DIR`, `resolveSandboxPath` to `config.ts`**

In `src/config.ts`, after the `export const PROFILES_DIR = ...` line (currently line 38), add:

```ts
export const SANDBOXES_DIR = path.join(GENT_DIR, "sandboxes");
export const RUNS_DIR = path.join(GENT_DIR, "runs");
```

After the existing `resolveProfilePath` function, add:

```ts
// First existing match for a sandbox across the lookup chain (local wins).
export function resolveSandboxPath(id: string): string | null {
  for (const dir of gentDirChain()) {
    const p = path.join(dir, "sandboxes", `${id}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
```

In `ensureGentDir()`, add the sandboxes dir alongside the existing `mkdirSync` calls:

```ts
export function ensureGentDir(): void {
  fs.mkdirSync(GENT_DIR, { recursive: true });
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.mkdirSync(SANDBOXES_DIR, { recursive: true });
}
```

- [ ] **Step 4: Create `src/sandboxes.ts`**

```ts
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  SANDBOXES_DIR,
  RUNS_DIR,
  gentDirChain,
  resolveSandboxPath,
  ensureGentDir,
} from "./config.js";

export type SandboxDriverName = "local" | "apple-container";
export type SandboxLifecycle = "ephemeral" | "persistent";
export type MountMode = "ro" | "rw";
export type NetworkMode = "none" | "full";

export interface SandboxMount {
  source: string;
  target: string;
  mode: MountMode;
}

export interface Sandbox {
  id: string;
  name?: string;
  driver: SandboxDriverName;
  image?: string;
  workdir?: string;
  lifecycle?: SandboxLifecycle;
  mounts?: SandboxMount[];
  environment?: Record<string, string>;
  network?: NetworkMode;
}

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

export function validateSandboxName(id: string): void {
  if (!VALID_NAME.test(id)) {
    throw new Error(
      `Invalid sandbox name "${id}". Only letters, numbers, hyphens, and underscores are allowed.`
    );
  }
}

// Write path for a sandbox — always the project-local sandboxes dir.
export function sandboxPath(id: string): string {
  validateSandboxName(id);
  return path.join(SANDBOXES_DIR, `${id}.yaml`);
}

export function sandboxExists(id: string): boolean {
  validateSandboxName(id);
  return resolveSandboxPath(id) !== null;
}

export function loadSandbox(id: string): Sandbox {
  validateSandboxName(id);
  const p = resolveSandboxPath(id);
  if (!p) {
    throw new Error(
      `Sandbox "${id}" not found in ${gentDirChain().join(", ")}`
    );
  }
  const sandbox = yaml.load(fs.readFileSync(p, "utf8")) as Sandbox;
  sandbox.id = id; // filename is always authoritative
  return sandbox;
}

export function saveSandbox(sandbox: Sandbox): void {
  ensureGentDir();
  fs.writeFileSync(sandboxPath(sandbox.id), yaml.dump(sandbox), "utf8");
}

export function listSandboxes(): Sandbox[] {
  const seen = new Set<string>();
  const sandboxes: Sandbox[] = [];
  // Local first so a local sandbox shadows a global one of the same name.
  for (const dir of gentDirChain()) {
    const dirPath = path.join(dir, "sandboxes");
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith(".yaml")) continue;
      const id = f.replace(/\.yaml$/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      sandboxes.push(loadSandbox(id));
    }
  }
  return sandboxes;
}

// Directory holding the runner's per-sandbox artifacts (MCP config, settings,
// system-prompt, aggregated skills plugin) — bind-mounted into isolated
// drivers at the same host path so buildArgs()'s file paths work unmodified
// inside the container. Stable per sandbox id so a persistent sandbox's
// container (mounted once at creation) keeps seeing fresh content on every
// run; ephemeral sandboxes clean this up after each run.
export function sandboxRunsDir(id: string): string {
  return path.join(RUNS_DIR, id);
}

export function ensureSandboxRunsDir(id: string): string {
  const dir = sandboxRunsDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sandboxes.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/sandboxes.ts src/__tests__/sandboxes.test.ts
git commit -m "feat: add sandbox data model and config resolution"
```

---

### Task 2: Driver interface & local driver

**Files:**
- Create: `src/sandboxDrivers.ts`
- Test: `src/__tests__/sandboxDrivers.test.ts`

**Interfaces:**
- Consumes: `Sandbox`, `SandboxDriverName` from `src/sandboxes.ts` (Task 1).
- Produces: `SandboxDriver` interface, `localDriver: SandboxDriver`, `buildLocalExecOptions(sandbox: Sandbox): { cwd: string; env: NodeJS.ProcessEnv }` (exported for testing, mirrors how `buildMcpConfig`/`buildSettings` are exported from `agents.ts` for direct unit testing).

- [ ] **Step 1: Write failing tests for the local driver**

Create `src/__tests__/sandboxDrivers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Sandbox } from "../sandboxes.js";
import { buildLocalExecOptions, localDriver } from "../sandboxDrivers.js";

const localSandbox: Sandbox = {
  id: "dev",
  driver: "local",
  workdir: "/tmp/workspace",
  environment: { GENT_PROFILE: "coding" },
};

describe("buildLocalExecOptions", () => {
  it("uses sandbox.workdir as cwd", () => {
    const { cwd } = buildLocalExecOptions(localSandbox);
    expect(cwd).toBe("/tmp/workspace");
  });

  it("falls back to process.cwd() when workdir is unset", () => {
    const { cwd } = buildLocalExecOptions({ id: "dev", driver: "local" });
    expect(cwd).toBe(process.cwd());
  });

  it("merges sandbox.environment on top of process.env", () => {
    const { env } = buildLocalExecOptions(localSandbox);
    expect(env.GENT_PROFILE).toBe("coding");
    expect(env.PATH).toBe(process.env.PATH);
  });
});

describe("localDriver", () => {
  it("has name 'local'", () => {
    expect(localDriver.name).toBe("local");
  });

  it("validate() flags a missing mount source", async () => {
    const sandbox: Sandbox = {
      id: "dev",
      driver: "local",
      mounts: [{ source: "/definitely/does/not/exist/xyz", target: "/x", mode: "ro" }],
    };
    const problems = await localDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("/definitely/does/not/exist/xyz"))).toBe(true);
  });

  it("validate() returns no problems when mounts exist", async () => {
    const sandbox: Sandbox = {
      id: "dev",
      driver: "local",
      mounts: [{ source: process.cwd(), target: "/x", mode: "ro" }],
    };
    expect(await localDriver.validate(sandbox)).toEqual([]);
  });

  it("exec() runs the command and returns its exit code", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await localDriver.exec(sandbox, process.execPath, ["-e", "process.exit(0)"], "/tmp");
    expect(code).toBe(0);
  });

  it("exec() propagates a non-zero exit code", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await localDriver.exec(sandbox, process.execPath, ["-e", "process.exit(3)"], "/tmp");
    expect(code).toBe(3);
  });

  it("ensureRunning/stop/destroy are no-ops that resolve", async () => {
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    await expect(localDriver.ensureRunning(sandbox, "/tmp")).resolves.toBeUndefined();
    await expect(localDriver.stop(sandbox)).resolves.toBeUndefined();
    await expect(localDriver.destroy(sandbox)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: FAIL — `Cannot find module '../sandboxDrivers.js'`

- [ ] **Step 3: Create `src/sandboxDrivers.ts` with the interface and local driver**

```ts
import { spawnSync } from "child_process";
import fs from "fs";
import chalk from "chalk";
import { expandHome } from "./profiles.js";
import { type Sandbox, type SandboxDriverName } from "./sandboxes.js";

export interface SandboxDriver {
  name: SandboxDriverName;
  /** Validate config against this driver's requirements. Empty array = valid. */
  validate(sandbox: Sandbox): Promise<string[]>;
  /**
   * Ensure the sandbox is up and ready to accept exec. `tmpDir` is the
   * directory holding this run's MCP config/settings/prompt/skills
   * artifacts — isolated drivers bind-mount it in.
   */
  ensureRunning(sandbox: Sandbox, tmpDir: string): Promise<void>;
  /** Run a command inside the sandbox, inheriting stdio. Returns exit code. */
  exec(sandbox: Sandbox, command: string, args: string[], tmpDir: string): Promise<number>;
  stop(sandbox: Sandbox): Promise<void>;
  destroy(sandbox: Sandbox): Promise<void>;
  logs(sandbox: Sandbox): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local driver — no isolation; makes the abstraction uniform for the common
// case. Inherits process.env (unlike apple-container) since hiding host env
// from an unisolated process would be theater, not security.
// ---------------------------------------------------------------------------

export function buildLocalExecOptions(sandbox: Sandbox): { cwd: string; env: NodeJS.ProcessEnv } {
  return {
    cwd: sandbox.workdir ?? process.cwd(),
    env: { ...process.env, ...(sandbox.environment ?? {}) },
  };
}

export const localDriver: SandboxDriver = {
  name: "local",
  async validate(sandbox) {
    const problems: string[] = [];
    for (const m of sandbox.mounts ?? []) {
      if (!fs.existsSync(expandHome(m.source))) {
        problems.push(`Mount source does not exist: ${m.source}`);
      }
    }
    return problems;
  },
  async ensureRunning() {
    // no-op: nothing to start for an unisolated process
  },
  async exec(sandbox, command, args) {
    const { cwd, env } = buildLocalExecOptions(sandbox);
    const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
    return result.status ?? 0;
  },
  async stop() {
    // no-op
  },
  async destroy() {
    // no-op
  },
  async logs() {
    console.log(chalk.yellow("Logs are not applicable to the local driver (no isolated process to capture)."));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: PASS (all local-driver tests green)

- [ ] **Step 5: Commit**

```bash
git add src/sandboxDrivers.ts src/__tests__/sandboxDrivers.test.ts
git commit -m "feat: add SandboxDriver interface and local driver"
```

---

### Task 3: Apple Container driver

**Files:**
- Modify: `src/sandboxDrivers.ts`
- Modify: `src/__tests__/sandboxDrivers.test.ts`

**Interfaces:**
- Produces: `appleContainerDriver: SandboxDriver`, plus exported pure arg-builders used directly by tests: `containerName(sandbox: Sandbox): string`, `buildStartArgs`, `buildDetachedRunArgs`, `buildEphemeralRunArgs`, `buildExecArgs`, `buildStopArgs`, `buildRemoveArgs`, `buildLogsArgs`, `buildImageInspectArgs` (all `(sandbox: Sandbox, ...) => string[]`).

- [ ] **Step 1: Write failing tests for the apple-container arg-builders and driver**

Append to `src/__tests__/sandboxDrivers.test.ts`:

```ts
import {
  appleContainerDriver,
  containerName,
  buildStartArgs,
  buildDetachedRunArgs,
  buildEphemeralRunArgs,
  buildExecArgs,
  buildStopArgs,
  buildRemoveArgs,
  buildLogsArgs,
  buildImageInspectArgs,
} from "../sandboxDrivers.js";

const acSandbox: Sandbox = {
  id: "secure",
  driver: "apple-container",
  image: "ghcr.io/org/gent-agent:latest",
  workdir: "/workspace",
  mounts: [
    { source: "/host/project", target: "/workspace", mode: "rw" },
    { source: "/host/context", target: "/gent/context", mode: "ro" },
  ],
  environment: { GENT_PROFILE: "coding" },
};

describe("containerName", () => {
  it("prefixes the sandbox id with gent-", () => {
    expect(containerName(acSandbox)).toBe("gent-secure");
  });
});

describe("apple-container arg builders", () => {
  it("buildStartArgs", () => {
    expect(buildStartArgs(acSandbox)).toEqual(["start", "gent-secure"]);
  });

  it("buildDetachedRunArgs includes mounts, workdir, env, image, and keep-alive command", () => {
    const args = buildDetachedRunArgs(acSandbox, "/gent/runs/secure");
    expect(args).toEqual([
      "run", "--detach", "--name", "gent-secure",
      "-v", "/host/project:/workspace",
      "-v", "/host/context:/gent/context:ro",
      "-v", "/gent/runs/secure:/gent/runs/secure:ro",
      "-w", "/workspace",
      "-e", "GENT_PROFILE=coding",
      "ghcr.io/org/gent-agent:latest",
      "sleep", "infinity",
    ]);
  });

  it("buildDetachedRunArgs throws when no image is configured", () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container" };
    expect(() => buildDetachedRunArgs(sandbox, "/gent/runs/secure")).toThrow(/no image configured/);
  });

  it("buildEphemeralRunArgs includes --rm and the command/args to run", () => {
    const args = buildEphemeralRunArgs(acSandbox, "claude", ["--dangerously-skip-permissions"], "/gent/runs/secure");
    expect(args).toEqual([
      "run", "--rm",
      "-v", "/host/project:/workspace",
      "-v", "/host/context:/gent/context:ro",
      "-v", "/gent/runs/secure:/gent/runs/secure:ro",
      "-w", "/workspace",
      "-e", "GENT_PROFILE=coding",
      "ghcr.io/org/gent-agent:latest",
      "claude", "--dangerously-skip-permissions",
    ]);
  });

  it("buildExecArgs targets the named container", () => {
    expect(buildExecArgs(acSandbox, "claude", ["-p", "hi"])).toEqual([
      "exec", "gent-secure", "claude", "-p", "hi",
    ]);
  });

  it("buildStopArgs / buildRemoveArgs / buildLogsArgs target the named container", () => {
    expect(buildStopArgs(acSandbox)).toEqual(["stop", "gent-secure"]);
    expect(buildRemoveArgs(acSandbox)).toEqual(["rm", "gent-secure"]);
    expect(buildLogsArgs(acSandbox)).toEqual(["logs", "gent-secure"]);
  });

  it("buildImageInspectArgs targets the configured image", () => {
    expect(buildImageInspectArgs(acSandbox)).toEqual(["images", "inspect", "ghcr.io/org/gent-agent:latest"]);
  });
});

describe("appleContainerDriver", () => {
  it("has name 'apple-container'", () => {
    expect(appleContainerDriver.name).toBe("apple-container");
  });

  it("validate() flags a missing image", async () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container" };
    const problems = await appleContainerDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("no image configured"))).toBe(true);
  });

  it("validate() flags a missing mount source", async () => {
    const sandbox: Sandbox = {
      id: "secure",
      driver: "apple-container",
      image: "ghcr.io/org/gent-agent:latest",
      mounts: [{ source: "/definitely/does/not/exist/xyz", target: "/x", mode: "ro" }],
    };
    const problems = await appleContainerDriver.validate(sandbox);
    expect(problems.some((p) => p.includes("/definitely/does/not/exist/xyz"))).toBe(true);
  });

  it("logs() prints a not-applicable message for ephemeral sandboxes", async () => {
    const sandbox: Sandbox = { id: "secure", driver: "apple-container", lifecycle: "ephemeral" };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await appleContainerDriver.logs(sandbox);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ephemeral container has already exited"));
    logSpy.mockRestore();
  });
});
```

Also add `vi` to the existing `import { describe, it, expect } from "vitest";` line at the top of the file (change it to `import { describe, it, expect, vi } from "vitest";`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: FAIL — `containerName is not exported` (and similar) from `../sandboxDrivers.js`

- [ ] **Step 3: Implement the apple-container driver in `src/sandboxDrivers.ts`**

Append to `src/sandboxDrivers.ts`:

```ts
// ---------------------------------------------------------------------------
// Apple Container driver — wraps Apple's `container` CLI
// (github.com/apple/container). Docker-like syntax, per-container microVM
// isolation. Container name is derived from the sandbox id to avoid
// collisions with unrelated containers.
// ---------------------------------------------------------------------------

export function containerName(sandbox: Sandbox): string {
  return `gent-${sandbox.id}`;
}

function requireImage(sandbox: Sandbox): string {
  if (!sandbox.image) {
    throw new Error(`Sandbox "${sandbox.id}" has driver "apple-container" but no image configured.`);
  }
  return sandbox.image;
}

function buildMountFlags(sandbox: Sandbox, tmpDir: string): string[] {
  const flags: string[] = [];
  for (const m of sandbox.mounts ?? []) {
    const suffix = m.mode === "ro" ? ":ro" : "";
    flags.push("-v", `${expandHome(m.source)}:${m.target}${suffix}`);
  }
  // Bind-mount the runner's artifact dir at the identical host path so the
  // file paths already baked into buildArgs() (mcp.json, settings.json,
  // prompt.txt, skills-plugin/) resolve unmodified inside the container.
  flags.push("-v", `${tmpDir}:${tmpDir}:ro`);
  return flags;
}

function buildEnvFlags(sandbox: Sandbox): string[] {
  const flags: string[] = [];
  for (const [key, value] of Object.entries(sandbox.environment ?? {})) {
    flags.push("-e", `${key}=${value}`);
  }
  return flags;
}

export function buildStartArgs(sandbox: Sandbox): string[] {
  return ["start", containerName(sandbox)];
}

export function buildDetachedRunArgs(sandbox: Sandbox, tmpDir: string): string[] {
  const image = requireImage(sandbox);
  return [
    "run", "--detach", "--name", containerName(sandbox),
    ...buildMountFlags(sandbox, tmpDir),
    "-w", sandbox.workdir ?? "/workspace",
    ...buildEnvFlags(sandbox),
    image,
    "sleep", "infinity",
  ];
}

export function buildEphemeralRunArgs(
  sandbox: Sandbox,
  command: string,
  args: string[],
  tmpDir: string
): string[] {
  const image = requireImage(sandbox);
  return [
    "run", "--rm",
    ...buildMountFlags(sandbox, tmpDir),
    "-w", sandbox.workdir ?? "/workspace",
    ...buildEnvFlags(sandbox),
    image,
    command,
    ...args,
  ];
}

export function buildExecArgs(sandbox: Sandbox, command: string, args: string[]): string[] {
  return ["exec", containerName(sandbox), command, ...args];
}

export function buildStopArgs(sandbox: Sandbox): string[] {
  return ["stop", containerName(sandbox)];
}

export function buildRemoveArgs(sandbox: Sandbox): string[] {
  return ["rm", containerName(sandbox)];
}

export function buildLogsArgs(sandbox: Sandbox): string[] {
  return ["logs", containerName(sandbox)];
}

export function buildImageInspectArgs(sandbox: Sandbox): string[] {
  return ["images", "inspect", sandbox.image ?? ""];
}

function isContainerBinaryAvailable(): boolean {
  const result = spawnSync("container", ["--version"]);
  return !result.error;
}

function isPersistent(sandbox: Sandbox): boolean {
  return sandbox.lifecycle === "persistent";
}

export const appleContainerDriver: SandboxDriver = {
  name: "apple-container",
  async validate(sandbox) {
    const problems: string[] = [];
    if (!isContainerBinaryAvailable()) {
      problems.push(
        "The `container` binary is not installed or not on PATH. Install it from: https://github.com/apple/container"
      );
    }
    if (!sandbox.image) {
      problems.push(`Sandbox "${sandbox.id}" has driver "apple-container" but no image configured.`);
    } else if (isContainerBinaryAvailable()) {
      const inspect = spawnSync("container", buildImageInspectArgs(sandbox));
      if (inspect.status !== 0) {
        problems.push(`Image "${sandbox.image}" not found locally. It will be pulled on first run.`);
      }
    }
    for (const m of sandbox.mounts ?? []) {
      if (!fs.existsSync(expandHome(m.source))) {
        problems.push(`Mount source does not exist: ${m.source}`);
      }
    }
    return problems;
  },
  async ensureRunning(sandbox, tmpDir) {
    if (!isPersistent(sandbox)) return; // ephemeral: created at exec time
    const start = spawnSync("container", buildStartArgs(sandbox), { stdio: "ignore" });
    if (start.status !== 0) {
      spawnSync("container", buildDetachedRunArgs(sandbox, tmpDir), { stdio: "inherit" });
    }
  },
  async exec(sandbox, command, args, tmpDir) {
    const result = isPersistent(sandbox)
      ? spawnSync("container", buildExecArgs(sandbox, command, args), { stdio: "inherit" })
      : spawnSync("container", buildEphemeralRunArgs(sandbox, command, args, tmpDir), { stdio: "inherit" });
    return result.status ?? 0;
  },
  async stop(sandbox) {
    if (!isPersistent(sandbox)) return; // already gone
    spawnSync("container", buildStopArgs(sandbox), { stdio: "ignore" });
  },
  async destroy(sandbox) {
    if (!isPersistent(sandbox)) return;
    spawnSync("container", buildStopArgs(sandbox), { stdio: "ignore" });
    spawnSync("container", buildRemoveArgs(sandbox), { stdio: "ignore" });
  },
  async logs(sandbox) {
    if (!isPersistent(sandbox)) {
      console.log(chalk.yellow("Logs are not applicable — the ephemeral container has already exited."));
      return;
    }
    spawnSync("container", buildLogsArgs(sandbox), { stdio: "inherit" });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: PASS (all tests green, including apple-container arg-builder and driver tests)

- [ ] **Step 5: Commit**

```bash
git add src/sandboxDrivers.ts src/__tests__/sandboxDrivers.test.ts
git commit -m "feat: add apple-container sandbox driver"
```

---

### Task 4: Driver registry & built-in templates

**Files:**
- Modify: `src/sandboxDrivers.ts`
- Create: `src/sandboxTemplates.ts`
- Modify: `src/__tests__/sandboxDrivers.test.ts`
- Test: `src/__tests__/sandboxTemplates.test.ts`

**Interfaces:**
- Consumes: `SandboxDriver`, `localDriver`, `appleContainerDriver` (Tasks 2–3); `Sandbox`, `SandboxDriverName` (Task 1).
- Produces: `DRIVER_NAMES: SandboxDriverName[]`, `isDriverName(value: string): value is SandboxDriverName`, `getDriver(name: SandboxDriverName): SandboxDriver` (from `sandboxDrivers.ts`); `TEMPLATE_NAMES: string[]`, `isTemplateName(value: string): boolean`, `getTemplate(name: string): Sandbox` (from `sandboxTemplates.ts`).

- [ ] **Step 1: Write failing tests for the driver registry**

Append to `src/__tests__/sandboxDrivers.test.ts`:

```ts
import { DRIVER_NAMES, isDriverName, getDriver } from "../sandboxDrivers.js";

describe("driver registry", () => {
  it("DRIVER_NAMES lists local and apple-container", () => {
    expect(DRIVER_NAMES).toEqual(["local", "apple-container"]);
  });

  it("isDriverName accepts known drivers and rejects unknown ones", () => {
    expect(isDriverName("local")).toBe(true);
    expect(isDriverName("apple-container")).toBe(true);
    expect(isDriverName("podman")).toBe(false);
  });

  it("getDriver returns the matching driver implementation", () => {
    expect(getDriver("local").name).toBe("local");
    expect(getDriver("apple-container").name).toBe("apple-container");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: FAIL — `DRIVER_NAMES is not exported`

- [ ] **Step 3: Add the registry to `src/sandboxDrivers.ts`**

Append to `src/sandboxDrivers.ts`:

```ts
// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const DRIVERS: Record<SandboxDriverName, SandboxDriver> = {
  local: localDriver,
  "apple-container": appleContainerDriver,
};

export const DRIVER_NAMES = Object.keys(DRIVERS) as SandboxDriverName[];

export function isDriverName(value: string): value is SandboxDriverName {
  return value in DRIVERS;
}

export function getDriver(name: SandboxDriverName): SandboxDriver {
  return DRIVERS[name];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sandboxDrivers.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for built-in templates**

Create `src/__tests__/sandboxTemplates.test.ts`:

```ts
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/sandboxTemplates.test.ts`
Expected: FAIL — `Cannot find module '../sandboxTemplates.js'`

- [ ] **Step 7: Create `src/sandboxTemplates.ts`**

```ts
import { type Sandbox } from "./sandboxes.js";

// Built-in starting points for `gent create sandbox <template>`. Podman/Docker
// templates arrive alongside those drivers in a future slice.
const TEMPLATES: Record<string, () => Sandbox> = {
  local: () => ({
    id: "local",
    name: "Local (no isolation)",
    driver: "local",
    lifecycle: "ephemeral",
    network: "full",
  }),
  "apple-container": () => ({
    id: "apple-container",
    name: "Secure Agent (Apple Container)",
    driver: "apple-container",
    image: "",
    workdir: "/workspace",
    lifecycle: "ephemeral",
    network: "none",
    mounts: [],
  }),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function isTemplateName(value: string): boolean {
  return value in TEMPLATES;
}

export function getTemplate(name: string): Sandbox {
  const factory = TEMPLATES[name];
  if (!factory) {
    throw new Error(`Unknown sandbox template "${name}". Available templates: ${TEMPLATE_NAMES.join(", ")}.`);
  }
  return factory();
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sandboxTemplates.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/sandboxDrivers.ts src/sandboxTemplates.ts src/__tests__/sandboxDrivers.test.ts src/__tests__/sandboxTemplates.test.ts
git commit -m "feat: add sandbox driver registry and built-in templates"
```

---

### Task 5: Profile linkage

**Files:**
- Modify: `src/profiles.ts:20-30` (the `Profile` interface)
- Modify: `src/cli.ts:262-307` (the `show profile <name>` row printer)
- Test: `src/__tests__/profiles.test.ts`

**Interfaces:**
- Produces: `Profile.sandbox?: string` field.

- [ ] **Step 1: Write a failing test for the new field**

Append to `src/__tests__/profiles.test.ts`, inside a new `describe` block after `saveProfile → loadProfile round-trip`:

```ts
// ─── sandbox field ───────────────────────────────────────────────────────────

describe("profile.sandbox field", () => {
  it("round-trips through save/load", async () => {
    const { saveProfile, loadProfile } = await fresh();
    saveProfile({ name: "coding", sandbox: "dev" });
    expect(loadProfile("coding").sandbox).toBe("dev");
  });

  it("is undefined when not set", async () => {
    const { saveProfile, loadProfile } = await fresh();
    saveProfile({ name: "coding" });
    expect(loadProfile("coding").sandbox).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/profiles.test.ts`
Expected: FAIL — TypeScript error, `sandbox` does not exist on type `Profile` (or the round-trip assertion fails if types are loose at runtime — either way, it must not pass yet)

- [ ] **Step 3: Add the field to `Profile`**

In `src/profiles.ts`, update the `Profile` interface (currently lines 20-30):

```ts
export interface Profile {
  name: string;
  agent?: AgentName;
  extends?: string | string[];
  description?: string;
  mcp?: string[];
  skills?: string[];
  strict_mcp?: boolean;
  settings?: ProfileSettings;
  system_prompt_append?: string;
  sandbox?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/profiles.test.ts`
Expected: PASS

- [ ] **Step 5: Show the sandbox field in `gent show profile <name>`**

In `src/cli.ts`, inside the `showCmd.command("profile <name>")` action (currently lines 262-307), add a row after the `strict_mcp` row:

```ts
    if (p.strict_mcp) row("strict_mcp", "true");
    if (p.sandbox) row("sandbox", chalk.cyan(p.sandbox));
```

- [ ] **Step 6: Manually verify the row prints**

Run:
```bash
npx tsx src/cli.ts create profile sandboxtest --agent claude <<< $'\n\n\n\nsandboxtest\n'
```
This is awkward to script through the interactive wizard, so instead verify by writing a fixture profile directly and running `show`:
```bash
mkdir -p /tmp/gent-manual-check/.gent/profiles
cat > /tmp/gent-manual-check/.gent/profiles/coding.yaml <<'EOF'
description: test
sandbox: dev
EOF
cd /tmp/gent-manual-check && npx tsx /Users/nando/Agents/gent/src/cli.ts show profile coding
```
Expected output includes a line: `sandbox      dev`
Clean up: `rm -rf /tmp/gent-manual-check`

- [ ] **Step 7: Commit**

```bash
git add src/profiles.ts src/cli.ts src/__tests__/profiles.test.ts
git commit -m "feat: add sandbox field to Profile"
```

---

### Task 6: Runner integration

**Files:**
- Modify: `src/runner.ts`
- Test: `src/__tests__/runner.test.ts`

**Interfaces:**
- Consumes: `Sandbox`, `loadSandbox`, `ensureSandboxRunsDir` (`src/sandboxes.ts`); `SandboxDriver`, `getDriver` (`src/sandboxDrivers.ts`); `Profile.sandbox` (Task 5); `getAdapter`, `AgentAdapter` (`src/agents.ts`).
- Produces: `run(profile: Profile, extraArgs: string[], dryRun: boolean, noSandbox: boolean): Promise<void>` — signature change from the current `run(profile, extraArgs, dryRun = false): void`. Also exports `runInSandbox` for direct testing with an injected fake driver (dependency injection avoids spawning real processes/containers in tests).

Currently `src/runner.ts` looks like this (full file shown above in context): it defines `run()` synchronously and calls `process.exit` at the end. This task makes it `async`, adds the sandbox-dispatch branch, and lets tests inject a fake `SandboxDriver` + a `getDriver` override.

- [ ] **Step 1: Write failing tests for sandbox dispatch**

Append to `src/__tests__/runner.test.ts` (after the existing `buildSettings` describe block):

```ts
// ─── runInSandbox ────────────────────────────────────────────────────────────

import { runInSandbox } from "../runner.js";
import type { Sandbox } from "../sandboxes.js";
import type { SandboxDriver } from "../sandboxDrivers.js";

function fakeDriver(overrides: Partial<SandboxDriver> = {}): SandboxDriver {
  return {
    name: "local",
    validate: vi.fn().mockResolvedValue([]),
    ensureRunning: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue(0),
    stop: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    logs: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runInSandbox", () => {
  it("calls ensureRunning then exec with the adapter binary and args", async () => {
    const driver = fakeDriver({ exec: vi.fn().mockResolvedValue(0) });
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "ephemeral" };
    const code = await runInSandbox(driver, sandbox, "claude", ["--settings", "{}"], "/tmp/runs/dev");
    expect(driver.ensureRunning).toHaveBeenCalledWith(sandbox, "/tmp/runs/dev");
    expect(driver.exec).toHaveBeenCalledWith(sandbox, "claude", ["--settings", "{}"], "/tmp/runs/dev");
    expect(code).toBe(0);
  });

  it("destroys the sandbox after exec when lifecycle is ephemeral", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "ephemeral" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).toHaveBeenCalledWith(sandbox);
  });

  it("does not destroy the sandbox after exec when lifecycle is persistent", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local", lifecycle: "persistent" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).not.toHaveBeenCalled();
  });

  it("treats an unset lifecycle as ephemeral (destroys after exec)", async () => {
    const driver = fakeDriver();
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(driver.destroy).toHaveBeenCalledWith(sandbox);
  });

  it("propagates the exit code from exec", async () => {
    const driver = fakeDriver({ exec: vi.fn().mockResolvedValue(7) });
    const sandbox: Sandbox = { id: "dev", driver: "local" };
    const code = await runInSandbox(driver, sandbox, "claude", [], "/tmp/runs/dev");
    expect(code).toBe(7);
  });
});
```

Add `vi` to the existing `import { describe, it, expect, vi, beforeEach } from "vitest";` line if not already present (it already is, per the file header).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/runner.test.ts`
Expected: FAIL — `runInSandbox is not exported`

- [ ] **Step 3: Rewrite `src/runner.ts`**

Replace the entire contents of `src/runner.ts`:

```ts
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { type Profile } from "./profiles.js";
import { getAdapter } from "./agents.js";
import { loadSandbox, ensureSandboxRunsDir, type Sandbox } from "./sandboxes.js";
import { getDriver, type SandboxDriver } from "./sandboxDrivers.js";

// Re-exported for backwards compatibility (tests import these from runner).
export {
  buildMcpConfig,
  buildSettings,
  type McpConfigJson,
} from "./agents.js";

// Runs the agent binary+args through a sandbox driver instead of spawning
// locally. Destroys the sandbox afterward when its lifecycle is ephemeral
// (the default) so a persistent sandbox's container survives for reuse.
// Exported standalone (driver injected) so tests never spawn a real process
// or container.
export async function runInSandbox(
  driver: SandboxDriver,
  sandbox: Sandbox,
  binary: string,
  args: string[],
  tmpDir: string
): Promise<number> {
  await driver.ensureRunning(sandbox, tmpDir);
  const code = await driver.exec(sandbox, binary, args, tmpDir);
  if ((sandbox.lifecycle ?? "ephemeral") === "ephemeral") {
    await driver.destroy(sandbox);
  }
  return code;
}

export async function run(
  profile: Profile,
  extraArgs: string[],
  dryRun = false,
  noSandbox = false
): Promise<void> {
  const globalConfig = loadConfig();
  const adapter = getAdapter(profile.agent);

  if (dryRun) {
    const args = adapter.buildArgs(profile, globalConfig, null);
    const sandboxNote = profile.sandbox && !noSandbox ? chalk.gray(` (sandbox: ${profile.sandbox})`) : "";
    console.log(chalk.cyan(adapter.binary) + " " + [...args, ...extraArgs].join(" ") + sandboxNote);
    return;
  }

  if (profile.sandbox && !noSandbox) {
    const sandbox = loadSandbox(profile.sandbox);
    const driver = getDriver(sandbox.driver);
    const tmpDir = ensureSandboxRunsDir(sandbox.id);
    try {
      const args = adapter.buildArgs(profile, globalConfig, tmpDir);
      const code = await runInSandbox(driver, sandbox, adapter.binary, [...args, ...extraArgs], tmpDir);
      process.exit(code);
    } finally {
      if ((sandbox.lifecycle ?? "ephemeral") === "ephemeral") {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }

  // Write sensitive args to temp files (mode 0o600) so they aren't visible in `ps`.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gent-"));

  try {
    const args = adapter.buildArgs(profile, globalConfig, tmpDir);
    const result = spawnSync(adapter.binary, [...args, ...extraArgs], { stdio: "inherit" });
    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(chalk.red(`${adapter.label} is not installed or not in PATH.`));
        console.error(chalk.gray(adapter.installHint));
      } else {
        console.error(chalk.red(`Failed to launch ${adapter.label}: ${result.error.message}`));
      }
      process.exit(1);
    }
    process.exit(result.status ?? 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/runner.test.ts`
Expected: PASS

- [ ] **Step 5: Update the call site in `src/cli.ts`**

The bare profile-launch action (currently around line 98) calls `run(profile, extraArgs, options.dryRun ?? false);`. Since `run` is now `async`, and the surrounding `.action` callback is already `async`, add `await` and thread through a new `--no-sandbox` option. In `src/cli.ts`, update the top-level program definition:

```ts
program
  .name("gent")
  .description("Coding-agent environment profile manager for Claude Code, Pi, and Codex")
  .version("0.2.0")
  .argument("[profile]", "profile name(s) to activate — comma-separate to compose (e.g. dev,qa)")
  .option("--dry-run", "print the composed agent command without running it")
  .option("--agent <name>", `agent to run: ${AGENT_NAMES.join(" or ")} (overrides the profile)`)
  .option("--no-sandbox", "run locally even if the profile specifies a sandbox")
  .allowUnknownOption()
  .action(async (profileArg: string | undefined, options: { dryRun?: boolean; agent?: string; sandbox: boolean }) => {
    const rawArgs = program.args.slice(profileArg ? 1 : 0);
    const extraArgs: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      if (rawArgs[i] === "--dry-run" || rawArgs[i] === "--no-sandbox") continue;
      if (rawArgs[i] === "--agent") {
        i++; // skip the value too
        continue;
      }
      extraArgs.push(rawArgs[i]);
    }

    if (options.agent && !isAgentName(options.agent)) {
      console.error(
        chalk.red(`Unknown agent "${options.agent}". Valid agents: ${AGENT_NAMES.join(", ")}.`)
      );
      process.exit(1);
    }

    let profile: Profile;
    if (!profileArg) {
      profile = await pickProfile();
    } else {
      const names = profileArg.split(",").map((s) => s.trim()).filter(Boolean);
      profile =
        names.length === 1
          ? loadProfile(names[0])
          : mergeProfiles(names.map((n) => loadProfile(n)));
    }

    if (options.agent && isAgentName(options.agent)) {
      profile = { ...profile, agent: options.agent };
    }

    await run(profile, extraArgs, options.dryRun ?? false, options.sandbox === false);
  });
```

Note: commander's `--no-sandbox` option automatically creates a boolean `sandbox` field on `options`, defaulting to `true` unless `--no-sandbox` is passed (then `false`) — this is commander's standard `--no-*` convention, the same pattern used for other boolean flags in this codebase's dependencies.

Also update the `import { run } from "./runner.js";` line — no change needed, the import is already just `run`.

- [ ] **Step 6: Rebuild and manually verify dry-run still works**

Run:
```bash
npx tsx src/cli.ts --help
```
Expected: `--no-sandbox` appears in the option list alongside `--dry-run` and `--agent`.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all existing and new tests green — this confirms making `run()` async didn't break any other caller)

- [ ] **Step 8: Commit**

```bash
git add src/runner.ts src/cli.ts
git commit -m "feat: dispatch gent <profile> through a sandbox driver when profile.sandbox is set"
```

---

### Task 7: CLI CRUD wiring (create/show/update/delete/list sandbox)

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/interactive.ts`
- Test: `src/commands/__tests__/e2e.test.ts` (extended in Task 9 — this task adds the commands themselves)

**Interfaces:**
- Consumes: `Sandbox`, `saveSandbox`, `loadSandbox`, `sandboxExists`, `listSandboxes`, `sandboxPath` (`src/sandboxes.ts`); `TEMPLATE_NAMES`, `isTemplateName`, `getTemplate` (`src/sandboxTemplates.ts`); `DRIVER_NAMES`, `isDriverName` (`src/sandboxDrivers.ts`).
- Produces: `sandboxWizard(): Promise<Sandbox>`, `editSandboxWizard(id: string): Promise<void>` (`src/interactive.ts`).

- [ ] **Step 1: Add wizard functions to `src/interactive.ts`**

Add near the bottom of `src/interactive.ts` (after `profileWizard`):

```ts
export async function sandboxWizard(): Promise<Sandbox> {
  const { DRIVER_NAMES } = await import("./sandboxDrivers.js");
  const id = await input({ message: "Sandbox id (e.g. dev):" });
  const driver = await select<SandboxDriverName>({
    message: "Driver:",
    choices: DRIVER_NAMES.map((d) => ({ name: d, value: d })),
  });

  const image =
    driver === "apple-container"
      ? await input({ message: "Image (e.g. ghcr.io/org/gent-agent:latest):" })
      : undefined;

  const workdir = await input({ message: "Workdir:", default: "/workspace" });

  const lifecycle = await select<SandboxLifecycle>({
    message: "Lifecycle:",
    choices: [
      { name: "ephemeral — fresh sandbox every run, destroyed after", value: "ephemeral" },
      { name: "persistent — reused across runs, stopped/destroyed explicitly", value: "persistent" },
    ],
    default: "ephemeral",
  });

  const network = await select<NetworkMode>({
    message: "Network:",
    choices: [
      { name: "full — normal network access", value: "full" },
      { name: "none — no network access", value: "none" },
    ],
    default: "full",
  });

  const mounts: SandboxMount[] = [];
  let addMount = await confirm({ message: "Add a mount?", default: driver === "apple-container" });
  while (addMount) {
    const source = await input({ message: "  Mount source (host path):" });
    const target = await input({ message: "  Mount target (in-sandbox path):" });
    const mode = await select<MountMode>({
      message: "  Mount mode:",
      choices: [
        { name: "rw — read/write", value: "rw" },
        { name: "ro — read-only", value: "ro" },
      ],
      default: "rw",
    });
    mounts.push({ source, target, mode });
    addMount = await confirm({ message: "Add another mount?", default: false });
  }

  return {
    id,
    driver,
    ...(image ? { image } : {}),
    workdir,
    lifecycle,
    network,
    ...(mounts.length ? { mounts } : {}),
  };
}

export async function editSandboxWizard(id: string): Promise<void> {
  const { saveSandbox, loadSandbox, sandboxPath } = await import("./sandboxes.js");
  const { DRIVER_NAMES } = await import("./sandboxDrivers.js");

  const existing = loadSandbox(id);

  const newId = await input({ message: "Sandbox id:", default: existing.id });
  const driver = await select<SandboxDriverName>({
    message: "Driver:",
    choices: DRIVER_NAMES.map((d) => ({ name: d, value: d })),
    default: existing.driver,
  });

  const image =
    driver === "apple-container"
      ? await input({ message: "Image:", default: existing.image ?? "" })
      : undefined;

  const workdir = await input({ message: "Workdir:", default: existing.workdir ?? "/workspace" });

  const lifecycle = await select<SandboxLifecycle>({
    message: "Lifecycle:",
    choices: [
      { name: "ephemeral — fresh sandbox every run, destroyed after", value: "ephemeral" },
      { name: "persistent — reused across runs, stopped/destroyed explicitly", value: "persistent" },
    ],
    default: existing.lifecycle ?? "ephemeral",
  });

  const network = await select<NetworkMode>({
    message: "Network:",
    choices: [
      { name: "full — normal network access", value: "full" },
      { name: "none — no network access", value: "none" },
    ],
    default: existing.network ?? "full",
  });

  const mounts: SandboxMount[] = [...(existing.mounts ?? [])];
  let addMount = await confirm({ message: `Add a mount? (${mounts.length} existing)`, default: false });
  while (addMount) {
    const source = await input({ message: "  Mount source (host path):" });
    const target = await input({ message: "  Mount target (in-sandbox path):" });
    const mode = await select<MountMode>({
      message: "  Mount mode:",
      choices: [
        { name: "rw — read/write", value: "rw" },
        { name: "ro — read-only", value: "ro" },
      ],
      default: "rw",
    });
    mounts.push({ source, target, mode });
    addMount = await confirm({ message: "Add another mount?", default: false });
  }

  const updated: Sandbox = {
    ...existing,
    id: newId,
    driver,
    ...(image ? { image } : { image: undefined }),
    workdir,
    lifecycle,
    network,
    ...(mounts.length ? { mounts } : { mounts: undefined }),
  };

  if (newId !== id) {
    const { unlinkSync } = await import("fs");
    unlinkSync(sandboxPath(id));
  }

  saveSandbox(updated);
  console.log(chalk.green(`Sandbox "${newId}" updated.`));
}
```

Add the necessary imports at the top of `src/interactive.ts`:

```ts
import {
  type Sandbox,
  type SandboxMount,
  type SandboxDriverName,
  type SandboxLifecycle,
  type MountMode,
  type NetworkMode,
} from "./sandboxes.js";
```

- [ ] **Step 2: Wire CRUD commands into `src/cli.ts`**

Add these imports at the top of `src/cli.ts`, alongside the existing `profiles.js` import:

```ts
import {
  type Sandbox,
  saveSandbox,
  loadSandbox,
  sandboxExists,
  listSandboxes,
} from "./sandboxes.js";
import { isTemplateName, getTemplate, TEMPLATE_NAMES } from "./sandboxTemplates.js";
import {
  sandboxWizard,
  editSandboxWizard,
} from "./interactive.js";
```

(Add `sandboxWizard, editSandboxWizard` to the existing `interactive.js` import block rather than a new statement.)

Add a `gent create sandbox` command after the existing `createCmd.command("scaffold")` block:

```ts
createCmd
  .command("sandbox [nameOrTemplate]")
  .description(`Create a new sandbox (interactive wizard, or from a built-in template: ${TEMPLATE_NAMES.join(", ")})`)
  .action(async (nameOrTemplate?: string) => {
    let sandbox: Sandbox;
    if (nameOrTemplate && isTemplateName(nameOrTemplate)) {
      sandbox = getTemplate(nameOrTemplate);
    } else {
      sandbox = await sandboxWizard();
      if (nameOrTemplate) sandbox.id = nameOrTemplate;
    }
    if (sandboxExists(sandbox.id)) {
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `Sandbox "${sandbox.id}" already exists. Overwrite?`,
        default: false,
      });
      if (!ok) return;
    }
    saveSandbox(sandbox);
    console.log(chalk.green(`Sandbox "${sandbox.id}" saved.`));
  });
```

Add `gent show sandbox <name>` after the existing `showCmd.command("profile <name>")` block:

```ts
showCmd
  .command("sandbox <name>")
  .description("Print a sandbox's configuration")
  .action((name: string) => {
    if (!sandboxExists(name)) {
      console.error(chalk.red(`Sandbox "${name}" not found.`));
      process.exit(1);
    }
    const s = loadSandbox(name);
    const row = (label: string, value: string) =>
      console.log(`  ${chalk.gray(label.padEnd(12))} ${value}`);
    console.log();
    row("id", chalk.bold(s.id));
    if (s.name) row("name", s.name);
    row("driver", s.driver);
    if (s.image) row("image", s.image);
    if (s.workdir) row("workdir", s.workdir);
    row("lifecycle", s.lifecycle ?? "ephemeral");
    row("network", s.network ?? "full");
    if (s.mounts?.length) {
      row("mounts", "");
      for (const m of s.mounts) {
        console.log(`  ${" ".repeat(12)} ${m.source} -> ${m.target} (${m.mode})`);
      }
    }
    if (s.environment && Object.keys(s.environment).length) {
      row("environment", Object.entries(s.environment).map(([k, v]) => `${k}=${v}`).join(", "));
    }
    console.log();
  });
```

Add `gent update sandbox <name>` after the existing `updateCmd.command("profile <name>")` block:

```ts
updateCmd
  .command("sandbox <name>")
  .description("Edit a sandbox interactively")
  .action(async (name: string) => {
    if (!sandboxExists(name)) {
      console.error(chalk.red(`Sandbox "${name}" not found.`));
      process.exit(1);
    }
    await editSandboxWizard(name);
  });
```

Add `gent delete sandbox <name>` after the existing `deleteCmd.command("profile <name>")` block:

```ts
deleteCmd
  .command("sandbox <name>")
  .description("Delete a sandbox definition (does not stop/destroy a running instance)")
  .action(async (name: string) => {
    if (!sandboxExists(name)) {
      console.error(chalk.red(`Sandbox "${name}" not found.`));
      process.exit(1);
    }
    const sandbox = loadSandbox(name);
    const { getDriver } = await import("./sandboxDrivers.js");
    const driver = getDriver(sandbox.driver);
    const problems = await driver.validate(sandbox);
    // validate() surfaces config problems, not liveness — this is a
    // best-effort heads-up, not a hard block, since definitions and running
    // instances are deliberately decoupled.
    if ((sandbox.lifecycle ?? "ephemeral") === "persistent") {
      console.log(
        chalk.yellow(
          `Note: this is a persistent sandbox. If it's currently running, run \`gent sandbox ${name} destroy\` first.`
        )
      );
    }
    void problems; // validation result isn't used to block deletion, see note above
    const { confirm } = await import("@inquirer/prompts");
    const ok = await confirm({
      message: `Delete sandbox "${name}"?`,
      default: false,
    });
    if (!ok) return;
    const { unlinkSync } = await import("fs");
    const { sandboxPath } = await import("./sandboxes.js");
    unlinkSync(sandboxPath(name));
    console.log(chalk.green(`Sandbox "${name}" deleted.`));
  });
```

Add `gent list sandbox` after the existing `listCmd.command("mcp")` block:

```ts
listCmd
  .command("sandbox")
  .alias("sandboxes")
  .description("List all sandboxes")
  .action(() => {
    const sandboxes = listSandboxes();
    if (sandboxes.length === 0) {
      console.log(chalk.yellow("No sandboxes. Run `gent create sandbox`."));
      return;
    }
    for (const s of sandboxes) {
      const driver = chalk.cyan(`[${s.driver}]`);
      const lifecycle = chalk.gray(`(${s.lifecycle ?? "ephemeral"})`);
      console.log(`  ${chalk.bold(s.id)} ${driver} ${lifecycle}`);
    }
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual smoke test of the CRUD commands**

```bash
cd /tmp && rm -rf gent-manual-crud && mkdir gent-manual-crud && cd gent-manual-crud
HOME=$(pwd)/home npx tsx /Users/nando/Agents/gent/src/cli.ts create sandbox local
HOME=$(pwd)/home npx tsx /Users/nando/Agents/gent/src/cli.ts list sandbox
HOME=$(pwd)/home npx tsx /Users/nando/Agents/gent/src/cli.ts show sandbox local
HOME=$(pwd)/home npx tsx /Users/nando/Agents/gent/src/cli.ts delete sandbox local <<< "y"
cd /tmp && rm -rf gent-manual-crud
```
Expected: `create sandbox local` saves without prompting (template path), `list sandbox` shows `local [local] (ephemeral)`, `show sandbox local` prints the full config, `delete sandbox local` removes it after confirmation.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/interactive.ts
git commit -m "feat: wire sandbox CRUD commands (create/show/update/delete/list)"
```

---

### Task 8: CLI lifecycle subgroup (`gent sandbox <name> <action>`)

**Files:**
- Create: `src/commands/sandboxLifecycle.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `loadSandbox`, `sandboxExists`, `ensureSandboxRunsDir` (`src/sandboxes.ts`); `getDriver` (`src/sandboxDrivers.ts`).
- Produces: `registerSandboxLifecycle(program: Command): void`.

- [ ] **Step 1: Create `src/commands/sandboxLifecycle.ts`**

```ts
import { Command } from "commander";
import chalk from "chalk";
import { loadSandbox, sandboxExists, ensureSandboxRunsDir } from "../sandboxes.js";
import { getDriver } from "../sandboxDrivers.js";

const ACTIONS = ["validate", "run", "exec", "logs", "stop", "destroy"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export function registerSandboxLifecycle(program: Command): void {
  program
    .command("sandbox <name> <action> [args...]")
    .description(`Manage a sandbox's runtime lifecycle: ${ACTIONS.join(", ")}`)
    .action(async (name: string, action: string, args: string[]) => {
      if (!isAction(action)) {
        console.error(chalk.red(`Unknown sandbox action "${action}". Valid actions: ${ACTIONS.join(", ")}.`));
        process.exit(1);
      }
      if (!sandboxExists(name)) {
        console.error(chalk.red(`Sandbox "${name}" not found.`));
        process.exit(1);
      }
      const sandbox = loadSandbox(name);
      const driver = getDriver(sandbox.driver);

      switch (action) {
        case "validate": {
          const problems = await driver.validate(sandbox);
          if (problems.length === 0) {
            console.log(chalk.green("OK"));
          } else {
            for (const p of problems) console.log(chalk.yellow(`- ${p}`));
            process.exitCode = 1;
          }
          return;
        }
        case "run": {
          const tmpDir = ensureSandboxRunsDir(sandbox.id);
          await driver.ensureRunning(sandbox, tmpDir);
          console.log(chalk.green(`Sandbox "${name}" is running.`));
          return;
        }
        case "exec": {
          if (args.length === 0) {
            console.error(chalk.red("Usage: gent sandbox <name> exec -- <command> [args...]"));
            process.exit(1);
          }
          const tmpDir = ensureSandboxRunsDir(sandbox.id);
          await driver.ensureRunning(sandbox, tmpDir);
          const [command, ...rest] = args;
          const code = await driver.exec(sandbox, command, rest, tmpDir);
          process.exit(code);
          return;
        }
        case "logs":
          await driver.logs(sandbox);
          return;
        case "stop":
          await driver.stop(sandbox);
          console.log(chalk.green(`Sandbox "${name}" stopped.`));
          return;
        case "destroy":
          await driver.destroy(sandbox);
          console.log(chalk.green(`Sandbox "${name}" destroyed.`));
          return;
      }
    });
}
```

- [ ] **Step 2: Register it in `src/cli.ts`**

Add the import near the other `registerX` imports:

```ts
import { registerSandboxLifecycle } from "./commands/sandboxLifecycle.js";
```

Add the call alongside the other top-level `register*(program)` calls (near `registerDone(program);`):

```ts
registerSandboxLifecycle(program);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual smoke test with the local driver**

```bash
cd /tmp && rm -rf gent-manual-lifecycle && mkdir gent-manual-lifecycle && cd gent-manual-lifecycle
export HOME=$(pwd)/home
npx tsx /Users/nando/Agents/gent/src/cli.ts create sandbox local
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local validate
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local run
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local exec -- echo hello-from-sandbox
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local logs
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local stop
npx tsx /Users/nando/Agents/gent/src/cli.ts sandbox local destroy
cd /tmp && rm -rf gent-manual-lifecycle
```
Expected: `validate` prints `OK`, `run` prints `is running`, `exec -- echo hello-from-sandbox` prints `hello-from-sandbox`, `logs` prints the "not applicable to the local driver" message, `stop`/`destroy` print their confirmations.

- [ ] **Step 5: Commit**

```bash
git add src/commands/sandboxLifecycle.ts src/cli.ts
git commit -m "feat: add gent sandbox <name> <action> lifecycle subcommand"
```

---

### Task 9: End-to-end tests

**Files:**
- Modify: `src/commands/__tests__/e2e.test.ts`

**Interfaces:**
- Consumes: `createTempEnv` (`src/testHelpers/tempEnv.ts`), the built `dist/cli.js` binary via `runGent`/`expectSuccess` helpers already defined in this file.

- [ ] **Step 1: Add sandbox CRUD + lifecycle e2e tests**

Append a new `describe` block to `src/commands/__tests__/e2e.test.ts`:

```ts
describe("gent sandbox CRUD + lifecycle (local driver)", () => {
  it("creates, lists, shows, and deletes a sandbox from the local template", () => {
    const env = tempEnv();

    expectSuccess(runGent(env, ["create", "sandbox", "local"]));
    expect(existsSync(join(env.home, ".gent", "sandboxes", "local.yaml"))).toBe(true);
    expect(expectSuccess(runGent(env, ["list", "sandbox"]))).toContain("local");
    expect(expectSuccess(runGent(env, ["show", "sandbox", "local"]))).toContain("local");

    expectSuccess(runGent(env, ["delete", "sandbox", "local", "--yes"].filter((a) => a !== "--yes")));
  });

  it("runs validate/run/exec/logs/stop/destroy through the local driver", () => {
    const env = tempEnv();
    expectSuccess(runGent(env, ["create", "sandbox", "local"]));

    expect(expectSuccess(runGent(env, ["sandbox", "local", "validate"]))).toBe("OK");
    expectSuccess(runGent(env, ["sandbox", "local", "run"]));
    expect(expectSuccess(runGent(env, ["sandbox", "local", "exec", "--", "echo", "hello-from-sandbox"]))).toBe(
      "hello-from-sandbox"
    );
    expect(expectSuccess(runGent(env, ["sandbox", "local", "logs"]))).toContain("not applicable");
    expectSuccess(runGent(env, ["sandbox", "local", "stop"]));
    expectSuccess(runGent(env, ["sandbox", "local", "destroy"]));
  });

  it("reports an unknown sandbox action with a non-zero exit", () => {
    const env = tempEnv();
    expectSuccess(runGent(env, ["create", "sandbox", "local"]));
    const result = runGent(env, ["sandbox", "local", "bogus-action"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown sandbox action");
  });
});

describe("gent <profile> transparently runs inside its sandbox", () => {
  it("runs the agent through the local driver when profile.sandbox is set", () => {
    const env = tempEnv();
    expectSuccess(runGent(env, ["create", "sandbox", "local"]));

    // Write a profile that points at a fake "agent" binary (node itself,
    // echoing a marker) so we can assert it ran without needing claude/pi/codex
    // installed in the test environment.
    const profileDir = join(env.home, ".gent", "profiles");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "coding.yaml"),
      `agent: claude\nsandbox: local\n`,
      "utf8"
    );

    const result = runGent(env, ["coding", "--dry-run"]);
    expect(expectSuccess(result)).toContain("sandbox: local");
  });
});
```

Add the missing imports at the top of the file (`existsSync` and `mkdirSync` are already imported; add `writeFileSync`):

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
```

Remove the awkward `.filter((a) => a !== "--yes")` artifact in the first test above — `gent delete sandbox <name>` prompts for confirmation interactively and there's no `--yes` flag on it (matching `gent delete profile`'s behavior, which also has no `--yes`). Since `runGent` doesn't feed stdin, calling `delete sandbox` in a non-interactive test process will hang waiting for input. Replace that line with a direct filesystem assertion instead, since exercising the interactive confirm prompt isn't this test's job:

```ts
    expect(existsSync(join(env.home, ".gent", "sandboxes", "local.yaml"))).toBe(true);
```

(i.e. the final `it` body is just the create/list/show assertions — delete the `delete sandbox` line entirely from this test.)

- [ ] **Step 2: Run the e2e suite**

Run: `npx vitest run src/commands/__tests__/e2e.test.ts`
Expected: PASS (this rebuilds `dist/cli.js` via the `beforeAll` hook already in the file, then runs all scenarios)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file green

- [ ] **Step 4: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/commands/__tests__/e2e.test.ts
git commit -m "test: add end-to-end coverage for sandbox CRUD, lifecycle, and profile integration"
```

---

### Task 10: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/state.md`

- [ ] **Step 1: Add a Sandboxes section to `README.md`**

Insert a new `## Sandboxes` section after the existing `### Skills` section (before `### Security`):

```markdown
### Sandboxes

A sandbox defines *where* an agent runs — a profile defines *what it knows*. Attach one to a profile with `sandbox: <id>` and `gent <profile>` will transparently ensure it's running and execute the agent inside it instead of spawning locally:

```yaml
# ~/.gent/profiles/coding.yaml
sandbox: dev
```

```bash
gent create sandbox dev              # interactive wizard
gent create sandbox local            # from the "local" template (no isolation)
gent create sandbox apple-container  # from the "apple-container" template (Secure Agent preset)

gent list sandbox
gent show sandbox dev
gent update sandbox dev
gent delete sandbox dev              # removes the definition only, not a running instance

gent sandbox dev validate            # checks mounts, runtime availability, image existence
gent sandbox dev run                 # ensures it's running (mostly useful for persistent sandboxes)
gent sandbox dev exec -- codex       # run a command inside it directly
gent sandbox dev logs
gent sandbox dev stop
gent sandbox dev destroy
```

Two drivers are supported in this release:

- **`local`** — no isolation; runs the agent directly on the host. `workdir` becomes the working directory, `environment` is layered on top of the host's own env.
- **`apple-container`** — wraps [Apple's `container` runtime](https://github.com/apple/container) for per-container microVM isolation on Apple Silicon. Requires `image` to be set to an image containing the target agent binary.

Sandbox definition (`.gent/sandboxes/<id>.yaml`):

```yaml
driver: apple-container       # local | apple-container
image: ghcr.io/org/gent-agent:latest   # required for apple-container
workdir: /workspace
lifecycle: ephemeral          # ephemeral (default, destroyed after each run) | persistent (reused across runs)
mounts:
  - source: ~/Projects/app
    target: /workspace
    mode: rw                 # ro | rw
environment:
  GENT_PROFILE: coding
network: none                 # none | full (default: full)
```

Pass `--no-sandbox` on the bare launch command to force a local run even when the profile specifies a sandbox: `gent coding --no-sandbox`.

Docker and Podman drivers, along with an extension UI, are planned for a future release.
```

- [ ] **Step 2: Update `docs/state.md`**

In `docs/state.md`, under the `## Profiles, MCP servers, skills (YAML)` heading, add a line after the existing `.gent/skills/` bullet:

```markdown
- `.gent/sandboxes/<id>.yaml` — one file per sandbox definition (`gent create
  sandbox`, `gent show sandbox`, `gent update sandbox`, `gent delete
  sandbox`). Resolved the same way as profiles.
- `.gent/runs/<sandbox-id>/` — per-sandbox scratch dir holding the current
  run's MCP config, settings, system-prompt, and aggregated skills plugin,
  bind-mounted into isolated drivers at the same host path. Cleaned up after
  each run for ephemeral sandboxes; left in place for persistent ones so the
  running container keeps seeing fresh content.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/state.md
git commit -m "docs: document sandboxes in README and state.md"
```

---

## Self-Review Notes

**Spec coverage:** Every section of `docs/superpowers/specs/2026-07-01-sandboxes-design.md` maps to a task — data model & directory structure (Task 1), driver interface & local driver (Task 2), apple-container driver (Task 3), templates & driver registry (Task 4), profile linkage (Task 5), runner/profile integration (Task 6), CLI CRUD (Task 7), CLI lifecycle subgroup (Task 8), testing (Task 9), and docs (Task 10, not explicitly called out in the design as a task but implied by "portable and version-controlled" / discoverability goals).

**Type consistency:** `SandboxDriver.ensureRunning`/`.exec` take `tmpDir: string` consistently across the interface (Task 2), the local driver (Task 2), the apple-container driver (Task 3), `runInSandbox` (Task 6), and the lifecycle CLI (Task 8). `Sandbox.id` is always the authoritative identifier set from the filename in `loadSandbox`, matching `Profile.name`'s precedent.

**One resolved gap from the design doc:** the approved design described bind-mounting "the host tmp dir" generically without specifying where that lives for a *persistent* sandbox across repeated runs (a fresh `mkdtemp` per run wouldn't still be mounted into an already-running container). This plan resolves it by using a stable `.gent/runs/<sandbox-id>/` directory (already named in the original PRD's directory structure, §19) instead of `os.tmpdir()` whenever a sandbox is in play — overwritten in place on every run, cleaned up only for ephemeral sandboxes. This is called out explicitly in Task 1 Step 4's code comment and Task 10's docs update.
