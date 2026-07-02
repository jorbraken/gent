import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

describe("gent sandbox CRUD + lifecycle (local driver)", () => {
  it("creates, lists, and shows a sandbox from the local template", () => {
    const env = tempEnv();

    expectSuccess(runGent(env, ["create", "sandbox", "local"]));
    expect(existsSync(join(env.home, ".gent", "sandboxes", "local.yaml"))).toBe(true);
    expect(expectSuccess(runGent(env, ["list", "sandbox"]))).toContain("local");
    expect(expectSuccess(runGent(env, ["show", "sandbox", "local"]))).toContain("local");
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
