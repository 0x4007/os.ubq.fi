export type VisibleRow = {
  id: string;
  endpoint: string;
  method: string;
  description: string;
  status: string;
};

const visibleColumns = [
  { key: 'endpoint', label: 'Endpoint' },
  { key: 'method', label: 'Method' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
] as const;

function escapeCSVCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildVisibleRowsCSV(rows: VisibleRow[]): string {
  const header = visibleColumns.map((column) => escapeCSVCell(column.label)).join(',');
  const body = rows.map((row) =>
    visibleColumns.map((column) => escapeCSVCell(row[column.key])).join(','),
  );
  return [header, ...body].join('\r\n');
}
