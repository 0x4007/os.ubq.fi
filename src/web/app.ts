/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

const TABLE_IDS = ['health', 'time', 'echo'] as const;
type TableId = (typeof TABLE_IDS)[number];

const LAST_TABLE_STORAGE_KEY = 'os.ubq.fi:lastTable';
const SIDEBAR_SCROLL_STORAGE_KEY = 'os.ubq.fi:sidebarScrollTop';

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

function isTableId(value: string | null | undefined): value is TableId {
  return TABLE_IDS.includes(value as TableId);
}

export function resolveInitialTable(urlTable: string | null, storedTable: string | null): TableId {
  if (isTableId(urlTable)) return urlTable;
  if (isTableId(storedTable)) return storedTable;
  return 'health';
}

export function parseStoredScrollTop(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function initSidebarPersistence() {
  const sidebar = byId<HTMLElement>('sidebar');
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-table-button]'));
  const panels = new Map(
    TABLE_IDS.map((tableId) => [tableId, byId<HTMLElement>(`panel-${tableId}`)]),
  );

  function activateTable(tableId: TableId, updateUrl: boolean) {
    for (const button of buttons) {
      const active = button.dataset.tableButton === tableId;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }

    for (const [panelTableId, panel] of panels) {
      panel.hidden = panelTableId !== tableId;
    }

    writeStorage(LAST_TABLE_STORAGE_KEY, tableId);

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('table', tableId);
      window.history.replaceState(null, '', url);
    }
  }

  const initialTable = resolveInitialTable(
    new URLSearchParams(window.location.search).get('table'),
    readStorage(LAST_TABLE_STORAGE_KEY),
  );

  activateTable(initialTable, false);

  requestAnimationFrame(() => {
    sidebar.scrollTop = parseStoredScrollTop(readStorage(SIDEBAR_SCROLL_STORAGE_KEY));
  });

  sidebar.addEventListener('scroll', () => {
    writeStorage(SIDEBAR_SCROLL_STORAGE_KEY, String(Math.max(0, Math.round(sidebar.scrollTop))));
  });

  for (const button of buttons) {
    button.addEventListener('click', () => {
      if (isTableId(button.dataset.tableButton)) {
        activateTable(button.dataset.tableButton, true);
      }
    });
  }
}

function initApp() {
  initSidebarPersistence();

  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');

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
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
