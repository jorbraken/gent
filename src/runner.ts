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
