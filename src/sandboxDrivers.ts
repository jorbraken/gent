import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
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

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isRootLevelOrHome(source: string): boolean {
  const expanded = path.resolve(expandHome(source));
  const parsed = path.parse(expanded);
  const home = path.resolve(os.homedir());
  return expanded === parsed.root || path.dirname(expanded) === parsed.root || expanded === home;
}

function commonSandboxProblems(sandbox: Sandbox): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(sandbox.environment ?? {})) {
    if (!ENV_NAME.test(key)) problems.push(`Invalid environment variable name: ${key}`);
    if (typeof value !== "string") problems.push(`Environment value for ${key} must be a string`);
  }
  for (const m of sandbox.mounts ?? []) {
    if (!path.isAbsolute(m.target)) {
      problems.push(`Mount target must be an absolute container path: ${m.target}`);
    }
    if (m.mode === "rw" && isRootLevelOrHome(m.source)) {
      problems.push(`Refusing rw mount of broad host directory: ${m.source}`);
    }
  }
  return problems;
}

export const localDriver: SandboxDriver = {
  name: "local",
  async validate(sandbox) {
    const problems = commonSandboxProblems(sandbox);
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
    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(chalk.red(`${command} is not installed or not in PATH.`));
      } else {
        console.error(chalk.red(`Failed to launch ${command}: ${result.error.message}`));
      }
      return 1;
    }
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

function buildNetworkFlags(sandbox: Sandbox): string[] {
  if (sandbox.network === "none") {
    return ["--network", "none"];
  }
  return [];
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
    ...buildNetworkFlags(sandbox),
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
    ...buildNetworkFlags(sandbox),
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

let containerBinaryAvailable: boolean | null = null;

function isContainerBinaryAvailable(): boolean {
  if (containerBinaryAvailable !== null) return containerBinaryAvailable;
  const result = spawnSync("container", ["--version"]);
  containerBinaryAvailable = !result.error;
  return containerBinaryAvailable;
}

function isPersistent(sandbox: Sandbox): boolean {
  return sandbox.lifecycle === "persistent";
}

export const appleContainerDriver: SandboxDriver = {
  name: "apple-container",
  async validate(sandbox) {
    const problems = commonSandboxProblems(sandbox);
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
