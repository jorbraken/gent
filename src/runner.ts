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

const SECRET_KEY = /(token|key|secret|password|auth|credential)/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "<redacted>";
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item));
  if (value && typeof value === "object") return redactObject(value as Record<string, unknown>);
  return value;
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redactValue(key, val)]));
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item));
  if (value && typeof value === "object") return redactObject(value as Record<string, unknown>);
  return value;
}

function redactJsonArg(raw: string): string {
  try {
    return JSON.stringify(redactUnknown(JSON.parse(raw)));
  } catch {
    return raw;
  }
}

export function redactDryRunArgs(args: string[]): string[] {
  const redacted: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    redacted.push(arg);
    if ((arg === "--mcp-config" || arg === "--settings") && i + 1 < args.length) {
      redacted.push(redactJsonArg(args[++i]));
    }
  }
  return redacted;
}

async function assertSandboxValid(driver: SandboxDriver, sandbox: Sandbox): Promise<void> {
  const problems = await driver.validate(sandbox);
  if (problems.length > 0) {
    throw new Error(`Invalid sandbox "${sandbox.id}": ${problems.join("; ")}`);
  }
}

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
    console.log(chalk.cyan(adapter.binary) + " " + redactDryRunArgs([...args, ...extraArgs]).join(" ") + sandboxNote);
    return;
  }

  if (profile.sandbox && !noSandbox) {
    const sandbox = loadSandbox(profile.sandbox);
    const driver = getDriver(sandbox.driver);
    await assertSandboxValid(driver, sandbox);
    const tmpDir = ensureSandboxRunsDir(sandbox.id);
    let code: number;
    try {
      const args = adapter.buildArgs(profile, globalConfig, tmpDir);
      code = await runInSandbox(driver, sandbox, adapter.binary, [...args, ...extraArgs], tmpDir);
    } finally {
      if ((sandbox.lifecycle ?? "ephemeral") === "ephemeral") {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    process.exit(code);
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
