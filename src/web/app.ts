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
  filter: string | null;
  rowId: string | null;
} {
  const url = new URL(location.href);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  return {
    table: url.searchParams.get('table') ?? '',
    limit: limit ? Number.parseInt(limit) : null,
    offset: offset ? Number.parseInt(offset) : null,
    filter: url.searchParams.get('filter'),
    rowId: url.searchParams.get('rowId'),
  };
}

function buildURL(
  table: string,
  limit: number,
  offset: number,
  filter: string | null,
  rowId: string | null,
): string {
  const u = new URL(location.pathname, location.origin);
  if (table) u.searchParams.set('table', table);
  if (limit) u.searchParams.set('limit', String(limit));
  if (offset) u.searchParams.set('offset', String(offset));
  if (filter) u.searchParams.set('filter', filter);
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

  // Saved Views wiring (sidebar)
  const viewList = document.getElementById('viewList') as HTMLUListElement | null;
  const saveViewBtn = document.getElementById('saveViewBtn') as HTMLButtonElement | null;
  const applyFirstViewBtn = document.getElementById('applyFirstViewBtn') as HTMLButtonElement | null;
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
    themeToggle.addEventListener('click', () => {
      const el = document.documentElement;
      const isLight = el.getAttribute('data-theme') === 'light';
      const next = isLight ? '' : 'light';
      if (next) el.setAttribute('data-theme', next);
      else el.removeAttribute('data-theme');
      try {
        localStorage.setItem('theme', next || 'dark');
      } catch {
        // ignore
      }
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
    filter: null as string | null,
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
    const pref = state.table || (typeof lsGet('lastTable') === 'string' ? (lsGet('lastTable') as string) : '');
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
    opts.objectSummary.classList.add('muted');
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
    await loadPage(true);
  }

  async function loadPage(reset = false) {
    if (!state.table) return;
    if (reset) state.offset = 0;
    setBusy(true);
    try {
      const url = new URL('/api/sb/rows', location.origin);
      url.searchParams.set('table', state.table);
      url.searchParams.set('limit', String(state.limit));
      url.searchParams.set('offset', String(state.offset));
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
      );
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
          const found = rows.findIndex((r) => String((r as Record<string, unknown>)['id']) === state.rowId);
          if (found >= 0) idx = found;
        }
        state.selectedIndex = idx;
        await onRowClick(rows[idx] as Record<string, unknown>, idx);
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
    void loadPage(false);
  });
  opts.nextPageBtn.addEventListener('click', () => {
    state.offset += state.limit;
    pushURL(true);
    void loadPage(false);
  });
  opts.pageSizeSel.addEventListener('change', () => {
    const v = Number.parseInt(opts.pageSizeSel.value);
    if (Number.isFinite(v)) state.limit = v;
    state.offset = 0;
    pushURL(true);
    void loadPage(true);
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
    const url = buildURL(state.table, state.limit, state.offset, state.filter, state.rowId);
    if (push) history.pushState({}, '', url);
    else history.replaceState({}, '', url);
  }
  function restoreFromURL() {
    const u = parseURLState();
    if (u.table) state.table = u.table;
    if (Number.isFinite(u.limit ?? NaN) && u.limit) state.limit = u.limit;
    if (Number.isFinite(u.offset ?? NaN) && u.offset) state.offset = u.offset;
    state.filter = u.filter;
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

  // Drill-through navigation helper
  async function navigateTo(table: string, filter: string) {
    state.table = table;
    state.filter = filter;
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
    await loadPage(true);
  }

  // Expose a tiny hook for cell drill-through without tight coupling
  window.osubq_nav = (t, f) => {
    void navigateTo(t, f);
  };

  async function onRowClick(row: Record<string, unknown>, _idx: number) {
    opts.inspectorTitle.textContent = `${state.table} · Object`;
    const summary = renderKeyValues(row);
    opts.objectSummary.classList.remove('muted');
    opts.objectSummary.innerHTML = '';
    opts.objectSummary.appendChild(summary);
    // Enrich values: replace IDs with labels/objects
    void enrichGitHubInKV(summary, row, state.table);
    void enrichForeignInKV(summary, row, state.table, state.relationsByColumn);

    const val = row['id'];
    opts.relatedOutbound.innerHTML = '';
    opts.relatedInbound.innerHTML = '';
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
      if (refs.length === 0) opts.relatedOutbound.textContent = '(none)';
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
      if (refs.length === 0) opts.relatedInbound.textContent = '(none)';
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
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else s = safeJSONStringify(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(',')).join('\n');
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
) {
  tableEl.innerHTML = '';
  if (rows.length === 0) return;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  // Expander column header
  const thExp = document.createElement('th');
  thExp.textContent = '';
  thExp.style.width = '24px';
  trh.appendChild(thExp);
  for (const c of cols) {
    const th = document.createElement('th');
    th.textContent = c.endsWith('_id') ? friendlyLabel(c, '') : c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.className = 'row-click';
    tr.addEventListener('click', () => onRowClick(r, i));
    // Expander cell
    const tdExp = document.createElement('td');
    tdExp.className = 'expander-cell';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'expand-toggle';
    btn.setAttribute('aria-label', 'Toggle related');
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
        return;
      }
      // expand
      btn.textContent = '▼';
      btn.dataset.expanded = 'true';
      const expandTr = document.createElement('tr');
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
              card.innerHTML = `<div class="muted">${title}</div>`;
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
  });
  tableEl.appendChild(tbody);
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
      const filter = targetTable === 'users' && column !== 'id'
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
