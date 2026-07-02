import { spawn } from "node:child_process";
import { listStudioWorkspace, validateStudioWorkspace, type GentDiagnostic, type StudioWorkspaceSnapshot } from "../../../src/core/studio/index.js";

export interface CliResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export class GentCoreBridge {
  snapshot(): StudioWorkspaceSnapshot {
    return listStudioWorkspace();
  }

  validate(): GentDiagnostic[] {
    return validateStudioWorkspace();
  }

  runGent(args: string[], cwd = process.cwd()): Promise<CliResult> {
    return new Promise((resolve) => {
      const child = spawn("gent", args, { cwd, shell: false });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (error) => {
        resolve({ command: `gent ${args.join(" ")}`, cwd, exitCode: 1, stdout, stderr: error.message });
      });
      child.on("close", (exitCode) => {
        resolve({ command: `gent ${args.join(" ")}`, cwd, exitCode, stdout, stderr });
      });
    });
  }
}
