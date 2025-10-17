type FetchJSONResult = { ok: boolean; status: number; data: unknown };

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

// Global navigation hook type
declare global {
  interface Window {
    osubq_nav?: (t: string, f: string) => void;
  }
}

// --- URL + localStorage helpers ---
function parseURLState(): {
  table: string;
  limit: number | null;
  offset: number | null;
  filter: string | null; // legacy single filter
  filters: string[]; // semicolon-delimited list in URL
  sort: string | null;
  desc: boolean;
  rowId: string | null;
} {
  const url = new URL(location.href);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const filtersRaw = url.searchParams.get('filters') ?? '';
  const list = filtersRaw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    table: url.searchParams.get('table') ?? '',
    limit: limit ? Number.parseInt(limit) : null,
    offset: offset ? Number.parseInt(offset) : null,
    filter: url.searchParams.get('filter'),
    filters: list,
    sort: url.searchParams.get('sort'),
    desc: (url.searchParams.get('desc') ?? 'false').toLowerCase() === 'true',
    rowId: url.searchParams.get('rowId'),
  };
}

function buildURL(
  table: string,
  limit: number,
  offset: number,
  filter: string | null, // legacy single filter
  rowId: string | null,
  sort: string | null,
  desc: boolean,
  filters: string[],
): string {
  const u = new URL(location.pathname, location.origin);
  if (table) u.searchParams.set('table', table);
  if (limit) u.searchParams.set('limit', String(limit));
  if (offset) u.searchParams.set('offset', String(offset));
  if (filter) u.searchParams.set('filter', filter);
  if (filters && filters.length > 0) u.searchParams.set('filters', filters.join(';'));
  if (sort) u.searchParams.set('sort', sort);
  if (desc) u.searchParams.set('desc', String(!!desc));
  if (rowId) u.searchParams.set('rowId', rowId);
  return u.toString();
}

function lsGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme preference early
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch {
    // ignore
  }
  // Diagnostics
  const healthBtn = document.getElementById('checkHealth') as HTMLButtonElement | null;
  const healthOut = document.getElementById('healthOut') as HTMLPreElement | null;
  const timeBtn = document.getElementById('getTime') as HTMLButtonElement | null;
  const timeOut = document.getElementById('timeOut') as HTMLPreElement | null;
  const echoForm = document.getElementById('echoForm') as HTMLFormElement | null;
  const echoInput = document.getElementById('echoInput') as HTMLTextAreaElement | null;
  const echoOut = document.getElementById('echoOut') as HTMLPreElement | null;
  const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement | null;

  // Dashboard elements
  const opts = {
    tableList: byId<HTMLUListElement>('tableList'),
    tableSearch: byId<HTMLInputElement>('tableSearch'),
    tableTitle: byId<HTMLHeadingElement>('tableTitle'),
    tableSubtitle: byId<HTMLDivElement>('tableSubtitle'),
    filterChips: byId<HTMLDivElement>('filterChips'),
    pageSizeSel: byId<HTMLSelectElement>('pageSize'),
    prevPageBtn: byId<HTMLButtonElement>('prevPage'),
    nextPageBtn: byId<HTMLButtonElement>('nextPage'),
    exportCsvBtn: byId<HTMLButtonElement>('exportCsv'),
    exportJsonBtn: byId<HTMLButtonElement>('exportJson'),
    grid: byId<HTMLTableElement>('sbGrid'),
    summaryEl: byId<HTMLDivElement>('summaryBar'),
    inspectorTitle: byId<HTMLHeadingElement>('inspectorTitle'),
    objectSummary: byId<HTMLDivElement>('objectSummary'),
    relatedOutbound: byId<HTMLDivElement>('relatedOutbound'),
    relatedInbound: byId<HTMLDivElement>('relatedInbound'),
  };
  createDashboard(opts);

  // Sidebar search: clear button
  try {
    const clearBtn = document.getElementById('clearTableSearch') as HTMLButtonElement | null;
    if (clearBtn && opts.tableSearch) {
      const syncClearVis = () => {
        clearBtn.classList.toggle('hidden', opts.tableSearch.value.trim() === '');
      };
      syncClearVis();
      opts.tableSearch.addEventListener('input', syncClearVis);
      clearBtn.addEventListener('click', () => {
        opts.tableSearch.value = '';
        opts.tableSearch.dispatchEvent(new Event('input'));
      });
    }
  } catch { /* ignore */ }

  // Saved Views wiring (sidebar)
  const viewList = document.getElementById('viewList') as HTMLUListElement | null;
  const saveViewBtn = document.getElementById('saveViewBtn') as HTMLButtonElement | null;
  const applyFirstViewBtn = document.getElementById(
    'applyFirstViewBtn',
  ) as HTMLButtonElement | null;
  if (viewList && saveViewBtn) {
    const VIEWS_INDEX_KEY = 'views:index';
    const keyFor = (name: string) => `views:${name}`;
    const loadIndex = (): string[] => {
      try {
        const raw = localStorage.getItem(VIEWS_INDEX_KEY);
        const arr = raw ? (JSON.parse(raw) as string[]) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const saveIndex = (names: string[]) => {
      try {
        localStorage.setItem(VIEWS_INDEX_KEY, JSON.stringify(Array.from(new Set(names))));
      } catch {
        /* ignore */
      }
    };
    const saveView = (name: string, url: string) => {
      try {
        localStorage.setItem(keyFor(name), url);
        const idx = loadIndex();
        if (!idx.includes(name)) idx.push(name);
        saveIndex(idx);
      } catch {
        /* ignore */
      }
    };
    const loadView = (name: string): string | null => {
      try {
        return localStorage.getItem(keyFor(name));
      } catch {
        return null;
      }
    };
    const removeView = (name: string) => {
      try {
        localStorage.removeItem(keyFor(name));
        const idx = loadIndex().filter((n) => n !== name);
        saveIndex(idx);
      } catch {
        /* ignore */
      }
    };
    const renderList = () => {
      viewList.innerHTML = '';
      const names = loadIndex();
      for (const n of names) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = n;
        label.style.marginRight = '0.5rem';
        const apply = document.createElement('button');
        apply.textContent = 'Apply';
        apply.addEventListener('click', (e) => {
          e.stopPropagation();
          const u = loadView(n);
          if (!u) return;
          try {
            history.pushState({}, '', u);
            window.dispatchEvent(new PopStateEvent('popstate'));
          } catch {
            location.href = u;
          }
        });
        const del = document.createElement('button');
        del.textContent = 'Remove';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          removeView(n);
          renderList();
        });
        li.appendChild(label);
        li.appendChild(apply);
        li.appendChild(del);
        viewList.appendChild(li);
      }
    };
    renderList();
    saveViewBtn.addEventListener('click', () => {
      const name = prompt('Save current view as…');
      if (!name) return;
      saveView(name.trim(), location.href);
      renderList();
    });
    if (applyFirstViewBtn) {
      applyFirstViewBtn.addEventListener('click', () => {
        const names = loadIndex();
        if (names.length === 0) return;
        const u = loadView(names[0]!);
        if (!u) return;
        try {
          history.pushState({}, '', u);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch {
          location.href = u;
        }
      });
    }
  }

  // Theme toggle
  if (themeToggle) {
    const setIcon = () => {
      const mode = document.documentElement.getAttribute('data-theme');
      // icon reflects current theme
      themeToggle.textContent = mode === 'light' ? '🌞' : '🌙';
      themeToggle.setAttribute('aria-pressed', mode === 'light' ? 'true' : 'false');
      themeToggle.title = 'Toggle theme';
    };
    setIcon();
    themeToggle.addEventListener('click', () => {
      const el = document.documentElement;
      const isLight = el.getAttribute('data-theme') === 'light';
      const next = isLight ? '' : 'light';
      if (next) el.setAttribute('data-theme', next);
      else el.removeAttribute('data-theme');
      try {
        localStorage.setItem('theme', next || 'dark');
      } catch {
        /* ignore */
      }
      setIcon();
    });
  }

  // Wire diagnostics if visible
  if (healthBtn && healthOut) {
    healthBtn.addEventListener('click', async () => {
      const res = await fetchJSON('/api/health');
      show(healthOut, res);
    });
  }
  if (timeBtn && timeOut) {
    timeBtn.addEventListener('click', async () => {
      const res = await fetchJSON('/api/time');
      show(timeOut, res);
    });
  }
  if (echoForm && echoInput && echoOut) {
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
});

