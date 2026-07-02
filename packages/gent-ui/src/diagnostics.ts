import * as vscode from "vscode";
import { type GentDiagnostic } from "../../../src/core/studio/index.js";
import { type GentCoreBridge } from "./coreBridge.js";

function severity(input: GentDiagnostic["severity"]): vscode.DiagnosticSeverity {
  if (input === "error") return vscode.DiagnosticSeverity.Error;
  if (input === "warning") return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

export function refreshDiagnostics(collection: vscode.DiagnosticCollection, bridge: Pick<GentCoreBridge, "validate">): void {
  collection.clear();
  const grouped = new Map<string, vscode.Diagnostic[]>();
  for (const diagnostic of bridge.validate()) {
    if (!diagnostic.path) continue;
    const range = diagnostic.range
      ? new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.line, diagnostic.range.end.character)
      : new vscode.Range(0, 0, 0, 1);
    const item = new vscode.Diagnostic(range, `${diagnostic.code}: ${diagnostic.message}`, severity(diagnostic.severity));
    grouped.set(diagnostic.path, [...(grouped.get(diagnostic.path) ?? []), item]);
  }

  for (const [filePath, diagnostics] of grouped) {
    collection.set(vscode.Uri.file(filePath), diagnostics);
  }
}
