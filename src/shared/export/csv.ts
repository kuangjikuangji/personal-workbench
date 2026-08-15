export type ExportColumn = { key: string; label: string };
export type ExportRow = Record<string, unknown>;

function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const text = raw.replace(/^(\s*)([=+\-@])/, "$1'$2");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function makeCsv(columns: ExportColumn[], rows: ExportRow[]): Uint8Array {
  const lines = [
    columns.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')),
  ];
  return new TextEncoder().encode(`\ufeff${lines.join('\r\n')}`);
}
