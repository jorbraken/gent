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
