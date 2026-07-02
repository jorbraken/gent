export const ENTITY_KINDS = [
  "profile",
  "sandbox",
  "contextPack",
  "skill",
  "mcpServer",
  "memory",
  "decision",
  "pipeline",
  "run",
] as const;

export type GentEntityKind = (typeof ENTITY_KINDS)[number];

export interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface GentDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
  range?: SourceRange;
}

export interface GentEntityRef {
  kind: GentEntityKind;
  id: string;
  label: string;
  path?: string;
  readonly: boolean;
}

export interface EntityDefinition {
  kind: GentEntityKind;
  labelSingular: string;
  labelPlural: string;
  directoryName?: string;
  fileExtension?: ".yaml" | ".md" | "";
  readonly: boolean;
  folderBacked?: boolean;
}
