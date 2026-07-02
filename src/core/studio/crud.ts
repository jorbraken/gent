import fs from "fs";
import path from "path";
import { GENT_DIR } from "../../config.js";
import { ENTITY_REGISTRY } from "./entityRegistry.js";
import { templateForEntity } from "./templates.js";
import { type GentEntityKind, type GentEntityRef } from "./types.js";

export interface CreateEntityInput {
  kind: GentEntityKind;
  id: string;
  variant?: string;
  gentDir?: string;
}

export interface UpdateEntityOptions {
  allowInvalid?: boolean;
}

export interface LoadedGentEntity extends GentEntityRef {
  content: string;
}

function entityPath(kind: GentEntityKind, id: string, gentDir = GENT_DIR, variant = "default"): string {
  if (kind === "run") throw new Error("Runs are read-only.");
  if (kind === "mcpServer") return path.join(gentDir, "config.yaml");
  const def = ENTITY_REGISTRY[kind];
  if (!def.directoryName) throw new Error(`Entity kind ${kind} has no directory.`);
  if (def.folderBacked) return path.join(gentDir, def.directoryName, id);
  return path.join(gentDir, def.directoryName, `${id}${def.fileExtension}`);
}

export function createEntity(input: CreateEntityInput): GentEntityRef {
  const gentDir = input.gentDir ?? GENT_DIR;
  const def = ENTITY_REGISTRY[input.kind];
  if (def.readonly) throw new Error(`${def.labelPlural} are read-only.`);
  const template = templateForEntity(input.kind, input.id, input.variant);
  const target = entityPath(input.kind, input.id, gentDir, input.variant);
  if (fs.existsSync(target)) throw new Error(`${def.labelSingular} "${input.id}" already exists.`);
  if (def.folderBacked) {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), template.content, "utf8");
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, template.content, "utf8");
  }
  return { kind: input.kind, id: input.id, label: input.id, path: target, readonly: false };
}

export function readEntity(ref: GentEntityRef): LoadedGentEntity {
  if (!ref.path) throw new Error(`Entity ${ref.kind}:${ref.id} has no source path.`);
  const source = fs.statSync(ref.path).isDirectory() ? path.join(ref.path, "SKILL.md") : ref.path;
  return { ...ref, content: fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "" };
}

export function updateEntity(ref: GentEntityRef, content: string, _opts: UpdateEntityOptions = {}): LoadedGentEntity {
  if (ref.readonly) throw new Error(`Entity ${ref.kind}:${ref.id} is read-only.`);
  if (!ref.path) throw new Error(`Entity ${ref.kind}:${ref.id} has no source path.`);
  const target = fs.existsSync(ref.path) && fs.statSync(ref.path).isDirectory() ? path.join(ref.path, "SKILL.md") : ref.path;
  fs.writeFileSync(target, content, "utf8");
  return { ...ref, content };
}

export function deleteEntity(ref: GentEntityRef): void {
  if (ref.readonly) throw new Error(`Entity ${ref.kind}:${ref.id} is read-only.`);
  if (!ref.path) throw new Error(`Entity ${ref.kind}:${ref.id} has no source path.`);
  fs.rmSync(ref.path, { recursive: true, force: true });
}
