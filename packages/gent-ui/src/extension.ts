import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gent.refresh", () => {
      vscode.window.showInformationMessage("Gent UI refreshed.");
    })
  );
}

export function deactivate(): void {}
