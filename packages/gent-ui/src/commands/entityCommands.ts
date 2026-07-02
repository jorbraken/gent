import * as vscode from "vscode";
import { createEntity, deleteEntity, readEntity, updateEntity, assessRoundTripSafety, type GentEntityKind } from "../../../../src/core/studio/index.js";
import { renderEntityEditorHtml } from "../editors/editorHtml.js";
import { refreshDiagnostics } from "../diagnostics.js";
import { type GentCoreBridge } from "../coreBridge.js";
import { type GentTreeItem, type GentTreeProvider } from "../tree/GentTreeProvider.js";

const CREATABLE_KINDS = ["profile", "sandbox", "contextPack", "skill", "mcpServer", "memory", "decision", "pipeline"] as const satisfies readonly GentEntityKind[];

function nonce(): string {
  return Math.random().toString(36).slice(2);
}

async function openEntity(item: GentTreeItem): Promise<void> {
  if (!item.sourcePath || !item.entityId) return;
  const loaded = readEntity({ kind: item.kind, id: item.entityId, label: String(item.label), path: item.sourcePath, readonly: item.contextValue?.includes("run") ?? false });
  const panel = vscode.window.createWebviewPanel("gent.entityEditor", `Gent: ${loaded.label}`, vscode.ViewColumn.One, { enableScripts: true });
  panel.webview.html = renderEntityEditorHtml({ nonce: nonce(), entity: loaded, roundTrip: assessRoundTripSafety(loaded) });
  panel.webview.onDidReceiveMessage((message: { type: string; content?: string }) => {
    if (message.type === "saveSource" && typeof message.content === "string") {
      updateEntity(loaded, message.content);
      vscode.window.showInformationMessage(`Saved ${loaded.kind} ${loaded.id}.`);
    }
  });
}

async function createNewEntity(provider: GentTreeProvider): Promise<void> {
  const kind = await vscode.window.showQuickPick(CREATABLE_KINDS, { placeHolder: "Entity type" });
  if (!kind) return;
  const selectedKind = kind as GentEntityKind;
  const id = await vscode.window.showInputBox({ prompt: `New ${selectedKind} id`, validateInput: (v) => /^[A-Za-z0-9_-]+$/.test(v) ? undefined : "Use letters, numbers, hyphens, and underscores." });
  if (!id) return;
  const variant = selectedKind === "sandbox" ? await vscode.window.showQuickPick(["local", "apple-container"], { placeHolder: "Sandbox template" }) : undefined;
  createEntity({ kind: selectedKind, id, variant });
  provider.refresh();
}

async function deleteExistingEntity(item: GentTreeItem, provider: GentTreeProvider): Promise<void> {
  if (!item.sourcePath || !item.entityId) return;
  const confirmed = await vscode.window.showWarningMessage(`Delete ${item.kind} ${item.entityId}?`, { modal: true }, "Delete");
  if (confirmed !== "Delete") return;
  deleteEntity({ kind: item.kind, id: item.entityId, label: String(item.label), path: item.sourcePath, readonly: false });
  provider.refresh();
}

async function revealSource(item: GentTreeItem): Promise<void> {
  if (!item.sourcePath) return;
  await vscode.window.showTextDocument(vscode.Uri.file(item.sourcePath));
}

export function registerEntityCommands(context: vscode.ExtensionContext, provider: GentTreeProvider, diagnostics: vscode.DiagnosticCollection, bridge: GentCoreBridge): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gent.openEntity", openEntity),
    vscode.commands.registerCommand("gent.createEntity", async () => { await createNewEntity(provider); refreshDiagnostics(diagnostics, bridge); }),
    vscode.commands.registerCommand("gent.deleteEntity", async (item: GentTreeItem) => { await deleteExistingEntity(item, provider); refreshDiagnostics(diagnostics, bridge); }),
    vscode.commands.registerCommand("gent.revealSource", revealSource),
  );
}