type DashboardOpts = {
  tableList: HTMLUListElement;
  tableSearch: HTMLInputElement;
  tableTitle: HTMLHeadingElement;
  tableSubtitle: HTMLDivElement;
  filterChips: HTMLDivElement;
  pageSizeSel: HTMLSelectElement;
  prevPageBtn: HTMLButtonElement;
  nextPageBtn: HTMLButtonElement;
  exportCsvBtn: HTMLButtonElement;
  exportJsonBtn: HTMLButtonElement;
  grid: HTMLTableElement;
  summaryEl: HTMLDivElement;
  inspectorTitle: HTMLHeadingElement;
  objectSummary: HTMLDivElement;
  relatedOutbound: HTMLDivElement;
  relatedInbound: HTMLDivElement;
};

function createDashboard(opts: DashboardOpts) {
  const state = {
    table: '',
    limit: 50,
    offset: 0,
    filter: null as string | null, // legacy single filter support
    filters: [] as string[], // multiple filters as col.op.val
    sort: null as string | null,
    desc: false,
    rowId: null as string | null,
    total: 0 as number | null,
    tables: [] as string[], // visible (non-empty) tables
    allTables: [] as string[],
    lastRows: [] as Record<string, unknown>[],
    lastCols: [] as string[],
    relationsByColumn: new Map<string, string>(), // fromColumn -> toTable
    selectedIndex: -1,
    expandedIds: new Set<string>(),
  };

  async function init() {
    // Restore URL-driven state early
    restoreFromURL();
    const res = await fetchJSON('/api/sb/tables');
    if (!res.ok) {
      opts.tableSubtitle.textContent = `Failed to load tables: ${res.status}`;
      return;
    }
    type TablesResponse = { tables: string[] };
    state.allTables = (res.data as TablesResponse).tables;
    // Filter out empty tables dynamically
    const nonEmpty = await filterNonEmptyTables(state.allTables);
    state.tables = nonEmpty;
    renderTableList();

    // Pick initial table: URL > localStorage(lastTable)
    const pref =
      state.table || (typeof lsGet('lastTable') === 'string' ? (lsGet('lastTable') as string) : '');
    if (pref && state.tables.includes(pref)) await selectTable(pref);
    // Restore sidebar scroll position
    const st = Number.parseInt(String(lsGet('sidebarScroll') ?? '0'));
    if (Number.isFinite(st)) opts.tableList.scrollTop = st;
  }

  async function filterNonEmptyTables(tables: string[]): Promise<string[]> {
    const checks = await Promise.all(
      tables.map(async (t) => ({ t, nonEmpty: await isNonEmptyTable(t) })),
    );
    return checks.filter((c) => c.nonEmpty).map((c) => c.t);
  }

  async function isNonEmptyTable(t: string): Promise<boolean> {
    try {
      const res = await fetchJSON(`/api/sb/rows?table=${encodeURIComponent(t)}&limit=1`);
      if (!res.ok) return true; // be permissive on failure
      const data = res.data as { total?: number | null; rows?: unknown[] };
      if (typeof data.total === 'number') return data.total > 0;
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return rows.length > 0;
    } catch {
      return true;
    }
  }

  function renderTableList() {
    const q = opts.tableSearch.value.trim().toLowerCase();
    opts.tableList.innerHTML = '';
    const filtered = state.tables.filter((t) => t.toLowerCase().includes(q));
    for (const t of filtered) {
      const li = document.createElement('li');
      li.textContent = t;
      if (t === state.table) li.classList.add('active');
      li.addEventListener('click', () => selectTable(t));
      opts.tableList.appendChild(li);
    }
  }

  async function selectTable(t: string) {
    state.table = t;
    state.offset = 0;
    state.filter = null;
    opts.tableTitle.textContent = t;
    opts.tableSubtitle.textContent = '';
    opts.inspectorTitle.textContent = 'Object';
    opts.objectSummary.textContent = '(select a row)';
    opts.objectSummary.classList.add('muted', 'empty');
    opts.relatedOutbound.innerHTML = '';
    opts.relatedInbound.innerHTML = '';
    renderTableList();
    lsSet('lastTable', t);
    pushURL();
    // load relations mapping for this table (fromColumn -> toTable)
    state.relationsByColumn.clear();
    try {
      const r = await fetchJSON(`/api/sb/relations?table=${encodeURIComponent(state.table)}`);
      if (r.ok) {
        const rel = r.data as { outbound: { fromColumn: string; toTable: string }[] };
        for (const o of rel.outbound) state.relationsByColumn.set(o.fromColumn, o.toTable);
      }
    } catch {
      // ignore relation load error; grid will degrade to raw values
    }
    await loadPage({ reset: true });
  }

  async function loadPage({ reset = false }: { reset?: boolean } = {}) {
    if (!state.table) return;
    if (reset) state.offset = 0;
    setBusy(true);
    try {
      const url = new URL('/api/sb/rows', location.origin);
      url.searchParams.set('table', state.table);
      url.searchParams.set('limit', String(state.limit));
      url.searchParams.set('offset', String(state.offset));
      // sorting
      if (state.sort) url.searchParams.set('order', state.sort);
      url.searchParams.set('desc', String(!!state.desc));
      // filters: map from URL state to repeated server params
      const list = Array.isArray(state.filters) ? state.filters : [];
      for (const f of list) url.searchParams.append('filter', f);
      if (state.filter) url.searchParams.append('filter', state.filter);
      const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const rows = (data.rows ?? []) as Record<string, unknown>[];
      state.total = typeof data.total === 'number' ? (data.total as number) : null;
      const cols = deriveColumns(rows);
      state.lastRows = rows;
      state.lastCols = cols;
      renderGrid(
        opts.grid,
        cols,
        rows,
        (row, idx) => onRowClick(row, idx),
        state.table,
        state.relationsByColumn,
        state.sort,
        state.desc,
        (col) => onSortColumn(col),
        state.selectedIndex,
      );
      // Refresh filters UI since available columns may change per table
      renderFilterUI();
      // Update lightweight summary/insights
      renderSummary(opts.summaryEl, state.table, cols, rows);
      const rn = rows.length;
      const range = rn > 0 ? `${state.offset + 1}–${state.offset + rn}` : '0';
      const total = state.total != null ? ` of ${state.total}` : '';
      opts.tableSubtitle.textContent = `${state.table}: ${range}${total}`;
      opts.prevPageBtn.disabled = state.offset === 0;
      opts.nextPageBtn.disabled =
        state.total != null ? state.offset + rn >= state.total : rn < state.limit;

      // Auto-select the first row or rowId from deep link
      if (rows.length > 0) {
        let idx = 0;
        if (state.rowId) {
          const found = rows.findIndex(
            (r) => String((r as Record<string, unknown>)['id']) === state.rowId,
          );
          if (found >= 0) idx = found;
        }
        state.selectedIndex = idx;
        await onRowClick(rows[idx], idx);
      } else {
        // Clear inspector if no rows
        opts.inspectorTitle.textContent = `${state.table} · Object`;
        opts.objectSummary.classList.add('muted');
        opts.objectSummary.textContent = '(no rows)';
        opts.relatedOutbound.innerHTML = '';
        opts.relatedInbound.innerHTML = '';
      }
    } catch (err) {
      opts.tableSubtitle.textContent = `Query error: ${String(err)}`;
      opts.grid.innerHTML = '';
    } finally {
      setBusy(false);
    }
  }

  function setBusy(b: boolean) {
    const container = opts.grid.parentElement as HTMLElement | null;
    if (container) container.classList.toggle('loading', b);
    opts.prevPageBtn.disabled = b || state.offset === 0;
  }

  opts.prevPageBtn.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - state.limit);
    pushURL(true);
    void loadPage();
  });
  opts.nextPageBtn.addEventListener('click', () => {
    state.offset += state.limit;
    pushURL(true);
    void loadPage();
  });
  opts.pageSizeSel.addEventListener('change', () => {
    const v = Number.parseInt(opts.pageSizeSel.value);
    if (Number.isFinite(v)) state.limit = v;
    state.offset = 0;
    pushURL(true);
    void loadPage({ reset: true });
  });
  opts.tableSearch.addEventListener('input', renderTableList);
  opts.tableList.addEventListener('scroll', () => {
    lsSet('sidebarScroll', opts.tableList.scrollTop);
  });

  // Wire exports (CSV/JSON) from current in-memory slice
  opts.exportCsvBtn.addEventListener('click', () => {
    const cols = state.lastCols.filter((c) => c !== 'id');
    const csv = toCSV(cols, state.lastRows);
    const range = state.lastRows.length
      ? `${String(state.offset + 1).padStart(3, '0')}-${String(state.offset + state.lastRows.length).padStart(3, '0')}`
      : 'empty';
    const fname = sanitizeFilename(`${state.table || 'data'}_${range}.csv`);
    downloadText(fname, 'text/csv', csv);
  });
  opts.exportJsonBtn.addEventListener('click', () => {
    const payload = {
      columns: state.lastCols.filter((c) => c !== 'id'),
      rows: state.lastRows,
      meta: { table: state.table, limit: state.limit, offset: state.offset, total: state.total },
    };
    const range = state.lastRows.length
      ? `${String(state.offset + 1).padStart(3, '0')}-${String(state.offset + state.lastRows.length).padStart(3, '0')}`
      : 'empty';
    const fname = sanitizeFilename(`${state.table || 'data'}_${range}.json`);
    downloadText(fname, 'application/json', JSON.stringify(payload, null, 2));
  });

  void init();

  // --- URL state ---
  function pushURL(push = false) {
    const url = buildURL(
      state.table,
      state.limit,
      state.offset,
      state.filter,
      state.rowId,
      state.sort,
      state.desc,
      state.filters,
    );
    if (push) history.pushState({}, '', url);
    else history.replaceState({}, '', url);
  }
  function restoreFromURL() {
    const u = parseURLState();
    if (u.table) state.table = u.table;
    if (Number.isFinite(u.limit ?? NaN) && u.limit) state.limit = u.limit;
    if (Number.isFinite(u.offset ?? NaN) && u.offset) state.offset = u.offset;
    state.filter = u.filter;
    state.filters = u.filters && u.filters.length > 0 ? u.filters : u.filter ? [u.filter] : [];
    state.sort = u.sort;
    state.desc = u.desc;
    state.rowId = u.rowId;
    // reflect page size UI
    const v = String(state.limit);
    if (Array.from(opts.pageSizeSel.options).some((o) => o.value === v)) {
      opts.pageSizeSel.value = v;
    }
  }

  window.addEventListener('popstate', () => {
    restoreFromURL();
    if (state.table) void selectTable(state.table);
  });

  // Keyboard navigation on grid (ArrowUp/Down, Enter to toggle)
  opts.grid.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter') return;
    if (!state.lastRows || state.lastRows.length === 0) return;
    if (key === 'ArrowDown') {
      e.preventDefault();
      state.selectedIndex = Math.min(state.lastRows.length - 1, Math.max(0, (state.selectedIndex ?? 0) + 1));
      highlightSelectedRow();
      scrollToSelected();
      const row = state.lastRows[state.selectedIndex]!;
      void onRowClick(row, state.selectedIndex);
      return;
    }
    if (key === 'ArrowUp') {
      e.preventDefault();
      state.selectedIndex = Math.max(0, (state.selectedIndex ?? 0) - 1);
      highlightSelectedRow();
      scrollToSelected();
      const row = state.lastRows[state.selectedIndex]!;
      void onRowClick(row, state.selectedIndex);
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      toggleSelectedExpander();
      return;
    }
  });

  function highlightSelectedRow() {
    const rowsEls = opts.grid.querySelectorAll('tbody tr.row-click');
    rowsEls.forEach((tr) => {
      tr.classList.remove('selected');
      tr.removeAttribute('aria-selected');
    });
    const sel = opts.grid.querySelector(`tbody tr.row-click[data-index="${state.selectedIndex}"]`) as HTMLTableRowElement | null;
    if (sel) {
      sel.classList.add('selected');
      sel.setAttribute('aria-selected', 'true');
    }
  }

  function scrollToSelected() {
    const api = opts.grid as unknown as { __scrollToRow?: (i: number) => void };
    api.__scrollToRow?.(state.selectedIndex ?? 0);
  }

  function toggleSelectedExpander() {
    const tr = opts.grid.querySelector(`tbody tr.row-click[data-index="${state.selectedIndex}"]`) as HTMLTableRowElement | null;
    if (!tr) return;
    const btn = tr.querySelector('button.expand-toggle') as HTMLButtonElement | null;
    if (btn) btn.click();
  }

  // Drill-through navigation helper
  async function navigateTo(table: string, filter: string) {
    state.table = table;
    state.filter = filter; // legacy for compatibility
    state.filters = [filter];
    state.offset = 0;
    state.rowId = null;
    pushURL(true);
    // reload relations then page
    state.relationsByColumn.clear();
    try {
      const r = await fetchJSON(`/api/sb/relations?table=${encodeURIComponent(state.table)}`);
      if (r.ok) {
        const rel = r.data as { outbound: { fromColumn: string; toTable: string }[] };
        for (const o of rel.outbound) state.relationsByColumn.set(o.fromColumn, o.toTable);
      }
    } catch {
      // ignore
    }
    await loadPage({ reset: true });
  }

  // Expose a tiny hook for cell drill-through without tight coupling
  window.osubq_nav = (t, f) => {
    void navigateTo(t, f);
  };

  function onSortColumn(col: string) {
    if (state.sort === col) state.desc = !state.desc;
    else {
      state.sort = col;
      state.desc = false;
    }
    pushURL(true);
    void loadPage();
  }

  function renderFilterUI() {
    const host = opts.filterChips;
    host.innerHTML = '';
    // Builder controls
    const builder = document.createElement('div');
    builder.className = 'filter-builder';
    const colSel = document.createElement('select');
    const opSel = document.createElement('select');
    const valInput = document.createElement('input');
    valInput.placeholder = 'value';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Filter';
    // populate columns
    for (const c of state.lastCols) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      colSel.appendChild(opt);
    }
    // operators
    for (const op of ['eq', 'ilike']) {
      const o = document.createElement('option');
      o.value = op;
      o.textContent = op;
      opSel.appendChild(o);
    }
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const col = colSel.value;
      const op = opSel.value;
      const val = valInput.value.trim();
      if (!col || !op || !val) return;
      const f = `${col}.${op}.${val}`;
      if (!state.filters.includes(f)) state.filters.push(f);
      state.offset = 0;
      pushURL(true);
      void loadPage({ reset: true });
    });
    builder.appendChild(colSel);
    builder.appendChild(opSel);
    builder.appendChild(valInput);
    builder.appendChild(addBtn);

    host.appendChild(builder);

    // Chips
    for (const f of state.filters) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const [col, op, ...rest] = f.split('.');
      const val = rest.join('.') || '';
      chip.textContent = `${col} ${op} ${val}`;
      const x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', `Remove filter ${col} ${op} ${val}`);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        state.filters = state.filters.filter((it) => it !== f);
        state.offset = 0;
        pushURL(true);
        void loadPage({ reset: true });
      });
      chip.appendChild(x);
      host.appendChild(chip);
    }
  }

  async function onRowClick(row: Record<string, unknown>, _idx: number) {
    // Update selection index and reflect in grid
    state.selectedIndex = _idx;
    try { highlightSelectedRow(); scrollToSelected(); } catch { /* ignore */ }
    opts.inspectorTitle.textContent = `${state.table} · Object`;
    const summary = renderKeyValues(row);
    opts.objectSummary.classList.remove('muted', 'empty');
    opts.objectSummary.innerHTML = '';
    opts.objectSummary.appendChild(summary);
    // Enrich values: replace IDs with labels/objects
    void enrichGitHubInKV(summary, row, state.table);
    void enrichForeignInKV(summary, row, state.table, state.relationsByColumn);

    const val = row['id'];
    opts.relatedOutbound.innerHTML = '';
    opts.relatedInbound.innerHTML = '';
    opts.relatedOutbound.classList.remove('empty');
    opts.relatedInbound.classList.remove('empty');
    opts.relatedOutbound.textContent = 'Loading…';
    opts.relatedInbound.textContent = 'Loading…';
    if (val == null) {
      opts.relatedOutbound.textContent = '(row has no id field)';
      return;
    }
    // If viewing a user, include @login in title
    if (state.table === 'users' && typeof val === 'number') {
      const brief = await fetchGitHubUserBrief(val);
      if (brief) opts.inspectorTitle.textContent = `${state.table} · ${brief.login}`;
    }
    const idStr = String(val);
    const outbound = await fetchJSON(
      `/api/sb/outbound?table=${encodeURIComponent(state.table)}&id=${encodeURIComponent(idStr)}`,
    );
    if (outbound.ok) {
      type OutboundRef = { column: string; toTable: string; row: Record<string, unknown> | null };
      type OutboundResp = { refs: OutboundRef[] };
      const refs = (outbound.data as OutboundResp).refs;
      for (const r of refs) {
        const card = document.createElement('div');
        card.className = 'card';
        const title = friendlyLabel(r.column, r.toTable);
        card.innerHTML = `<div class="muted">${title}</div>`;
        if (r.row) {
          const kv = renderKeyValues(r.row);
          card.appendChild(kv);
          void enrichGitHubInKV(kv, r.row, r.toTable);
          // Drill-through: clicking navigates to referenced table filtered by id
          const refId = (r.row as Record<string, unknown>)['id'];
          if (refId != null) {
            card.style.cursor = 'pointer';
            card.title = `Open ${r.toTable} where id = ${String(refId)}`;
            card.addEventListener('click', (e) => {
              e.stopPropagation();
              void navigateTo(r.toTable, `id.eq.${encodeURIComponent(String(refId))}`);
            });
          }
        } else card.innerHTML += '<div class="muted">(none)</div>';
        opts.relatedOutbound.appendChild(card);
      }
      if (refs.length === 0) { opts.relatedOutbound.textContent = '(none)'; opts.relatedOutbound.classList.add('empty'); }
    } else {
      opts.relatedOutbound.textContent = `Failed: ${outbound.status}`;
    }

    const inbound = await fetchJSON(
      `/api/sb/inbound?table=${encodeURIComponent(state.table)}&id=${encodeURIComponent(idStr)}&limit=5`,
    );
    if (inbound.ok) {
      type InRef = {
        fromTable: string;
        fromColumn: string;
        rows: Record<string, unknown>[];
        total: number | null;
      };
      type InboundRefsResp = { refs: InRef[] };
      const refs = (inbound.data as InboundRefsResp).refs;
      for (const r of refs) {
        const card = document.createElement('div');
        card.className = 'card';
        const header = document.createElement('div');
        header.className = 'muted';
        header.textContent = `${r.fromTable}.${r.fromColumn} (${r.total ?? 0})`;
        card.appendChild(header);
        if (r.rows && r.rows.length > 0) card.appendChild(renderMiniTable(r.rows));
        // Drill-through: clicking navigates to source table filtered by FK = current id
        card.style.cursor = 'pointer';
        card.title = `Open ${r.fromTable} where ${r.fromColumn} = ${idStr}`;
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          void navigateTo(r.fromTable, `${r.fromColumn}.eq.${encodeURIComponent(idStr)}`);
        });
        opts.relatedInbound.appendChild(card);
      }
      if (refs.length === 0) { opts.relatedInbound.textContent = '(none)'; opts.relatedInbound.classList.add('empty'); }
    } else {
      opts.relatedInbound.textContent = `Failed: ${inbound.status}`;
    }
  }
}

