import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { GENT_DIR } from "../../config.js";
import { listStudioWorkspace } from "./workspace.js";
import { type GentDiagnostic } from "./types.js";

function parseYamlFile(filePath: string): unknown {
  return yaml.load(fs.readFileSync(filePath, "utf8"));
}

export function validateStudioWorkspace(gentDir = GENT_DIR): GentDiagnostic[] {
  const snapshot = listStudioWorkspace(gentDir);
  const diagnostics: GentDiagnostic[] = [];
  const sandboxIds = new Set(snapshot.entities.sandbox.map((s) => s.id));

  for (const profile of snapshot.entities.profile) {
    if (!profile.path) continue;
    try {
      const parsed = parseYamlFile(profile.path) as { sandbox?: string } | null;
      if (parsed?.sandbox && !sandboxIds.has(parsed.sandbox)) {
        diagnostics.push({
          code: "profile.sandbox.missing",
          severity: "error",
          message: `Profile "${profile.id}" references missing sandbox "${parsed.sandbox}".`,
          path: profile.path,
        });
      }
    } catch (error) {
      diagnostics.push({
        code: "yaml.parse",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        path: profile.path,
      });
    }
  }

  for (const sandbox of snapshot.entities.sandbox) {
    if (!sandbox.path) continue;
    try {
      const parsed = parseYamlFile(sandbox.path) as { driver?: string; image?: string; network?: string } | null;
      if (!parsed?.driver) {
        diagnostics.push({ code: "sandbox.driver.missing", severity: "error", message: `Sandbox "${sandbox.id}" is missing driver.`, path: sandbox.path });
      }
      if (parsed?.driver && !["local", "apple-container"].includes(parsed.driver)) {
        diagnostics.push({ code: "sandbox.driver.unsupported", severity: "error", message: `Sandbox "${sandbox.id}" uses unsupported v1 driver "${parsed.driver}".`, path: sandbox.path });
      }
      if (parsed?.driver === "apple-container" && !parsed.image) {
        diagnostics.push({ code: "sandbox.image.missing", severity: "warning", message: `Apple Container sandbox "${sandbox.id}" has no image configured.`, path: sandbox.path });
      }
      if (parsed?.network && !["none", "full"].includes(parsed.network)) {
        diagnostics.push({ code: "sandbox.network.invalid", severity: "error", message: `Sandbox "${sandbox.id}" network must be "none" or "full".`, path: sandbox.path });
      }
    } catch (error) {
      diagnostics.push({ code: "yaml.parse", severity: "error", message: error instanceof Error ? error.message : String(error), path: sandbox.path });
    }
  }

  for (const kind of ["contextPack", "pipeline"] as const) {
    for (const entity of snapshot.entities[kind]) {
      if (!entity.path) continue;
      try { parseYamlFile(entity.path); }
      catch (error) {
        diagnostics.push({ code: "yaml.parse", severity: "error", message: error instanceof Error ? error.message : String(error), path: entity.path });
      }
    }
  }

  return diagnostics.sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.code.localeCompare(b.code));
}
