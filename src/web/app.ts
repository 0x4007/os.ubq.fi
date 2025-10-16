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

window.addEventListener('DOMContentLoaded', () => {
  // Diagnostics
  const healthBtn = document.getElementById('checkHealth') as HTMLButtonElement | null;
  const healthOut = document.getElementById('healthOut') as HTMLPreElement | null;
  const timeBtn = document.getElementById('getTime') as HTMLButtonElement | null;
  const timeOut = document.getElementById('timeOut') as HTMLPreElement | null;
  const echoForm = document.getElementById('echoForm') as HTMLFormElement | null;
  const echoInput = document.getElementById('echoInput') as HTMLTextAreaElement | null;
  const echoOut = document.getElementById('echoOut') as HTMLPreElement | null;

  // Dashboard elements
  const opts = {
    tableList: byId<HTMLUListElement>('tableList'),
    tableSearch: byId<HTMLInputElement>('tableSearch'),
    tableTitle: byId<HTMLHeadingElement>('tableTitle'),
    tableSubtitle: byId<HTMLDivElement>('tableSubtitle'),
    filterChips: (document.getElementById('filterChips') as HTMLDivElement | null) ?? undefined,
    pageSizeSel: byId<HTMLSelectElement>('pageSize'),
    prevPageBtn: byId<HTMLButtonElement>('prevPage'),
    nextPageBtn: byId<HTMLButtonElement>('nextPage'),
    grid: byId<HTMLTableElement>('sbGrid'),
    inspectorTitle: byId<HTMLHeadingElement>('inspectorTitle'),
    objectSummary: byId<HTMLDivElement>('objectSummary'),
    relatedOutbound: byId<HTMLDivElement>('relatedOutbound'),
    relatedInbound: byId<HTMLDivElement>('relatedInbound'),
  };
  createDashboard(opts);

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
  filterChips?: HTMLDivElement;
  pageSizeSel: HTMLSelectElement;
  prevPageBtn: HTMLButtonElement;
  nextPageBtn: HTMLButtonElement;
  grid: HTMLTableElement;
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
    sort: null as string | null,
    desc: false,
    filters: new Map<string, { op: 'eq' | 'ilike'; value: string }>(),
    rowId: '' as string | null,
    total: 0 as number | null,
    tables: [] as string[], // visible (non-empty) tables
    allTables: [] as string[],
    lastRows: [] as Record<string, unknown>[],
    lastCols: [] as string[],
    relationsByColumn: new Map<string, string>(), // fromColumn -> toTable
  };

  async function init() {
    // Preload any URL state
    applyURLState();
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
    // If URL preselected a table, select it now
    if (state.table) {
      opts.pageSizeSel.value = String(state.limit);
      await selectTable(state.table);
    }
    window.addEventListener('popstate', () => {
      applyURLState();
      if (state.table) void selectTable(state.table);
    });
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
    opts.tableTitle.textContent = t;
    opts.tableSubtitle.textContent = '';
    opts.inspectorTitle.textContent = 'Object';
    opts.objectSummary.textContent = '(select a row)';
    opts.objectSummary.classList.add('muted');
    opts.relatedOutbound.innerHTML = '';
    opts.relatedInbound.innerHTML = '';
    pushURLState();
    renderTableList();
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
      if (state.sort) url.searchParams.set('order', state.sort);
      if (state.desc) url.searchParams.set('desc', String(state.desc));
      for (const [col, f] of state.filters.entries()) {
        const v = f.value.trim();
        if (!v) continue;
        url.searchParams.append('filter', `${col}.${f.op}.${v}`);
      }
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
        (row) => onRowClick(row),
        state.table,
        state.relationsByColumn,
        (col) => onHeaderSort(col),
        state.sort,
        state.desc,
        state.filters,
        (col, op, value) => onFilterChange(col, op as 'eq' | 'ilike', value),
      );
      const rn = rows.length;
      const range = rn > 0 ? `${state.offset + 1}–${state.offset + rn}` : '0';
      const total = state.total != null ? ` of ${state.total}` : '';
      opts.tableSubtitle.textContent = `${state.table}: ${range}${total}`;
      opts.prevPageBtn.disabled = state.offset === 0;
      opts.nextPageBtn.disabled =
        state.total != null ? state.offset + rn >= state.total : rn < state.limit;

      // Auto-select preserved row if available; else first
      if (rows.length > 0) {
        let idx = 0;
        if (state.rowId) {
          const found = rows.findIndex(
            (r) => String((r as Record<string, unknown>)['id']) === String(state.rowId),
          );
          if (found >= 0) idx = found;
        }
        await onRowClick(rows[idx] as Record<string, unknown>, idx);
      } else {
        // Clear inspector if no rows
        opts.inspectorTitle.textContent = `${state.table} · Object`;
        opts.objectSummary.classList.add('muted');
        opts.objectSummary.textContent = '(no rows)';
        opts.relatedOutbound.innerHTML = '';
        opts.relatedInbound.innerHTML = '';
      }
      renderFilterChips();
    } catch (err) {
      opts.tableSubtitle.textContent = `Query error: ${String(err)}`;
      opts.grid.innerHTML = '';
    } finally {
      setBusy(false);
    }
  }

  function setBusy(b: boolean) {
    opts.prevPageBtn.disabled = b || state.offset === 0;
  }

  opts.prevPageBtn.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - state.limit);
    pushURLState();
    void loadPage(false);
  });
  opts.nextPageBtn.addEventListener('click', () => {
    state.offset += state.limit;
    pushURLState();
    void loadPage(false);
  });
  opts.pageSizeSel.addEventListener('change', () => {
    const v = Number.parseInt(opts.pageSizeSel.value);
    if (Number.isFinite(v)) state.limit = v;
    state.offset = 0;
    pushURLState();
    void loadPage(true);
  });
  opts.tableSearch.addEventListener('input', renderTableList);

  void init();

  async function onRowClick(row: Record<string, unknown>, _idx: number) {
    const idVal = row['id'];
    if (idVal != null) {
      state.rowId = String(idVal);
      pushURLState();
    }
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
        opts.relatedInbound.appendChild(card);
      }
      if (refs.length === 0) opts.relatedInbound.textContent = '(none)';
    } else {
      opts.relatedInbound.textContent = `Failed: ${inbound.status}`;
    }
  }

  function onHeaderSort(column: string) {
    if (state.sort === column) state.desc = !state.desc;
    else {
      state.sort = column;
      state.desc = false;
    }
    state.offset = 0;
    pushURLState();
    void loadPage(true);
  }

  function onFilterChange(col: string, op: 'eq' | 'ilike', value: string) {
    const v = value.trim();
    if (!v) state.filters.delete(col);
    else state.filters.set(col, { op, value: v });
    state.offset = 0;
    pushURLState();
    void loadPage(true);
  }

  function parseFiltersParam(s: string | null): Map<string, { op: 'eq' | 'ilike'; value: string }> {
    const out = new Map<string, { op: 'eq' | 'ilike'; value: string }>();
    if (!s) return out;
    const parts = s
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      const [col, op, ...rest] = p.split('.');
      const value = rest.join('.');
      if (!col || !op || !value) continue;
      const o = op === 'ilike' ? 'ilike' : 'eq';
      out.set(col, { op: o, value });
    }
    return out;
  }

  function stringifyFilters(): string {
    const pieces: string[] = [];
    for (const [col, f] of state.filters.entries()) {
      if (!f.value.trim()) continue;
      pieces.push(`${col}.${f.op}.${f.value}`);
    }
    return pieces.join(';');
  }

  function applyURLState() {
    const sp = new URLSearchParams(location.search);
    state.table = sp.get('table') ?? state.table;
    const limit = Number.parseInt(sp.get('limit') ?? '');
    const offset = Number.parseInt(sp.get('offset') ?? '');
    if (Number.isFinite(limit)) state.limit = limit;
    if (Number.isFinite(offset)) state.offset = offset;
    state.sort = sp.get('sort');
    state.desc = (sp.get('desc') ?? 'false').toLowerCase() === 'true';
    state.rowId = sp.get('rowId');
    state.filters = parseFiltersParam(sp.get('filters'));
  }

  function pushURLState() {
    const sp = new URLSearchParams();
    if (state.table) sp.set('table', state.table);
    sp.set('limit', String(state.limit));
    sp.set('offset', String(state.offset));
    if (state.sort) sp.set('sort', state.sort);
    if (state.desc) sp.set('desc', String(state.desc));
    if (state.rowId) sp.set('rowId', state.rowId);
    const filtersStr = stringifyFilters();
    if (filtersStr) sp.set('filters', filtersStr);
    const newUrl = `${location.pathname}?${sp.toString()}`;
    history.pushState({}, '', newUrl);
  }

  function renderFilterChips() {
    if (!opts.filterChips) return;
    opts.filterChips.innerHTML = '';
    for (const [col, f] of state.filters.entries()) {
      if (!f.value.trim()) continue;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${col} ${f.op} ${f.value}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.style.marginLeft = '0.35rem';
      btn.addEventListener('click', () => onFilterChange(col, f.op, ''));
      chip.appendChild(btn);
      opts.filterChips.appendChild(chip);
      opts.filterChips.appendChild(document.createTextNode(' '));
    }
  }
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
  onHeaderClick?: (column: string) => void,
  currentSort?: string | null,
  currentDesc?: boolean,
  filterState?: Map<string, { op: 'eq' | 'ilike'; value: string }>,
  onFilterChange?: (col: string, op: 'eq' | 'ilike', value: string) => void,
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
    const label = c.endsWith('_id') ? friendlyLabel(c, '') : c;
    const isSort = currentSort === c;
    th.textContent = isSort ? `${label} ${currentDesc ? '▼' : '▲'}` : label;
    if (onHeaderClick) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => onHeaderClick(c));
    }
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  if (onFilterChange) {
    const trf = document.createElement('tr');
    const td0 = document.createElement('th');
    td0.textContent = '';
    trf.appendChild(td0);
    for (const c of cols) {
      const th = document.createElement('th');
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '0.25rem';
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="ilike">ilike</option><option value="eq">eq</option>';
      sel.style.background = 'transparent';
      sel.style.color = 'inherit';
      sel.style.border = '1px solid #333';
      sel.style.borderRadius = '6px';
      sel.style.padding = '0.1rem 0.25rem';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'filter…';
      inp.className = 'input';
      inp.style.padding = '0.2rem 0.3rem';
      inp.style.fontSize = '0.8rem';
      inp.style.height = '1.6rem';
      const f = filterState?.get(c);
      if (f) {
        sel.value = f.op;
        inp.value = f.value;
      }
      sel.addEventListener('change', () =>
        onFilterChange(c, sel.value as 'eq' | 'ilike', inp.value),
      );
      inp.addEventListener('change', () =>
        onFilterChange(c, sel.value as 'eq' | 'ilike', inp.value),
      );
      wrap.appendChild(sel);
      wrap.appendChild(inp);
      th.appendChild(wrap);
      trf.appendChild(th);
    }
    thead.appendChild(trf);
  }
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
  // Special cases
  if (target === 'users') {
    const num = Number.parseInt(String(idVal));
    const u = await fetchGitHubUserBrief(num);
    if (u) {
      td.innerHTML = '';
      td.appendChild(renderUserChip(u.login, u.avatar_url, u.html_url));
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
    } else td.textContent = '';
    return;
  }
  if (target === 'wallets') {
    const row = await fetchRefRow('wallets', idVal);
    if (row) {
      td.innerHTML = '';
      td.appendChild(renderInlineKV(row));
    } else td.textContent = '';
    return;
  }
  // Default: inline kv of referenced row (excluding IDs)
  const row = await fetchRefRow(target, idVal);
  if (row) {
    td.innerHTML = '';
    td.appendChild(renderInlineKV(row));
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