// --- Export helpers & lightweight insights ---

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function toCSV(cols: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown): string => {
    let s: string;
    if (v == null) s = '';
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      s = String(v);
    else s = safeJSONStringify(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.join(',');
  const body = rows
    .map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))
    .join('\n');
  return body ? header + '\n' + body : header + '\n';
}

function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeJSONStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function renderSummary(
  container: HTMLElement,
  table: string,
  cols: string[],
  rows: Record<string, unknown>[],
) {
  if (!container) return;
  if (!rows || rows.length === 0) {
    container.textContent = '';
    return;
  }
  // Choose a categorical column to summarize
  const preferred = ['node_type', 'status', 'type'];
  let col = preferred.find((c) => cols.includes(c)) ?? '';
  if (!col) {
    for (const c of cols) {
      if (c.endsWith('_id')) continue;
      const vals = rows.map((r) => r[c]).filter((v) => v != null);
      const strVals = vals.map((v) => String(v));
      const uniq = new Set(strVals);
      if (uniq.size > 1 && uniq.size <= 10) {
        col = c;
        break;
      }
    }
  }
  const total = rows.length;
  let html = `<span class="muted">${table || 'Rows'}: ${total}</span>`;
  if (col) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r[col] ?? '');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    html += '<div class="bars">';
    for (const [k, n] of counts.entries()) {
      const pct = Math.round((n / max) * 100);
      html += `<div class="bar"><span>${k || '(none)'}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span><span>${n}</span></div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function deriveColumns(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  ).sort((a, b) => a.localeCompare(b));
  // Never show raw primary IDs in the grid
  return cols.filter((c) => c !== 'id');
}

function renderGrid(
  tableEl: HTMLTableElement,
  cols: string[],
  rows: Record<string, unknown>[],
  onRowClick: (row: Record<string, unknown>, idx: number) => void,
  tableName?: string,
  relations?: Map<string, string>,
  currentSort?: string | null,
  currentDesc?: boolean,
  onSort?: (col: string) => void,
  selectedIndex?: number,
) {
  tableEl.innerHTML = '';
  if (rows.length === 0) return;

  // Determine numeric columns for alignment (ignore *_id)
  const numericCols = new Set<string>();
  const sampleN = Math.min(rows.length, 100);
  for (const c of cols) {
    if (c.endsWith('_id') || c === 'id') continue;
    let seen = 0, numeric = 0;
    for (let i = 0; i < sampleN; i++) {
      const v = rows[i]?.[c];
      if (v == null) continue;
      seen++;
      if (typeof v === 'number' && Number.isFinite(v)) numeric++;
      else if (typeof v === 'string') {
        const s = v.trim();
        if (s !== '' && !Number.isNaN(Number(s))) numeric++;
      }
    }
    if (seen > 0 && numeric / seen >= 0.8) numericCols.add(c);
  }

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  // Expander column header
  const thExp = document.createElement('th');
  thExp.setAttribute('role', 'columnheader');
  thExp.textContent = '';
  thExp.style.width = '24px';
  trh.appendChild(thExp);
  for (const c of cols) {
    const th = document.createElement('th');
    const label = c.endsWith('_id') ? friendlyLabel(c, '') : c;
    const isSorted = currentSort === c;
    th.classList.add('sortable');
    th.setAttribute('role', 'columnheader');
    th.setAttribute('scope', 'col');
    th.setAttribute('aria-sort', isSorted ? (currentDesc ? 'descending' : 'ascending') : 'none');

    const sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = 'th-btn';
    sortBtn.title = `Sort by ${label}`;
    sortBtn.innerHTML = `${label}<span class="sort-icon" aria-hidden="true">${isSorted ? (currentDesc ? '▾' : '▴') : ''}</span>`;
    if (numericCols.has(c)) th.classList.add('num');
    if (onSort) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSort(c);
      });
      sortBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(c);
        }
      });
    }
    th.appendChild(sortBtn);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  tableEl.appendChild(tbody);

  // --- Virtualized rendering ---
  const container = tableEl.closest('.table-container') as HTMLElement | null;
  if (container && !(container as any)._scrollInit) {
    container.addEventListener('scroll', () => {
      container.classList.toggle('scrolled', container.scrollTop > 0);
    });
    (container as any)._scrollInit = true;
  }
  const useVirt = rows.length > 200 && !!container;
  const getRowH = (): number => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--row-h').trim();
    const n = Number.parseFloat(v || '32');
    return Number.isFinite(n) ? n : 32;
  };
  const rowH = getRowH();
  const buffer = 6;

  const renderSlice = (startIdx: number) => {
    const start = Math.max(0, Math.min(rows.length - 1, startIdx | 0));
    const viewportH = container ? container.clientHeight : rowH * rows.length;
    const visible = Math.max(1, Math.ceil(viewportH / rowH) + buffer);
    const end = Math.min(rows.length, start + visible);
    tbody.innerHTML = '';
    // Top spacer
    if (useVirt && start > 0) {
      const t = document.createElement('tr');
      t.className = 'v-spacer';
      const td = document.createElement('td');
      td.colSpan = cols.length + 1;
      td.style.height = `${start * rowH}px`;
      t.appendChild(td);
      tbody.appendChild(t);
    }
    for (let i = start; i < end; i++) {
      const r = rows[i]!;
      const tr = document.createElement('tr');
      tr.className = 'row-click';
      tr.setAttribute('role', 'row');
      if (selectedIndex != null && i === selectedIndex) {
        tr.classList.add('selected');
        tr.setAttribute('aria-selected', 'true');
      }
      tr.dataset.index = String(i);
      tr.addEventListener('click', () => onRowClick(r, i));
      // Expander cell
      const tdExp = document.createElement('td');
      tdExp.className = 'expander-cell';
      tdExp.setAttribute('role', 'gridcell');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'expand-toggle';
      btn.setAttribute('aria-label', 'Toggle related');
      btn.setAttribute('aria-expanded', 'false');
      const panelId = `exp-${tableName || 't'}-${i}`;
      btn.setAttribute('aria-controls', panelId);
      btn.textContent = '▶';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (btn.dataset.expanded === 'true') {
          // collapse
          const next = tr.nextElementSibling as HTMLTableRowElement | null;
          if (next && next.classList.contains('expand-row')) {
            next.remove();
          }
          btn.textContent = '▶';
          btn.dataset.expanded = 'false';
          btn.setAttribute('aria-expanded', 'false');
          return;
        }
        // expand
        btn.textContent = '▼';
        btn.dataset.expanded = 'true';
        btn.setAttribute('aria-expanded', 'true');
        const expandTr = document.createElement('tr');
        expandTr.id = panelId;
        expandTr.className = 'expand-row';
        const td = document.createElement('td');
        td.colSpan = cols.length + 1; // expander + all data columns
        const wrap = document.createElement('div');
        wrap.className = 'expand-wrap';
        const outCard = document.createElement('div');
        outCard.className = 'card';
        outCard.innerHTML = '<div class="muted">Related</div><div class="rel-out"></div>';
        const inCard = document.createElement('div');
        inCard.className = 'card';
        inCard.innerHTML = '<div class="muted">Referenced By</div><div class="rel-in"></div>';
        wrap.appendChild(outCard);
        wrap.appendChild(inCard);
        td.appendChild(wrap);
        expandTr.appendChild(td);
        tr.insertAdjacentElement('afterend', expandTr);

        const idVal = (r as Record<string, unknown>)['id'];
        const outEl = outCard.querySelector('.rel-out') as HTMLDivElement;
        const inEl = inCard.querySelector('.rel-in') as HTMLDivElement;
        if (idVal == null) {
          outEl.textContent = '(row has no id)';
          inEl.textContent = '';
          return;
        }
        // fetch related
        if (!tableName) {
          outEl.textContent = '(missing table context)';
          inEl.textContent = '';
          return;
        }
        void (async () => {
          outEl.textContent = 'Loading…';
          inEl.textContent = 'Loading…';
          const idStr = String(idVal);
          try {
            const ob = await fetchJSON(
              `/api/sb/outbound?table=${encodeURIComponent(tableName)}&id=${encodeURIComponent(idStr)}`,
            );
            if (ob.ok) {
              outEl.innerHTML = '';
              type OutboundRef = {
                column: string;
                toTable: string;
                row: Record<string, unknown> | null;
              };
              const refs = (ob.data as { refs: OutboundRef[] }).refs;
              for (const r2 of refs) {
                const card = document.createElement('div');
                card.className = 'card';
                const title = friendlyLabel(r2.column, r2.toTable);
                card.innerHTML = `<div class=\"muted\">${title}</div>`;
                if (r2.row) {
                  const kv = renderKeyValues(r2.row);
                  card.appendChild(kv);
                  void enrichGitHubInKV(kv, r2.row, r2.toTable);
                  try {
                    const map = await loadRelationsMap(r2.toTable);
                    void enrichForeignInKV(kv, r2.row, r2.toTable, map);
                  } catch {
                    // noop
                  }
                } else card.innerHTML += '<div class="muted">(none)</div>';
                outEl.appendChild(card);
              }
              if (refs.length === 0) outEl.textContent = '(none)';
            } else {
              outEl.textContent = `Failed: ${ob.status}`;
            }
          } catch (err) {
            outEl.textContent = `Error: ${String(err)}`;
          }

          try {
            const ib = await fetchJSON(
              `/api/sb/inbound?table=${encodeURIComponent(tableName)}&id=${encodeURIComponent(idStr)}&limit=3`,
            );
            if (ib.ok) {
              inEl.innerHTML = '';
              type InRef = {
                fromTable: string;
                fromColumn: string;
                rows: Record<string, unknown>[];
                total: number | null;
              };
              const refs = (ib.data as { refs: InRef[] }).refs;
              for (const r3 of refs) {
                const card = document.createElement('div');
                card.className = 'card';
                const header = document.createElement('div');
                header.className = 'muted';
                header.textContent = `${r3.fromTable}.${r3.fromColumn} (${r3.total ?? 0})`;
                card.appendChild(header);
                if (r3.rows && r3.rows.length > 0) {
                  const tbl = renderMiniTable(r3.rows) as HTMLTableElement;
                  card.appendChild(tbl);
                  void enrichGitHubInMiniTable(tbl, r3.rows);
                  try {
                    const map = await loadRelationsMap(r3.fromTable);
                    void enrichMiniTableForeigns(tbl, r3.rows, map);
                  } catch {
                    // noop
                  }
                }
                inEl.appendChild(card);
              }
              if (refs.length === 0) inEl.textContent = '(none)';
            } else {
              inEl.textContent = `Failed: ${ib.status}`;
            }
          } catch (err) {
            inEl.textContent = `Error: ${String(err)}`;
          }
        })();
      });
      tdExp.appendChild(btn);
      tr.appendChild(tdExp);
      for (const c of cols) {
        const td = document.createElement('td');
        td.setAttribute('role', 'gridcell');
        if (numericCols.has(c)) td.classList.add('num');
        const v = (r as Record<string, unknown>)[c];
        // Never display raw numeric IDs
        if (c === 'id') {
          td.textContent = '';
        } else if (c.endsWith('_id') && tableName) {
          // Replace *_id with a friendly representation
          td.textContent = '';
          const toTable = relations?.get(c) ?? null;
          void renderForeignCell(td, c, toTable, v, tableName);
        } else {
          const text = formatCell(v);
          td.textContent = text;
          if (text) td.title = text;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    // Bottom spacer
    if (useVirt) {
      const remaining = Math.max(0, rows.length - (end));
      if (remaining > 0) {
        const t = document.createElement('tr');
        t.className = 'v-spacer';
        const td = document.createElement('td');
        td.colSpan = cols.length + 1;
        td.style.height = `${remaining * rowH}px`;
        t.appendChild(td);
        tbody.appendChild(t);
      }
    }
    // Stash slice info
    (tableEl as unknown as { __v?: Record<string, unknown> }).__v = {
      start,
      end,
      rowH,
    };
  };

  if (useVirt && container) {
    const onScroll = () => {
      const st = container.scrollTop;
      const start = Math.max(0, Math.floor(st / rowH) - Math.floor(buffer / 2));
      renderSlice(start);
    };
    // Render initial
    const initialStart = Math.max(0, selectedIndex != null ? selectedIndex - Math.floor(buffer / 2) : 0);
    renderSlice(initialStart);
    // Attach listener (debounced via rAF)
    let raf = 0;
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onScroll);
    };
    const cAny = container as unknown as { __virtHandler?: (this: HTMLElement, ev: Event) => any };
    if (cAny.__virtHandler) container.removeEventListener('scroll', cAny.__virtHandler);
    cAny.__virtHandler = handler as (this: HTMLElement, ev: Event) => any;
    container.addEventListener('scroll', cAny.__virtHandler, { passive: true });
    // Expose helper to jump to a row by index
    (tableEl as unknown as { __scrollToRow?: (i: number) => void }).__scrollToRow = (i: number) => {
      const y = Math.max(0, i) * rowH;
      container.scrollTop = y;
      renderSlice(Math.max(0, i - Math.floor(buffer / 2)));
    };
  } else {
    // Non-virtualized: render all
    renderSlice(0);
    // Provide stub
    (tableEl as unknown as { __scrollToRow?: (i: number) => void }).__scrollToRow = (i: number) => {
      const row = tbody.querySelector(`tr.row-click[data-index="${i}"]`) as HTMLTableRowElement | null;
      if (row) row.scrollIntoView({ block: 'nearest' });
    };
  }
}

