import { z } from "zod";

const stringArray = z.array(z.string());
const stringRecord = z.record(z.string(), z.string());
const agentNames = ["claude", "pi", "codex"] as const;
const driverNames = ["local", "apple-container"] as const;

const mcpServerBaseSchema = z.object({
  type: z.enum(["stdio", "http", "sse"]),
  command: z.string().optional(),
  args: stringArray.optional(),
  env: stringRecord.optional(),
  url: z.string().optional(),
  headers: stringRecord.optional(),
}).strict();

export const mcpServerSchema = mcpServerBaseSchema.superRefine((server, ctx) => {
  if (server.type === "stdio" && !server.command) {
    ctx.addIssue({ code: "custom", path: ["command"], message: "stdio MCP servers require command" });
  }
  if ((server.type === "http" || server.type === "sse") && !server.url) {
    ctx.addIssue({ code: "custom", path: ["url"], message: `${server.type} MCP servers require url` });
  }
});

export const gentConfigSchema = z.object({
  mcp_servers: z.record(z.string(), mcpServerSchema).default({}),
  extends: z.union([z.string(), stringArray]).optional(),
  extend_global: z.boolean().optional(),
}).strict();

export const profileSchema = z.object({
  name: z.string().optional(),
  agent: z.enum(agentNames).optional(),
  extends: z.union([z.string(), stringArray]).optional(),
  description: z.string().optional(),
  mcp: stringArray.optional(),
  skills: stringArray.optional(),
  strict_mcp: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  system_prompt_append: z.string().optional(),
  sandbox: z.string().optional(),
}).strict();

const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const sandboxMountSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  mode: z.enum(["ro", "rw"]),
}).strict();

export const sandboxSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  driver: z.enum(driverNames),
  image: z.string().optional(),
  workdir: z.string().optional(),
  lifecycle: z.enum(["ephemeral", "persistent"]).optional(),
  mounts: z.array(sandboxMountSchema).optional(),
  environment: z.record(z.string().regex(envName, "invalid environment variable name"), z.string()).optional(),
  network: z.enum(["none", "full"]).optional(),
}).strict();

export type ParsedGentConfig = z.infer<typeof gentConfigSchema>;
export type ParsedProfile = z.infer<typeof profileSchema>;
export type ParsedSandbox = z.infer<typeof sandboxSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}
