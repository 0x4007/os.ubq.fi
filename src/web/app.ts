/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
export type SortKey = 'service' | 'status' | 'latencyMS' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

type SortState = { key: SortKey; order: SortOrder };
type SBRow = { service: string; status: string; latencyMS: number; updatedAt: string };

const DEFAULT_SORT: SortState = { key: 'service', order: 'asc' };
const SORT_KEYS: SortKey[] = ['service', 'status', 'latencyMS', 'updatedAt'];

function isSortKey(value: string | null): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

function isSortOrder(value: string | null): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

export function readSortState(params: URLSearchParams): SortState {
  const key = params.get('sort');
  const order = params.get('order');
  return {
    key: isSortKey(key) ? key : DEFAULT_SORT.key,
    order: isSortOrder(order) ? order : DEFAULT_SORT.order,
  };
}

export function nextSortState(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, order: 'asc' };
  return { key, order: current.order === 'asc' ? 'desc' : 'asc' };
}

export function rowsURL(state: SortState): string {
  const params = new URLSearchParams({ sort: state.key, order: state.order });
  return `/api/sb/rows?${params.toString()}`;
}

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

function renderRows(rowsBody: HTMLTableSectionElement, rows: SBRow[]) {
  rowsBody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement('tr');
      const service = document.createElement('td');
      const status = document.createElement('td');
      const latency = document.createElement('td');
      const updated = document.createElement('td');

      service.textContent = row.service;
      status.textContent = row.status;
      latency.textContent = `${row.latencyMS} ms`;
      updated.textContent = new Date(row.updatedAt).toLocaleString();
      tr.append(service, status, latency, updated);
      return tr;
    }),
  );
}

function renderSortIndicators(headers: NodeListOf<HTMLButtonElement>, state: SortState) {
  for (const header of headers) {
    const key = header.dataset.sortKey as SortKey;
    const th = header.closest('th');
    const indicator = header.querySelector<HTMLElement>('[data-sort-indicator]');
    const isActive = key === state.key;
    header.setAttribute('aria-pressed', String(isActive));
    th?.setAttribute(
      'aria-sort',
      isActive ? (state.order === 'asc' ? 'ascending' : 'descending') : 'none',
    );
    if (indicator) indicator.textContent = isActive ? `(${state.order})` : '';
  }
}

function replaceURLSortState(state: SortState) {
  const url = new URL(window.location.href);
  url.searchParams.set('sort', state.key);
  url.searchParams.set('order', state.order);
  window.history.replaceState(null, '', url);
}

export function initApp() {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');
  const rowsBody = byId<HTMLTableSectionElement>('rowsBody');
  const rowsStatus = byId<HTMLElement>('rowsStatus');
  const sortHeaders = document.querySelectorAll<HTMLButtonElement>('[data-sort-key]');
  let sortState = readSortState(new URLSearchParams(window.location.search));

  async function loadRows() {
    renderSortIndicators(sortHeaders, sortState);
    rowsStatus.textContent = `Loading rows sorted by ${sortState.key} ${sortState.order}`;
    const res = await fetchJSON(rowsURL(sortState));
    if (!res.ok || typeof res.data !== 'object' || res.data === null || !('rows' in res.data)) {
      rowsBody.innerHTML = '<tr><td colspan="4">Unable to load rows.</td></tr>';
      rowsStatus.textContent = 'Unable to load rows';
      return;
    }
    const { rows } = res.data as { rows: SBRow[] };
    renderRows(rowsBody, rows);
    rowsStatus.textContent = `Rows sorted by ${sortState.key} ${sortState.order}`;
  }

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

  for (const header of sortHeaders) {
    header.addEventListener('click', () => {
      sortState = nextSortState(sortState, header.dataset.sortKey as SortKey);
      replaceURLSortState(sortState);
      void loadRows();
    });
  }

  void loadRows();
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
