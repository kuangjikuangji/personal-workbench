import type { ReactNode } from 'react';

type DataTableColumn<T> = {
  key: keyof T;
  label: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T extends { id: React.Key }> = {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
};

export function DataTable<T extends { id: React.Key }>({ caption, columns, rows }: DataTableProps<T>) {
  return (
    <div className="table-wrapper">
      <table className="responsive-table">
        <caption>{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={String(column.key)} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td data-label={column.label} key={String(column.key)}>
                  {column.render ? column.render(row) : String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
