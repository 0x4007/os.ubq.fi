/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

export type VirtualRow = {
  id: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  updated: string;
};

export type VirtualWindowInput = {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  totalRows: number;
  overscan: number;
};

export type VirtualWindow = {
  start: number;
  end: number;
  beforeHeight: number;
  afterHeight: number;
};

const VIRTUAL_ROW_HEIGHT = 44;
const VIRTUAL_ROW_COUNT = 5000;
const VIRTUAL_OVERSCAN = 6;
const STATUSES = ['open', 'triage', 'review', 'done'] as const;
const OWNERS = ['Core', 'Runtime', 'Operations', 'Design'] as const;
const PRIORITIES = ['P1', 'P2', 'P3'] as const;

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

export function createVirtualRows(count = VIRTUAL_ROW_COUNT): VirtualRow[] {
  return Array.from({ length: count }, (_, index) => {
    const rowNumber = index + 1;
    const status = STATUSES[index % STATUSES.length] ?? 'open';
    const owner = OWNERS[index % OWNERS.length] ?? 'Core';
    const priority = PRIORITIES[index % PRIORITIES.length] ?? 'P3';

    return {
      id: `row_${String(rowNumber).padStart(5, '0')}`,
      title: `Large dataset record ${rowNumber}`,
      owner,
      status,
      priority,
      updated: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
    };
  });
}

export function getVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const rowHeight = Math.max(1, input.rowHeight);
  const totalRows = Math.max(0, input.totalRows);
  const viewportHeight = Math.max(rowHeight, input.viewportHeight);
  const overscan = Math.max(0, input.overscan);
  const maxStart = Math.max(0, totalRows - 1);
  const visibleRows = Math.ceil(viewportHeight / rowHeight);
  const start = Math.min(maxStart, Math.max(0, Math.floor(input.scrollTop / rowHeight) - overscan));
  const end = Math.min(totalRows, start + visibleRows + overscan * 2);

  return {
    start,
    end,
    beforeHeight: start * rowHeight,
    afterHeight: Math.max(0, (totalRows - end) * rowHeight),
  };
}

export function toggleExpandedRow(expandedIds: ReadonlySet<string>, rowId: string): Set<string> {
  const next = new Set(expandedIds);

  if (next.has(rowId)) {
    next.delete(rowId);
  } else {
    next.add(rowId);
  }

  return next;
}

export function resolveSelectedRowId(rows: readonly VirtualRow[], selectedId?: string): string {
  if (selectedId && rows.some((row) => row.id === selectedId)) {
    return selectedId;
  }

  return rows[0]?.id ?? '';
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  return element;
}

function appendSpacer(container: HTMLElement, height: number) {
  const spacer = createElement('div');
  spacer.style.height = `${height}px`;
  container.append(spacer);
}

function initVirtualGrid() {
  const root = document.getElementById('virtualGrid');

  if (!root) {
    return;
  }

  const rows = createVirtualRows();
  let selectedId = resolveSelectedRowId(rows);
  let expandedIds = new Set<string>();
  let rafId = 0;

  const heading = createElement('h2', { text: 'Large dataset' });
  const status = createElement('p', { className: 'virtual-status' });
  const viewport = createElement('div', { className: 'virtual-viewport' });
  const list = createElement('div', { className: 'virtual-list' });
  viewport.append(list);
  root.replaceChildren(heading, status, viewport);

  function render() {
    const viewportHeight = viewport.clientHeight || 420;
    const windowState = getVirtualWindow({
      scrollTop: viewport.scrollTop,
      viewportHeight,
      rowHeight: VIRTUAL_ROW_HEIGHT,
      totalRows: rows.length,
      overscan: VIRTUAL_OVERSCAN,
    });
    const visibleRows = rows.slice(windowState.start, windowState.end);
    status.textContent = `${rows.length.toLocaleString()} rows, rendering ${windowState.start + 1}-${windowState.end}`;
    list.replaceChildren();
    appendSpacer(list, windowState.beforeHeight);

    for (const row of visibleRows) {
      const rowElement = createElement('div', {
        className: row.id === selectedId ? 'virtual-row is-selected' : 'virtual-row',
      });
      const isExpanded = expandedIds.has(row.id);
      rowElement.dataset.rowId = row.id;
      rowElement.setAttribute('aria-selected', String(row.id === selectedId));

      const selectButton = createElement('button', { className: 'virtual-cell virtual-title' });
      selectButton.type = 'button';
      selectButton.dataset.rowId = row.id;
      selectButton.textContent = row.title;
      selectButton.addEventListener('click', () => {
        selectedId = row.id;
        render();
      });

      const owner = createElement('span', { className: 'virtual-cell', text: row.owner });
      const statusCell = createElement('span', { className: 'virtual-cell', text: row.status });
      const priority = createElement('span', { className: 'virtual-cell', text: row.priority });
      const updated = createElement('span', { className: 'virtual-cell', text: row.updated });
      const expandButton = createElement('button', {
        className: 'virtual-expand',
        text: isExpanded ? 'Collapse' : 'Expand',
      });
      expandButton.type = 'button';
      expandButton.dataset.expandId = row.id;
      expandButton.setAttribute('aria-expanded', String(isExpanded));
      expandButton.addEventListener('click', () => {
        expandedIds = toggleExpandedRow(expandedIds, row.id);
        selectedId = row.id;
        render();
      });

      rowElement.append(selectButton, owner, statusCell, priority, updated, expandButton);
      list.append(rowElement);
    }

    appendSpacer(list, windowState.afterHeight);
  }

  viewport.addEventListener('scroll', () => {
    if (rafId) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  });

  render();
}

function initApiExamples() {
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
  window.addEventListener('DOMContentLoaded', () => {
    initApiExamples();
    initVirtualGrid();
  });
}
