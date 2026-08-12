import * as XLSX from 'xlsx';
import type { ExportColumn, ExportRow } from './csv';

export function makeXlsx(sheetName: string, columns: ExportColumn[], rows: ExportRow[]): ArrayBuffer {
  const data = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key] ?? '')),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
