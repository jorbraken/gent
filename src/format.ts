export interface CommandResult {
  message: string;
}

export function formatRows(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) return 'No records found';
  return rows.map((row) => columns.map((column) => String(row[column] ?? '')).join('\t')).join('\n');
}
