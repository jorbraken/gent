import { type LoadedGentEntity, type RoundTripAssessment } from "../../../../src/core/studio/index.js";

export interface RenderEntityEditorInput {
  nonce: string;
  entity: LoadedGentEntity;
  roundTrip: RoundTripAssessment;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]!));
}

function sandboxFields(content: string): string {
  const driver = content.match(/^driver:\s*(.+)$/m)?.[1] ?? "local";
  const network = content.match(/^network:\s*(.+)$/m)?.[1] ?? "full";
  return `
    <label>Driver <select name="driver"><option ${driver === "local" ? "selected" : ""}>local</option><option ${driver === "apple-container" ? "selected" : ""}>apple-container</option></select></label>
    <label>Network <select name="network"><option ${network === "none" ? "selected" : ""}>none</option><option ${network === "full" ? "selected" : ""}>full</option></select></label>
    <label>Image <input name="image" value="${escapeHtml(content.match(/^image:\s*(.*)$/m)?.[1] ?? "")}" /></label>
    <label>Workdir <input name="workdir" value="${escapeHtml(content.match(/^workdir:\s*(.*)$/m)?.[1] ?? "")}" /></label>
  `;
}

function genericFields(entity: LoadedGentEntity): string {
  if (entity.kind === "sandbox") return sandboxFields(entity.content);
  if (entity.kind === "profile") {
    const sandbox = entity.content.match(/^sandbox:\s*(.+)$/m)?.[1] ?? "";
    return `<label>Sandbox <input name="sandbox" value="${escapeHtml(sandbox)}" /></label>`;
  }
  return `<p>Use the source pane for markdown or advanced fields. Visual save preserves the full source text.</p>`;
}

export function renderEntityEditorHtml(input: RenderEntityEditorInput): string {
  const disabled = input.roundTrip.safe ? "" : "disabled";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${input.nonce}';">
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
textarea { width: 100%; height: 70vh; font-family: var(--vscode-editor-font-family); }
label { display: block; margin: 0 0 12px; }
input, select { width: 100%; }
.warning { color: var(--vscode-editorWarning-foreground); }
</style>
</head>
<body>
<h1>${escapeHtml(input.entity.label)}</h1>
${input.roundTrip.safe ? "" : `<p class="warning">${escapeHtml(input.roundTrip.message)}</p>`}
<div class="split">
<section><h2>Source</h2><textarea id="source">${escapeHtml(input.entity.content)}</textarea></section>
<section><h2>Visual</h2><form id="visual">${genericFields(input.entity)}<button ${disabled}>Save</button></form></section>
</div>
<script nonce="${input.nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('visual').addEventListener('submit', (event) => {
  event.preventDefault();
  vscode.postMessage({ type: 'saveSource', content: document.getElementById('source').value });
});
</script>
</body>
</html>`;
}
