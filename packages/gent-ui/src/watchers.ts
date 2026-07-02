import * as vscode from "vscode";
import { type GentCoreBridge } from "./coreBridge.js";
import { refreshDiagnostics } from "./diagnostics.js";
import { type GentTreeProvider } from "./tree/GentTreeProvider.js";

export function registerGentWatchers(
  context: vscode.ExtensionContext,
  provider: GentTreeProvider,
  diagnostics: vscode.DiagnosticCollection,
  bridge: GentCoreBridge,
): void {
  const watcher = vscode.workspace.createFileSystemWatcher("**/.gent/**");
  const refresh = () => {
    provider.refresh();
    refreshDiagnostics(diagnostics, bridge);
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(refresh),
    watcher.onDidChange(refresh),
    watcher.onDidDelete(refresh),
  );
  refresh();
}
