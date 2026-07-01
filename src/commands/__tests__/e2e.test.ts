import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, type TempEnv } from "../../testHelpers/tempEnv.js";

const cliPath = resolve("dist/cli.js");

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

let envs: TempEnv[] = [];

function tempEnv(): TempEnv {
  const env = createTempEnv();
  envs.push(env);
  mkdirSync(env.home, { recursive: true });
  mkdirSync(env.projectRoot, { recursive: true });
  return env;
}

function runGent(env: TempEnv, args: string[]): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: env.projectRoot,
    env: { ...process.env, HOME: env.home, USERPROFILE: env.home },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function expectSuccess(result: CliResult): string {
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { stdio: "pipe" });
  expect(existsSync(cliPath)).toBe(true);
});

afterEach(() => {
  for (const env of envs) env.cleanup();
  envs = [];
});

describe("gent verb-first CLI e2e", () => {
  it("registers a project and manages its full task lifecycle", () => {
    const env = tempEnv();

    expectSuccess(runGent(env, ["create", "project", "demo", "--yes"]));
    expect(existsSync(join(env.home, ".gent", "projects.db"))).toBe(true);
    expect(existsSync(join(env.projectRoot, ".gent", "project.db"))).toBe(true);
    expect(expectSuccess(runGent(env, ["list", "project"]))).toContain("demo");

    expectSuccess(
      runGent(env, ["add", "task", "Build CLI router", "--status", "todo", "--priority", "high", "--description", "Ship command routing"])
    );
    expect(expectSuccess(runGent(env, ["list", "task"]))).toContain("1\tBuild CLI router\ttodo");
    expect(expectSuccess(runGent(env, ["show", "task", "1"]))).toContain("Build CLI router\ttodo\tShip command routing");
    expectSuccess(runGent(env, ["update", "task", "1", "--status", "in_progress"]));
    expect(expectSuccess(runGent(env, ["show", "task", "1"]))).toContain("in_progress");
    expectSuccess(runGent(env, ["done", "task", "1"]));
    expect(expectSuccess(runGent(env, ["show", "task", "1"]))).toContain("done");
    expectSuccess(runGent(env, ["delete", "task", "1"]));
    expect(expectSuccess(runGent(env, ["list", "task"]))).toBe("No records found");
  });

  it("creates a memory and lists it back", () => {
    const env = tempEnv();
    expectSuccess(runGent(env, ["create", "project", "demo", "--yes"]));

    expectSuccess(runGent(env, ["add", "memory", "Use explicit repositories, not ORM", "--kind", "decision"]));
    expect(expectSuccess(runGent(env, ["list", "memory"]))).toContain("1\tUse explicit repositories, not ORM\tdecision");
  });

  it("keeps profile listing available under both bare `list` and `list profile`", () => {
    const env = tempEnv();
    expect(expectSuccess(runGent(env, ["list"]))).toContain("No profiles");
    expect(expectSuccess(runGent(env, ["list", "profile"]))).toContain("No profiles");
  });
});
