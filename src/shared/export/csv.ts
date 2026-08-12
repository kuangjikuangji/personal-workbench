export type ExportColumn = { key: string; label: string };
export type ExportRow = Record<string, unknown>;

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function makeCsv(columns: ExportColumn[], rows: ExportRow[]): Uint8Array {
  const lines = [
    columns.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')),
  ];
  return new TextEncoder().encode(`\ufeff${lines.join('\r\n')}`);
}
