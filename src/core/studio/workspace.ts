import fs from "fs";
import path from "path";
import { GENT_DIR } from "../../config.js";
import { ENTITY_KINDS, type GentEntityKind, type GentEntityRef, type GentDiagnostic } from "./types.js";
import { ENTITY_REGISTRY } from "./entityRegistry.js";

export interface StudioWorkspaceSnapshot {
  gentDir: string;
  entities: Record<GentEntityKind, GentEntityRef[]>;
  diagnostics: GentDiagnostic[];
}

function emptyEntities(): Record<GentEntityKind, GentEntityRef[]> {
  return Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, []])) as Record<GentEntityKind, GentEntityRef[]>;
}

function listDirectoryEntities(kind: GentEntityKind, gentDir: string): GentEntityRef[] {
  const def = ENTITY_REGISTRY[kind];
  if (!def.directoryName) return [];
  const dir = path.join(gentDir, def.directoryName);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((entry) => def.folderBacked ? entry.isDirectory() : entry.isFile() && entry.name.endsWith(def.fileExtension ?? ""))
    .map((entry) => {
      const id = def.folderBacked ? entry.name : entry.name.slice(0, -((def.fileExtension ?? "").length));
      return {
        kind,
        id,
        label: id,
        path: path.join(dir, entry.name),
        readonly: def.readonly,
      } satisfies GentEntityRef;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function listMcpServers(gentDir: string): GentEntityRef[] {
  const configPath = path.join(gentDir, "config.yaml");
  if (!fs.existsSync(configPath)) return [];
  const text = fs.readFileSync(configPath, "utf8");
  const matches = [...text.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];
  return matches.map((m) => ({
    kind: "mcpServer" as const,
    id: m[1],
    label: m[1],
    path: configPath,
    readonly: false,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function listStudioWorkspace(gentDir = GENT_DIR): StudioWorkspaceSnapshot {
  const entities = emptyEntities();
  for (const kind of ENTITY_KINDS) {
    entities[kind] = kind === "mcpServer" ? listMcpServers(gentDir) : listDirectoryEntities(kind, gentDir);
  }
  return { gentDir, entities, diagnostics: [] };
}
