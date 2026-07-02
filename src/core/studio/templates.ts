import yaml from "js-yaml";
import { type GentEntityKind } from "./types.js";

export interface EntityTemplate {
  kind: GentEntityKind;
  id: string;
  pathHint: string;
  content: string;
}

function yamlTemplate(kind: GentEntityKind, id: string, directory: string, value: unknown): EntityTemplate {
  return { kind, id, pathHint: `.gent/${directory}/${id}.yaml`, content: yaml.dump(value) };
}

export function templateForEntity(kind: GentEntityKind, id: string, variant = "default"): EntityTemplate {
  switch (kind) {
    case "profile":
      return yamlTemplate("profile", id, "profiles", {
        name: id,
        description: "",
        sandbox: variant === "local" ? "local" : undefined,
        mcp: [],
        skills: [],
      });
    case "sandbox":
      return yamlTemplate("sandbox", id, "sandboxes", variant === "apple-container" ? {
        id,
        name: "Secure Agent",
        driver: "apple-container",
        image: "",
        workdir: "/workspace",
        lifecycle: "ephemeral",
        mounts: [],
        environment: {},
        network: "none",
      } : {
        id,
        name: "Local (no isolation)",
        driver: "local",
        lifecycle: "ephemeral",
        network: "full",
      });
    case "contextPack":
      return yamlTemplate("contextPack", id, "context-packs", { id, name: id, include: { paths: [] }, exclude: { paths: [] } });
    case "pipeline":
      return yamlTemplate("pipeline", id, "pipelines", { id, name: id, steps: [] });
    case "memory":
      return { kind, id, pathHint: `.gent/memories/${id}.md`, content: `# ${id}\n\n` };
    case "decision":
      return { kind, id, pathHint: `.gent/decisions/${id}.md`, content: `# Decision: ${id}\n\nDate: 2026-07-01\n\n## Status\n\nProposed\n\n## Context\n\n## Decision\n\n## Consequences\n` };
    case "skill":
      return { kind, id, pathHint: `.gent/skills/${id}/SKILL.md`, content: `---\nname: ${id}\ndescription: Describe when to use this skill.\n---\n\n# ${id}\n\n` };
    case "mcpServer":
      return yamlTemplate("mcpServer", id, ".", { mcp_servers: { [id]: { type: "stdio", command: "" } } });
    case "run":
      throw new Error("Runs are read-only and do not have creation templates.");
  }
}
