export type CurrentViewRow = Record<string, string | number | boolean | null>;

type CurrentViewMeta = {
  table: string;
  offset: number;
  limit: number;
};

export function buildCurrentViewExport(
  columns: string[],
  rows: CurrentViewRow[],
  meta: CurrentViewMeta,
  exportedAt = new Date(),
) {
  return {
    columns,
    rows: rows.map((row) => pickColumns(row, columns)),
    meta: {
      ...meta,
      rowCount: rows.length,
      exportedAt: exportedAt.toISOString(),
    },
  };
}

function pickColumns(row: CurrentViewRow, columns: string[]): CurrentViewRow {
  const picked: CurrentViewRow = {};
  for (const column of columns) {
    picked[column] = row[column] ?? null;
  }
  return picked;
}
