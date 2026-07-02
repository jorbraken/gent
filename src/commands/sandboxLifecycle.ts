import { Command } from "commander";
import chalk from "chalk";
import { loadSandbox, sandboxExists, ensureSandboxRunsDir } from "../sandboxes.js";
import { getDriver } from "../sandboxDrivers.js";

const ACTIONS = ["validate", "run", "exec", "logs", "stop", "destroy"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

async function validateOrExit(driver: ReturnType<typeof getDriver>, sandbox: ReturnType<typeof loadSandbox>): Promise<void> {
  const problems = await driver.validate(sandbox);
  if (problems.length === 0) return;
  for (const p of problems) console.error(chalk.red(`- ${p}`));
  process.exit(1);
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
          await validateOrExit(driver, sandbox);
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
          await validateOrExit(driver, sandbox);
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
