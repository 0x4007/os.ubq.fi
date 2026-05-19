/// <reference lib="dom" />

import { buildCurrentViewExport, type CurrentViewRow } from './currentViewExport.ts';

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

const CURRENT_VIEW_COLUMNS = ['id', 'title', 'status'] as const;
const CURRENT_VIEW_ROWS: CurrentViewRow[] = [
  { id: 'iss_0001', title: 'URL state and deep links', status: 'open' },
  { id: 'iss_0002', title: 'Sortable headers', status: 'open' },
  { id: 'iss_0003', title: 'Filter chips', status: 'open' },
];

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

function renderCurrentView(tbody: HTMLTableSectionElement) {
  tbody.replaceChildren();
  for (const row of CURRENT_VIEW_ROWS) {
    const tr = document.createElement('tr');
    for (const column of CURRENT_VIEW_COLUMNS) {
      const td = document.createElement('td');
      td.textContent = String(row[column] ?? '');
      tr.append(td);
    }
    tbody.append(tr);
  }
}

function currentViewPayload() {
  return buildCurrentViewExport([...CURRENT_VIEW_COLUMNS], CURRENT_VIEW_ROWS, {
    table: 'issues',
    offset: 0,
    limit: CURRENT_VIEW_ROWS.length,
  });
}

function downloadJSON(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'current-view.json';
  link.click();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', () => {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const currentViewBody = byId<HTMLTableSectionElement>('currentViewBody');
  const exportJSONBtn = byId<HTMLButtonElement>('exportJSON');
  const exportJSONOut = byId<HTMLPreElement>('exportJSONOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');

  renderCurrentView(currentViewBody);
  show(exportJSONOut, currentViewPayload());

  healthBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/health');
    show(healthOut, res);
  });

  timeBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/time');
    show(timeOut, res);
  });

  exportJSONBtn.addEventListener('click', () => {
    const payload = currentViewPayload();
    show(exportJSONOut, payload);
    downloadJSON(payload);
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