// cache for referenced rows per table:id
const refRowCache = new Map<string, Record<string, unknown>>();

async function fetchRefRow(table: string, idVal: unknown): Promise<Record<string, unknown> | null> {
  const key = `${table}:${String(idVal)}`;
  if (refRowCache.has(key)) return refRowCache.get(key)!;
  const res = await fetchJSON(
    `/api/sb/row?table=${encodeURIComponent(table)}&id=${encodeURIComponent(String(idVal))}`,
  );
  if (!res.ok) return null;
  const row = (res.data as { row?: Record<string, unknown> | null }).row ?? null;
  if (row) refRowCache.set(key, row);
  return row;
}

async function renderForeignCell(
  td: HTMLTableCellElement,
  column: string,
  toTable: string | null,
  idVal: unknown,
  _fromTable: string,
) {
  // If we don't know destination, keep blank
  if (idVal == null || idVal === '') {
    td.textContent = '';
    return;
  }
  // Try to infer toTable if not provided
  let target = toTable;
  if (!target) {
    const base = column.replace(/_id$/, '');
    target = base.endsWith('s') ? base : base + 's';
  }
  if (!target) {
    td.textContent = '';
    return;
  }
  // Basic drill-through handler
  const attachDrill = (targetTable: string, refId: unknown) => {
    const idStr = String(refId ?? '');
    if (!targetTable || !idStr) return;
    td.style.cursor = 'pointer';
    td.title = `Open ${targetTable} where id = ${idStr}`;
    td.addEventListener('click', (e) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('a')) return; // don't hijack external links
      e.stopPropagation();
      const filter =
        targetTable === 'users' && column !== 'id'
          ? `id.eq.${encodeURIComponent(idStr)}`
          : `id.eq.${encodeURIComponent(idStr)}`;
      // Use global navigate via a custom event to avoid tight coupling
      try {
        window.osubq_nav?.(targetTable, filter);
      } catch {
        // ignore if not wired
      }
    });
  };

  // Special cases
  if (target === 'users') {
    const num = Number.parseInt(String(idVal));
    const u = await fetchGitHubUserBrief(num);
    if (u) {
      td.innerHTML = '';
      td.appendChild(renderUserChip(u.login, u.avatar_url, u.html_url));
      attachDrill('users', num);
    } else {
      td.textContent = '';
    }
    return;
  }
  if (target === 'locations') {
    const row = await fetchRefRow('locations', idVal);
    if (row) {
      const obj = row as Record<string, unknown>;
      const url = String((obj['node_url'] as unknown) ?? '');
      const type = String((obj['node_type'] as unknown) ?? 'GitHub');
      const a = document.createElement('a');
      a.href = url || '#';
      a.textContent = type || 'GitHub';
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      td.innerHTML = '';
      td.appendChild(a);
      const rid = (row as Record<string, unknown>)['id'];
      if (rid != null) attachDrill('locations', rid);
    } else td.textContent = '';
    return;
  }
  if (target === 'wallets') {
    const row = await fetchRefRow('wallets', idVal);
    if (row) {
      td.innerHTML = '';
      td.appendChild(renderInlineKV(row));
      const rid = (row as Record<string, unknown>)['id'];
      if (rid != null) attachDrill('wallets', rid);
    } else td.textContent = '';
    return;
  }
  // Default: inline kv of referenced row (excluding IDs)
  const row = await fetchRefRow(target, idVal);
  if (row) {
    td.innerHTML = '';
    td.appendChild(renderInlineKV(row));
    const rid = (row as Record<string, unknown>)['id'];
    if (rid != null) attachDrill(target, rid);
  } else td.textContent = '';
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// (removed unused escapeHTML helper)

