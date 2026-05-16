import { buildVisibleRowsCSV, type VisibleRow } from './csv.ts';

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

const visibleRows: VisibleRow[] = [
  {
    id: 'api_health',
    endpoint: '/api/health',
    method: 'GET',
    description: 'Health check',
    status: 'Ready',
  },
  {
    id: 'api_time',
    endpoint: '/api/time',
    method: 'GET',
    description: 'Current server time',
    status: 'Ready',
  },
  {
    id: 'api_echo',
    endpoint: '/api/echo',
    method: 'POST',
    description: 'Echo JSON, text, or form data',
    status: 'Ready',
  },
];

const visibleColumns = [
  { key: 'endpoint', label: 'Endpoint' },
  { key: 'method', label: 'Method' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
] as const;

async function fetchJSON(path: string, options: RequestInit = {}): Promise<FetchJSONResult> {
  const res = await fetch(path, options);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep text as-is
  }
  return { ok: res.ok, status: res.status, data };
}

function show(el: HTMLElement, value: unknown) {
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function renderRows(tableBody: HTMLTableSectionElement) {
  tableBody.textContent = '';
  for (const row of visibleRows) {
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;
    for (const column of visibleColumns) {
      const cell = document.createElement('td');
      cell.textContent = row[column.key];
      tr.append(cell);
    }
    tableBody.append(tr);
  }
}

function downloadCSV(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'os-ubq-visible-rows.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', () => {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');
  const exportCsvBtn = byId<HTMLButtonElement>('exportCsv');
  const apiRows = byId<HTMLTableSectionElement>('apiRows');

  renderRows(apiRows);

  exportCsvBtn.addEventListener('click', () => {
    downloadCSV(buildVisibleRowsCSV(visibleRows));
  });

  healthBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/health');
    show(healthOut, res);
  });

  timeBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/time');
    show(timeOut, res);
  });

  echoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bodyText = echoInput.value || '{}';
    try {
      JSON.parse(bodyText);
    } catch (err) {
      show(echoOut, { error: 'Invalid JSON', details: String(err) });
      return;
    }
    const res = await fetchJSON('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyText,
    });
    show(echoOut, res);
  });
});
