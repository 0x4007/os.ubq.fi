/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
export type ViewState = {
  table: string;
  offset: number;
  limit: number;
  sort: string;
  desc: boolean;
  filters: string;
  rowId: string;
};

const DEFAULT_VIEW_STATE: ViewState = {
  table: 'users',
  offset: 0,
  limit: 25,
  sort: 'created',
  desc: false,
  filters: '',
  rowId: '',
};

function readInteger(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseViewState(params: URLSearchParams): ViewState {
  return {
    table: params.get('table') || DEFAULT_VIEW_STATE.table,
    offset: readInteger(params.get('offset'), DEFAULT_VIEW_STATE.offset),
    limit: readInteger(params.get('limit'), DEFAULT_VIEW_STATE.limit),
    sort: params.get('sort') || DEFAULT_VIEW_STATE.sort,
    desc: params.get('desc') === 'true',
    filters: params.get('filters') || DEFAULT_VIEW_STATE.filters,
    rowId: params.get('rowId') || DEFAULT_VIEW_STATE.rowId,
  };
}

export function viewStateToSearch(state: ViewState): string {
  const params = new URLSearchParams();
  params.set('table', state.table);
  params.set('offset', String(state.offset));
  params.set('limit', String(state.limit));
  params.set('sort', state.sort);
  params.set('desc', String(state.desc));
  if (state.filters) params.set('filters', state.filters);
  if (state.rowId) params.set('rowId', state.rowId);
  return params.toString();
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

function viewStateFromForm(form: HTMLFormElement): ViewState {
  const data = new FormData(form);
  return {
    table: String(data.get('table') || DEFAULT_VIEW_STATE.table),
    offset: readInteger(String(data.get('offset') || ''), DEFAULT_VIEW_STATE.offset),
    limit: readInteger(String(data.get('limit') || ''), DEFAULT_VIEW_STATE.limit),
    sort: String(data.get('sort') || DEFAULT_VIEW_STATE.sort),
    desc: data.get('desc') === 'on',
    filters: String(data.get('filters') || ''),
    rowId: String(data.get('rowId') || ''),
  };
}

function applyViewState(form: HTMLFormElement, output: HTMLElement, state: ViewState) {
  byId<HTMLInputElement>('tableInput').value = state.table;
  byId<HTMLInputElement>('offsetInput').value = String(state.offset);
  byId<HTMLInputElement>('limitInput').value = String(state.limit);
  byId<HTMLInputElement>('sortInput').value = state.sort;
  byId<HTMLInputElement>('descInput').checked = state.desc;
  byId<HTMLInputElement>('filtersInput').value = state.filters;
  byId<HTMLInputElement>('rowIdInput').value = state.rowId;
  show(output, state);
  form.dataset.currentState = JSON.stringify(state);
}

function updateURL(state: ViewState, mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  url.search = viewStateToSearch(state);
  const method = mode === 'push' ? 'pushState' : 'replaceState';
  window.history[method](state, '', url);
}

export function initApp() {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');
  const viewStateForm = byId<HTMLFormElement>('viewStateForm');
  const viewStateOut = byId<HTMLPreElement>('viewStateOut');
  const initialState = parseViewState(new URLSearchParams(window.location.search));

  applyViewState(viewStateForm, viewStateOut, initialState);
  updateURL(initialState, 'replace');

  healthBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/health');
    show(healthOut, res);
  });

  timeBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/time');
    show(timeOut, res);
  });

  echoForm.addEventListener('submit', async (e: SubmitEvent) => {
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

  viewStateForm.addEventListener('input', () => {
    const nextState = viewStateFromForm(viewStateForm);
    applyViewState(viewStateForm, viewStateOut, nextState);
    updateURL(nextState, 'push');
  });

  window.addEventListener('popstate', () => {
    const state = parseViewState(new URLSearchParams(window.location.search));
    applyViewState(viewStateForm, viewStateOut, state);
  });
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