function renderKeyValues(row: Record<string, unknown>): HTMLElement {
  const keys = Object.keys(row);
  // Never show raw IDs
  const filtered = keys.filter((k) => k !== 'id');
  const preferred = [
    'created',
    'updated',
    'amount',
    'nonce',
    'deadline',
    'address',
    'node_type',
    'node_url',
  ];
  const ordered = [
    ...preferred.filter((k) => filtered.includes(k)),
    ...filtered.filter((k) => !preferred.includes(k)),
  ];
  const wrap = document.createElement('div');
  wrap.className = 'kv';
  for (const k of ordered) {
    const key = document.createElement('div');
    key.className = 'key';
    key.textContent = k;
    key.dataset.key = k;
    const val = document.createElement('div');
    val.className = 'value';
    val.dataset.key = k;
    const text = formatCell((row as Record<string, unknown>)[k]);
    val.textContent = text;
    if (text) val.title = text;
    wrap.appendChild(key);
    wrap.appendChild(val);
  }
  return wrap;
}

function renderMiniTable(rows: Record<string, unknown>[]): HTMLElement {
  const cols = deriveColumns(rows).slice(0, 6);
  const tbl = document.createElement('table');
  tbl.className = 'mini-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of cols) {
    const th = document.createElement('th');
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows.slice(0, 5)) {
    const tr = document.createElement('tr');
    for (const c of cols) {
      const td = document.createElement('td');
      const text = formatCell((r as Record<string, unknown>)[c]);
      td.textContent = text;
      if (text) td.title = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  return tbl;
}

// --- GitHub enrichment helpers ---
type GhUserBrief = { login: string; avatar_url: string; html_url: string };
const ghLoginCache = new Map<number, GhUserBrief>();
const GH_LS_PREFIX = 'gh:user:';
const GH_LS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function lsGetGitHubLogin(id: number): GhUserBrief | null {
  try {
    const key = GH_LS_PREFIX + String(id);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as {
      login?: string;
      avatar_url?: string;
      html_url?: string;
      t?: number;
    };
    if (!obj || typeof obj.login !== 'string' || typeof obj.t !== 'number') return null;
    if (Date.now() - obj.t > GH_LS_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch {
        void 0; // ignore storage removal errors
      }
      return null;
    }
    return {
      login: obj.login!,
      avatar_url: obj.avatar_url ?? '',
      html_url: obj.html_url ?? `https://github.com/${obj.login}`,
    };
  } catch {
    return null;
  }
}

function lsSetGitHubLogin(id: number, brief: GhUserBrief): void {
  try {
    const key = GH_LS_PREFIX + String(id);
    const payload = JSON.stringify({
      login: brief.login,
      avatar_url: brief.avatar_url,
      html_url: brief.html_url,
      t: Date.now(),
    });
    localStorage.setItem(key, payload);
  } catch {
    void 0; // ignore storage failures
  }
}

async function fetchGitHubUserBrief(id: number): Promise<GhUserBrief | null> {
  if (ghLoginCache.has(id)) return ghLoginCache.get(id) ?? null;
  // Check localStorage cache
  const fromLS = lsGetGitHubLogin(id);
  if (fromLS) {
    ghLoginCache.set(id, fromLS);
    return fromLS;
  }
  // Fallback to server proxy
  const res = await fetchJSON(`/api/gh/user?id=${encodeURIComponent(String(id))}`);
  if (!res.ok) return null;
  const data = res.data as { login?: string; avatar_url?: string; html_url?: string };
  const brief: GhUserBrief | null = data.login
    ? {
        login: data.login!,
        avatar_url: data.avatar_url ?? '',
        html_url: data.html_url ?? `https://github.com/${data.login}`,
      }
    : null;
  if (brief) {
    ghLoginCache.set(id, brief);
    lsSetGitHubLogin(id, brief);
  }
  return brief;
}

function renderUserChip(login: string, avatarUrl?: string, htmlUrl?: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'chip user-chip';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = login;
    img.width = 16;
    img.height = 16;
    img.className = 'avatar';
    wrap.appendChild(img);
  }
  const a = document.createElement('a');
  a.href = htmlUrl || `https://github.com/${login}`;
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  a.textContent = `@${login}`;
  wrap.appendChild(a);
  return wrap;
}

