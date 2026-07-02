import { ENTITY_KINDS, type EntityDefinition, type GentEntityKind } from "./types.js";

export const ENTITY_REGISTRY: Record<GentEntityKind, EntityDefinition> = {
  profile: {
    kind: "profile",
    labelSingular: "Profile",
    labelPlural: "Profiles",
    directoryName: "profiles",
    fileExtension: ".yaml",
    readonly: false,
  },
  sandbox: {
    kind: "sandbox",
    labelSingular: "Sandbox",
    labelPlural: "Sandboxes",
    directoryName: "sandboxes",
    fileExtension: ".yaml",
    readonly: false,
  },
  contextPack: {
    kind: "contextPack",
    labelSingular: "Context Pack",
    labelPlural: "Context Packs",
    directoryName: "context-packs",
    fileExtension: ".yaml",
    readonly: false,
  },
  skill: {
    kind: "skill",
    labelSingular: "Skill",
    labelPlural: "Skills",
    directoryName: "skills",
    fileExtension: "",
    readonly: false,
    folderBacked: true,
  },
  mcpServer: {
    kind: "mcpServer",
    labelSingular: "MCP Server",
    labelPlural: "MCP Servers",
    readonly: false,
  },
  memory: {
    kind: "memory",
    labelSingular: "Memory",
    labelPlural: "Memories",
    directoryName: "memories",
    fileExtension: ".md",
    readonly: false,
  },
  decision: {
    kind: "decision",
    labelSingular: "Decision",
    labelPlural: "Decisions",
    directoryName: "decisions",
    fileExtension: ".md",
    readonly: false,
  },
  pipeline: {
    kind: "pipeline",
    labelSingular: "Pipeline",
    labelPlural: "Pipelines",
    directoryName: "pipelines",
    fileExtension: ".yaml",
    readonly: false,
  },
  run: {
    kind: "run",
    labelSingular: "Run",
    labelPlural: "Runs",
    directoryName: "runs",
    fileExtension: "",
    readonly: true,
    folderBacked: true,
  },
};

for (const kind of ENTITY_KINDS) {
  if (ENTITY_REGISTRY[kind].kind !== kind) {
    throw new Error(`Invalid entity registry entry for ${kind}`);
  }
}
