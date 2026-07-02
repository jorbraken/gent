import yaml from "js-yaml";
import { type LoadedGentEntity } from "./crud.js";

export interface RoundTripAssessment {
  safe: boolean;
  reason: "safe" | "parse-error" | "readonly" | "unsupported-kind";
  message: string;
}

export function assessRoundTripSafety(entity: LoadedGentEntity): RoundTripAssessment {
  if (entity.readonly) return { safe: false, reason: "readonly", message: "Read-only entities cannot be visually saved." };
  if (["profile", "sandbox", "contextPack", "pipeline"].includes(entity.kind)) {
    try {
      yaml.load(entity.content);
      return { safe: true, reason: "safe", message: "Entity can be edited visually." };
    } catch (error) {
      return { safe: false, reason: "parse-error", message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (["skill", "memory", "decision", "mcpServer"].includes(entity.kind)) {
    return { safe: true, reason: "safe", message: "Entity can be edited visually." };
  }
  return { safe: false, reason: "unsupported-kind", message: `No visual editor is available for ${entity.kind}.` };
}