async function enrichGitHubInKV(
  container: HTMLElement,
  row: Record<string, unknown>,
  tableName?: string,
) {
  const pairs: Array<{ key: string; val: unknown }> = Object.entries(row).map(([k, v]) => ({
    key: k,
    val: v,
  }));
  for (const p of pairs) {
    const isUserKey = p.key === 'user_id' || (tableName === 'users' && p.key === 'id');
    if (!isUserKey) continue;
    const idNum = typeof p.val === 'number' ? p.val : Number.parseInt(String(p.val ?? ''));
    if (!Number.isFinite(idNum)) continue;
    const valEl = container.querySelector(`.value[data-key="${p.key}"]`) as HTMLElement | null;
    if (!valEl) continue;
    try {
      const brief = await fetchGitHubUserBrief(idNum);
      if (brief) {
        valEl.innerHTML = '';
        valEl.appendChild(renderUserChip(brief.login, brief.avatar_url, brief.html_url));
      }
    } catch {
      // ignore
    }
  }
}

async function enrichGitHubInMiniTable(tbl: HTMLTableElement, rows: Record<string, unknown>[]) {
  const cols = deriveColumns(rows).slice(0, 6);
  const idx = cols.indexOf('user_id');
  if (idx < 0) return;
  const bodyRows = Array.from(tbl.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  for (let i = 0; i < Math.min(bodyRows.length, rows.length, 5); i++) {
    const tr = bodyRows[i]!;
    const tds = Array.from(tr.children) as HTMLTableCellElement[];
    const cell = tds[idx];
    if (!cell) continue;
    const idNum = Number.parseInt(cell.textContent ?? '');
    if (!Number.isFinite(idNum)) continue;
    try {
      const brief = await fetchGitHubUserBrief(idNum);
      if (brief) {
        cell.innerHTML = '';
        cell.appendChild(renderUserChip(brief.login, brief.avatar_url, brief.html_url));
      }
    } catch {
      // ignore
    }
  }
}

function renderInlineKV(row: Record<string, unknown>): HTMLElement {
  const keys = Object.keys(row).filter((k) => k !== 'id' && !k.endsWith('_id'));
  const wrap = document.createElement('div');
  wrap.className = 'inline-kv';
  for (const k of keys) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = k;
    const val = document.createElement('span');
    val.className = 'val';
    const v = (row as Record<string, unknown>)[k];
    if (k === 'node_url') {
      const a = document.createElement('a');
      a.href = String(v ?? '#');
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.textContent = 'GitHub';
      val.appendChild(a);
    } else if (k === 'address') {
      const s = String(v ?? '');
      val.textContent = s.length > 20 ? s.slice(0, 8) + '…' + s.slice(-6) : s;
    } else {
      val.textContent = formatCell(v);
    }
    wrap.appendChild(label);
    wrap.appendChild(val);
  }
  return wrap;
}

