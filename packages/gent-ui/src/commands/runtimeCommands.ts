import * as vscode from "vscode";
import { type GentCoreBridge, type CliResult } from "../coreBridge.js";
import { type GentTreeItem } from "../tree/GentTreeProvider.js";

export type SandboxLifecycleAction = "validate" | "run" | "logs" | "stop" | "destroy";

export function buildInspectArgs(profile: string): string[] {
  return ["inspect", profile];
}

export function buildPreviewArgs(profile: string, input?: string): string[] {
  return input ? ["preview", profile, input] : ["preview", profile];
}

export function buildSandboxLifecycleArgs(name: string, action: SandboxLifecycleAction): string[] {
  return ["sandbox", name, action];
}

function renderCliResult(result: CliResult): string {
  return `# ${result.command}\n\nWorking directory: ${result.cwd}\nExit code: ${result.exitCode}\n\n## stdout\n\n\`\`\`text\n${result.stdout}\n\`\`\`\n\n## stderr\n\n\`\`\`text\n${result.stderr}\n\`\`\``;
}

async function showResult(title: string, result: CliResult): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content: renderCliResult(result), language: "markdown" });
  await vscode.window.showTextDocument(doc, { preview: true });
  if (result.exitCode !== 0) {
    await vscode.window.showWarningMessage(`${title} failed with exit code ${result.exitCode}.`);
  }
}

async function inspectProfile(bridge: GentCoreBridge, item?: GentTreeItem): Promise<void> {
  const profile = item?.entityId ?? await vscode.window.showInputBox({ prompt: "Profile to inspect" });
  if (!profile) return;
  await showResult(`Inspect ${profile}`, await bridge.runGent(buildInspectArgs(profile)));
}

async function previewProfile(bridge: GentCoreBridge, item?: GentTreeItem): Promise<void> {
  const profile = item?.entityId ?? await vscode.window.showInputBox({ prompt: "Profile to preview" });
  if (!profile) return;
  const input = await vscode.window.showInputBox({ prompt: "Optional input path", value: "" });
  await showResult(`Preview ${profile}`, await bridge.runGent(buildPreviewArgs(profile, input || undefined)));
}

async function sandboxAction(bridge: GentCoreBridge, action: SandboxLifecycleAction, item?: GentTreeItem): Promise<void> {
  const sandbox = item?.entityId ?? await vscode.window.showInputBox({ prompt: `Sandbox to ${action}` });
  if (!sandbox) return;
  if (action === "destroy") {
    const confirmed = await vscode.window.showWarningMessage(`Destroy sandbox ${sandbox}?`, { modal: true }, "Destroy");
    if (confirmed !== "Destroy") return;
  }
  await showResult(`Sandbox ${action} ${sandbox}`, await bridge.runGent(buildSandboxLifecycleArgs(sandbox, action)));
}

export function registerRuntimeCommands(context: vscode.ExtensionContext, bridge: GentCoreBridge): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gent.inspectProfile", (item?: GentTreeItem) => inspectProfile(bridge, item)),
    vscode.commands.registerCommand("gent.previewProfile", (item?: GentTreeItem) => previewProfile(bridge, item)),
    vscode.commands.registerCommand("gent.sandbox.validate", (item?: GentTreeItem) => sandboxAction(bridge, "validate", item)),
    vscode.commands.registerCommand("gent.sandbox.run", (item?: GentTreeItem) => sandboxAction(bridge, "run", item)),
    vscode.commands.registerCommand("gent.sandbox.logs", (item?: GentTreeItem) => sandboxAction(bridge, "logs", item)),
    vscode.commands.registerCommand("gent.sandbox.stop", (item?: GentTreeItem) => sandboxAction(bridge, "stop", item)),
    vscode.commands.registerCommand("gent.sandbox.destroy", (item?: GentTreeItem) => sandboxAction(bridge, "destroy", item)),
  );
}
