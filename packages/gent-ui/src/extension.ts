import * as vscode from "vscode";
import { registerEntityCommands } from "./commands/entityCommands.js";
import { GentCoreBridge } from "./coreBridge.js";
import { refreshDiagnostics } from "./diagnostics.js";
import { GentTreeProvider } from "./tree/GentTreeProvider.js";
import { registerGentWatchers } from "./watchers.js";

export function activate(context: vscode.ExtensionContext): void {
  const bridge = new GentCoreBridge();
  const provider = new GentTreeProvider(bridge);
  const diagnostics = vscode.languages.createDiagnosticCollection("gent");

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerTreeDataProvider("gent.entities", provider),
    vscode.commands.registerCommand("gent.refresh", () => {
      provider.refresh();
      refreshDiagnostics(diagnostics, bridge);
    }),
  );

  registerEntityCommands(context, provider, diagnostics, bridge);
  registerGentWatchers(context, provider, diagnostics, bridge);
}

export function deactivate(): void {}