async function loadRelationsMap(table: string): Promise<Map<string, string>> {
  const res = await fetchJSON(`/api/sb/relations?table=${encodeURIComponent(table)}`);
  const map = new Map<string, string>();
  if (!res.ok) return map;
  const data = res.data as { outbound: { fromColumn: string; toTable: string }[] };
  for (const o of data.outbound) map.set(o.fromColumn, o.toTable);
  return map;
}

async function enrichForeignInKV(
  container: HTMLElement,
  row: Record<string, unknown>,
  fromTable: string,
  relations: Map<string, string>,
) {
  const entries = Object.entries(row);
  for (const [key, v] of entries) {
    if (!key.endsWith('_id')) continue;
    const toTable = relations.get(key) ?? null;
    const valEl = container.querySelector(`.value[data-key="${key}"]`) as HTMLElement | null;
    if (!valEl) continue;
    await renderForeignCell(valEl as unknown as HTMLTableCellElement, key, toTable, v, fromTable);
  }
}

async function enrichMiniTableForeigns(
  tbl: HTMLTableElement,
  rows: Record<string, unknown>[],
  relations: Map<string, string>,
) {
  const cols = deriveColumns(rows).slice(0, 6);
  const bodyRows = Array.from(tbl.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  for (let i = 0; i < Math.min(bodyRows.length, rows.length, 5); i++) {
    const tr = bodyRows[i]!;
    const r = rows[i]!;
    for (const [key, toTable] of relations.entries()) {
      const colIdx = cols.indexOf(key);
      if (colIdx < 0) continue;
      const cell = (tr.children[colIdx] as HTMLTableCellElement) || null;
      if (!cell) continue;
      const idVal = (r as Record<string, unknown>)[key as keyof typeof r];
      await renderForeignCell(cell, key, toTable, idVal, '');
    }
  }
}

function friendlyLabel(column: string, toTable: string): string {
  if (column.endsWith('_id')) {
    const base = column.slice(0, -3).replace(/_/g, ' ');
    return capitalize(base);
  }
  return capitalize(toTable);
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
