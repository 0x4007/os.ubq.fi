/// <reference lib="dom" />

type TableKey = 'users' | 'issues' | 'plugins';

type Row = {
  id: string;
  created: string;
  email?: string;
  health?: string;
  name: string;
  owner?: string;
  pluginId?: string;
  repo?: string;
  status: string;
  userId?: string;
};

type Column = {
  key: keyof Row;
  label: string;
};

type FilterOperator = 'eq' | 'ilike';

type Theme = 'dark' | 'light';

type ColumnFilter = {
  key: keyof Row;
  op: FilterOperator;
  value: string;
};

type TableConfig = {
  label: string;
  columns: Column[];
  filters: Column[];
  rows: Row[];
};

type DrillThroughLink = {
  filterKey: keyof Row;
  label: string;
  table: TableKey;
  value: string;
};

type RelationState = {
  key: string;
  links: DrillThroughLink[];
  message: string;
  status: 'error' | 'idle' | 'loading' | 'ready';
};

type SavedView = {
  name: string;
  search: string;
};

type ViewState = {
  desc: boolean;
  filters: string;
  limit: number;
  offset: number;
  rowId: string;
  sort: keyof Row;
  table: TableKey;
};

const TABLES: Record<TableKey, TableConfig> = {
  users: {
    label: 'Users',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
    ],
    filters: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
      { key: 'id', label: 'ID' },
    ],
    rows: makeUsers(),
  },
  issues: {
    label: 'Issues',
    columns: [
      { key: 'name', label: 'Title' },
      { key: 'repo', label: 'Repository' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
    ],
    filters: [
      { key: 'name', label: 'Title' },
      { key: 'repo', label: 'Repository' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
      { key: 'id', label: 'ID' },
      { key: 'userId', label: 'User ID' },
      { key: 'pluginId', label: 'Plugin ID' },
    ],
    rows: makeIssues(),
  },
  plugins: {
    label: 'Plugins',
    columns: [
      { key: 'name', label: 'Plugin' },
      { key: 'owner', label: 'Owner' },
      { key: 'health', label: 'Health' },
      { key: 'created', label: 'Created' },
    ],
    filters: [
      { key: 'name', label: 'Plugin' },
      { key: 'owner', label: 'Owner' },
      { key: 'health', label: 'Health' },
      { key: 'created', label: 'Created' },
      { key: 'id', label: 'ID' },
    ],
    rows: makePlugins(),
  },
};

const DEFAULT_STATE: ViewState = {
  desc: false,
  filters: '',
  limit: 25,
  offset: 0,
  rowId: '',
  sort: 'created',
  table: 'users',
};

const LIMITS = [10, 25, 50, 100, 5000];
const ROW_HEIGHT = 55;
const OVERSCAN_ROWS = 8;
const FILTER_OPERATORS: Record<FilterOperator, string> = {
  eq: 'equals',
  ilike: 'contains',
};
const DETAILS_REGION_ID = 'rowDetails';
const LAST_TABLE_KEY = 'os.ubq.fi.lastTable';
const SAVED_VIEWS_KEY = 'os.ubq.fi.savedViews';
const TABLE_SCROLL_KEY = 'os.ubq.fi.tableScrollTop';
const THEME_KEY = 'os.ubq.fi.theme';

let state = parseStateFromUrl(location.search);
let activeColumns: Column[] = [];
let activePageRows: Row[] = [];
let activeTotalRows = 0;
let chartFrame = 0;
let gridStatus: 'loading' | 'ready' = 'loading';
let pendingChart: { rows: Row[]; table: TableKey } | null = null;
let pendingFocusRowId: string | null = null;
let pendingScrollTop: number | null = null;
let relationAbortController: AbortController | null = null;
let relationState: RelationState = {
  key: '',
  links: [],
  message: '',
  status: 'idle',
};
let scrollFrame = 0;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function initTheme() {
  const themeToggle = byId<HTMLButtonElement>('themeToggle');
  applyTheme(loadTheme(), themeToggle);
  themeToggle.addEventListener('click', () => {
    const nextTheme = getCurrentTheme() === 'light' ? 'dark' : 'light';
    saveTheme(nextTheme);
    applyTheme(nextTheme, themeToggle);
  });
}

function getCurrentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

function loadTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'light';
  }
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for the current page even when storage is unavailable.
  }
}

function parseTheme(value: string | null | undefined): Theme {
  return value === 'dark' || value === 'light' ? value : 'light';
}

function applyTheme(theme: Theme, themeToggle = byId<HTMLButtonElement>('themeToggle')) {
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';
  themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

function parseStateFromUrl(search: string): ViewState {
  const params = new URLSearchParams(search);
  const table = parseTable(params.get('table') ?? loadLastTable());
  const columns = TABLES[table].columns;
  const filterColumns = getFilterColumns(table);
  const sort = parseColumn(params.get('sort'), columns);

  return {
    desc: params.get('desc') === 'true',
    filters: normalizeFilters(params.get('filters'), filterColumns),
    limit: parseLimit(params.get('limit')),
    offset: parseNonNegativeInt(params.get('offset'), DEFAULT_STATE.offset),
    rowId: params.get('rowId')?.trim() ?? DEFAULT_STATE.rowId,
    sort,
    table,
  };
}

function parseTable(value: string | null): TableKey {
  if (value === 'issues' || value === 'plugins' || value === 'users') {
    return value;
  }
  return DEFAULT_STATE.table;
}

function parseColumn(value: string | null, columns: Column[]): keyof Row {
  const column = columns.find((item) => item.key === value);
  return column?.key ?? DEFAULT_STATE.sort;
}

function getFilterColumns(table: TableKey): Column[] {
  return TABLES[table].filters;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return LIMITS.includes(parsed) ? parsed : DEFAULT_STATE.limit;
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function setState(next: Partial<ViewState>, mode: 'push' | 'replace' = 'push') {
  const nextTable = next.table ?? state.table;
  const validSort = TABLES[nextTable].columns.some(
    (column) => column.key === (next.sort ?? state.sort),
  );
  const shouldResetScroll =
    next.desc !== undefined ||
    next.filters !== undefined ||
    next.limit !== undefined ||
    next.offset !== undefined ||
    next.sort !== undefined ||
    next.table !== undefined;
  if (shouldResetScroll) {
    pendingScrollTop = 0;
  }
  state = {
    ...state,
    ...next,
    sort: validSort ? (next.sort ?? state.sort) : DEFAULT_STATE.sort,
  };
  render();
  updateUrl(mode);
}

function updateUrl(mode: 'push' | 'replace') {
  const url = new URL(location.href);
  url.search = serializeState(state).toString();

  if (`${url.pathname}${url.search}` === `${location.pathname}${location.search}`) {
    return;
  }

  history[mode === 'replace' ? 'replaceState' : 'pushState'](state, '', url);
}

function serializeState(current: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('table', current.table);
  params.set('offset', String(current.offset));
  params.set('limit', String(current.limit));
  params.set('sort', String(current.sort));
  params.set('desc', String(current.desc));
  if (current.filters) params.set('filters', current.filters);
  if (current.rowId) params.set('rowId', current.rowId);
  return params;
}

function render() {
  const tableSelect = byId<HTMLSelectElement>('tableSelect');
  const limitSelect = byId<HTMLSelectElement>('limitSelect');
  const pageSummary = byId<HTMLParagraphElement>('pageSummary');
  const prevPage = byId<HTMLButtonElement>('prevPage');
  const nextPage = byId<HTMLButtonElement>('nextPage');
  const tableScroll = byId<HTMLDivElement>('tableScroll');
  const tableHead = byId<HTMLTableSectionElement>('tableHead');
  const tableBody = byId<HTMLTableSectionElement>('tableBody');
  const rowDetails = byId<HTMLElement>('rowDetails');

  const table = TABLES[state.table];
  const filterColumns = getFilterColumns(state.table);
  const dataGrid = byId<HTMLTableElement>('dataGrid');
  const filtered = filterRowsForTable(state.table, table.rows, state.filters);
  const sorted = sortRows(filtered, state.sort, state.desc);
  const maxOffset = Math.max(
    0,
    Math.floor(Math.max(0, sorted.length - 1) / state.limit) * state.limit,
  );
  const offset = Math.min(state.offset, maxOffset);
  if (offset !== state.offset) {
    state = { ...state, offset };
    updateUrl('replace');
  }

  const pageRows = sorted.slice(offset, offset + state.limit);
  const selectedRow = sorted.find((row) => row.id === state.rowId) ?? null;
  const start = sorted.length === 0 ? 0 : offset + 1;
  const end = Math.min(offset + state.limit, sorted.length);
  syncRelationState(state.table, selectedRow);

  tableSelect.value = state.table;
  limitSelect.value = String(state.limit);
  saveLastTable(state.table);
  dataGrid.setAttribute('aria-rowcount', String(sorted.length));
  dataGrid.setAttribute('aria-colcount', String(table.columns.length + 1));
  renderFilterControls(filterColumns);
  renderSavedViews();

  activeColumns = table.columns;
  activePageRows = pageRows;
  activeTotalRows = sorted.length;

  tableHead.replaceChildren(renderHeader(table.columns));
  if (gridStatus === 'loading') {
    pageSummary.textContent = `${table.label}: loading rows`;
    prevPage.disabled = true;
    nextPage.disabled = true;
    renderTableSkeletonRows(tableBody, table.columns.length + 1);
    rowDetails.replaceChildren(renderDetails(selectedRow));
    return;
  }

  scheduleChart(state.table, sorted);
  pageSummary.textContent = `${table.label}: ${start}-${end} of ${sorted.length}`;
  prevPage.disabled = offset === 0;
  nextPage.disabled = offset + state.limit >= sorted.length;
  renderVirtualRows(tableBody, table.columns, pageRows, tableScroll);
  if (pendingScrollTop !== null) {
    tableScroll.scrollTop = pendingScrollTop;
    pendingScrollTop = null;
    renderVirtualRows(tableBody, table.columns, pageRows, tableScroll);
  }
  rowDetails.replaceChildren(renderDetails(selectedRow));
}

function renderFilterControls(columns: Column[]) {
  const filterColumn = byId<HTMLSelectElement>('filterColumn');
  const filterChips = byId<HTMLDivElement>('filterChips');
  const selectedColumn = columns.some((column) => column.key === filterColumn.value)
    ? filterColumn.value
    : String(columns[0]?.key ?? 'name');
  filterColumn.replaceChildren(
    ...columns.map((column) => {
      const option = document.createElement('option');
      option.value = String(column.key);
      option.textContent = column.label;
      return option;
    }),
  );
  filterColumn.value = selectedColumn;
  filterChips.replaceChildren(
    ...parseFilters(state.filters, columns).map((filter, index) =>
      renderFilterChip(filter, columns, index),
    ),
  );
}

function renderFilterChip(
  filter: ColumnFilter,
  columns: Column[],
  index: number,
): HTMLButtonElement {
  const button = document.createElement('button');
  const label = columns.find((column) => column.key === filter.key)?.label ?? String(filter.key);
  button.type = 'button';
  button.className = 'filter-chip';
  button.textContent = `${label} ${FILTER_OPERATORS[filter.op]} ${filter.value} ×`;
  button.setAttribute(
    'aria-label',
    `Remove filter ${label} ${FILTER_OPERATORS[filter.op]} ${filter.value}`,
  );
  button.addEventListener('click', () => {
    const filters = parseFilters(state.filters, columns);
    filters.splice(index, 1);
    setState({
      filters: serializeFilters(filters),
      offset: 0,
      rowId: '',
    });
  });
  return button;
}

function renderVirtualRows(
  tableBody: HTMLTableSectionElement,
  columns: Column[],
  rows: Row[],
  scrollEl: HTMLElement,
) {
  const rowToRefocus = pendingFocusRowId ?? getFocusedRowId();
  if (rows.length === 0) {
    tableBody.replaceChildren(renderEmptyRow(columns.length + 1));
    return;
  }

  const viewportHeight = scrollEl.clientHeight || ROW_HEIGHT * 12;
  const maxScrollTop = Math.max(0, rows.length * ROW_HEIGHT - viewportHeight);
  if (scrollEl.scrollTop > maxScrollTop) {
    scrollEl.scrollTop = maxScrollTop;
  }

  const firstVisible = Math.max(0, Math.floor(scrollEl.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const lastVisible = Math.min(rows.length, firstVisible + visibleCount);
  const topHeight = firstVisible * ROW_HEIGHT;
  const bottomHeight = Math.max(0, (rows.length - lastVisible) * ROW_HEIGHT);
  const visibleRows = rows.slice(firstVisible, lastVisible).map((row) => renderRow(row, columns));

  tableBody.replaceChildren(
    renderSpacerRow(topHeight, columns.length + 1),
    ...visibleRows,
    renderSpacerRow(bottomHeight, columns.length + 1),
  );
  if (rowToRefocus) {
    pendingFocusRowId = rowToRefocus;
    requestAnimationFrame(flushPendingRowFocus);
  }
}

function renderTableSkeletonRows(tableBody: HTMLTableSectionElement, colSpan: number) {
  tableBody.replaceChildren(
    renderSkeletonRow(colSpan, 'wide'),
    renderSkeletonRow(colSpan, 'medium'),
    renderSkeletonRow(colSpan, 'short'),
    renderSkeletonRow(colSpan, 'wide'),
  );
}

function renderSkeletonRow(
  colSpan: number,
  size: 'medium' | 'short' | 'wide',
): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'skeleton-row';
  tr.setAttribute('aria-hidden', 'true');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  const block = document.createElement('span');
  block.className = `skeleton-block skeleton-${size}`;
  td.append(block);
  tr.append(td);
  return tr;
}

function renderEmptyRow(colSpan: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const title = document.createElement('strong');
  title.textContent = 'No matching rows';
  const detail = document.createElement('span');
  detail.textContent = 'Clear filters or broaden the current search.';
  empty.append(title, detail);
  td.append(empty);
  tr.append(td);
  return tr;
}

function renderSpacerRow(height: number, colSpan: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'virtual-spacer';
  tr.setAttribute('aria-hidden', 'true');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.style.height = `${height}px`;
  tr.append(td);
  return tr;
}

function renderHeader(columns: Column[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    const button = document.createElement('button');
    const isActive = state.sort === column.key;
    const nextDirection = isActive && !state.desc ? 'descending' : 'ascending';
    th.scope = 'col';
    th.setAttribute('aria-sort', isActive ? (state.desc ? 'descending' : 'ascending') : 'none');
    button.type = 'button';
    button.className = 'sort-button';
    button.textContent = `${column.label}${isActive ? (state.desc ? ' ↓' : ' ↑') : ''}`;
    button.setAttribute('aria-label', `Sort ${column.label} ${nextDirection}`);
    button.addEventListener('click', () => {
      setState({
        desc: isActive ? !state.desc : false,
        offset: 0,
        sort: column.key,
      });
    });
    th.append(button);
    tr.append(th);
  }

  const th = document.createElement('th');
  th.scope = 'col';
  th.textContent = 'Details';
  tr.append(th);
  return tr;
}

function renderRow(row: Row, columns: Column[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const isSelected = row.id === state.rowId;
  tr.dataset.rowId = row.id;
  tr.tabIndex = 0;
  tr.setAttribute('aria-controls', DETAILS_REGION_ID);
  tr.setAttribute('aria-label', getRowAriaLabel(row, isSelected));
  tr.setAttribute('aria-selected', String(isSelected));
  tr.addEventListener('keydown', (event) => handleRowKeydown(event, row.id));
  if (isSelected) {
    tr.classList.add('selected-row');
  }

  for (const column of columns) {
    const td = document.createElement('td');
    td.textContent = String(row[column.key] ?? '');
    tr.append(td);
  }

  const action = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-toggle';
  button.textContent = isSelected ? 'Close' : 'Open';
  button.setAttribute('aria-controls', DETAILS_REGION_ID);
  button.setAttribute('aria-expanded', String(isSelected));
  button.setAttribute('aria-label', `${isSelected ? 'Close' : 'Open'} details for ${row.name}`);
  button.addEventListener('click', () => {
    toggleRowDetails(row.id);
  });
  action.append(button);
  tr.append(action);
  return tr;
}

function getRowAriaLabel(row: Row, isSelected: boolean): string {
  const detailsState = isSelected ? 'Details are open.' : 'Details are closed.';
  return `${row.name}, ${row.status}, ${row.id}. ${detailsState} Press Enter to ${
    isSelected ? 'close' : 'open'
  } details.`;
}

function handleRowKeydown(event: KeyboardEvent, rowId: string) {
  if (event.target !== event.currentTarget) return;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleRowDetails(rowId);
    return;
  }

  if (
    event.key === 'ArrowDown' ||
    event.key === 'ArrowUp' ||
    event.key === 'End' ||
    event.key === 'Home'
  ) {
    event.preventDefault();
    moveRowFocus(rowId, event.key);
  }
}

function toggleRowDetails(rowId: string) {
  pendingFocusRowId = rowId;
  setState({ rowId: state.rowId === rowId ? '' : rowId });
}

function moveRowFocus(rowId: string, key: 'ArrowDown' | 'ArrowUp' | 'End' | 'Home') {
  const currentIndex = activePageRows.findIndex((row) => row.id === rowId);
  if (currentIndex < 0 || activePageRows.length === 0) return;

  const targetIndex =
    key === 'Home'
      ? 0
      : key === 'End'
        ? activePageRows.length - 1
        : key === 'ArrowDown'
          ? Math.min(activePageRows.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
  const target = activePageRows[targetIndex];
  if (!target) return;

  const tableScroll = byId<HTMLDivElement>('tableScroll');
  pendingFocusRowId = target.id;
  ensurePageRowVisible(targetIndex, tableScroll);
  renderVirtualRows(
    byId<HTMLTableSectionElement>('tableBody'),
    activeColumns,
    activePageRows,
    tableScroll,
  );
}

function ensurePageRowVisible(index: number, scrollEl: HTMLElement) {
  const rowTop = index * ROW_HEIGHT;
  const rowBottom = rowTop + ROW_HEIGHT;
  const viewportTop = scrollEl.scrollTop;
  const viewportBottom = viewportTop + scrollEl.clientHeight;

  if (rowTop < viewportTop) {
    scrollEl.scrollTop = rowTop;
  } else if (rowBottom > viewportBottom) {
    scrollEl.scrollTop = Math.max(0, rowBottom - scrollEl.clientHeight);
  }
}

function flushPendingRowFocus() {
  if (!pendingFocusRowId) return;
  const row = getRenderedRowElement(pendingFocusRowId);
  if (!row) return;
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'nearest' });
  pendingFocusRowId = null;
}

function getRenderedRowElement(rowId: string): HTMLTableRowElement | null {
  return (
    [...document.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-id]')].find(
      (row) => row.dataset.rowId === rowId,
    ) ?? null
  );
}

function getFocusedRowId(): string | null {
  if (!(document.activeElement instanceof HTMLElement)) return null;
  if (document.activeElement.tagName !== 'TR') return null;
  return document.activeElement.dataset.rowId ?? null;
}

function renderDetails(row: Row | null): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'details-panel';
  if (!row) {
    const empty = document.createElement('div');
    empty.className = 'empty-state inspector-empty';
    const title = document.createElement('strong');
    title.textContent = 'No row selected';
    const detail = document.createElement('span');
    detail.textContent = 'Open a table row to inspect its state and relations.';
    empty.append(title, detail);
    wrapper.append(empty);
    return wrapper;
  }

  const heading = document.createElement('h2');
  heading.textContent = row.name;
  const relations = getRelationStateForRow(state.table, row);
  const relatedLinks =
    relations.status === 'loading' ? null : renderDrillThroughLinks(relations.links);
  const pre = document.createElement('pre');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', `JSON payload for ${row.name}`);
  pre.textContent = JSON.stringify(row, null, 2);
  wrapper.append(heading);
  if (relations.status === 'loading') {
    wrapper.append(renderInspectorSkeleton());
  } else if (relations.status === 'error') {
    wrapper.append(renderInlineError(relations.message));
  }
  if (relatedLinks) wrapper.append(relatedLinks);
  wrapper.append(pre);
  return wrapper;
}

function renderInspectorSkeleton(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'inspector-skeleton';
  wrapper.setAttribute('aria-hidden', 'true');
  for (const size of ['short', 'medium', 'wide'] as const) {
    const block = document.createElement('span');
    block.className = `skeleton-block skeleton-${size}`;
    wrapper.append(block);
  }
  return wrapper;
}

function renderInlineError(message: string): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'inline-error';
  banner.textContent = message;
  return banner;
}

function getRelationStateForRow(table: TableKey, row: Row): RelationState {
  const key = relationKey(table, row.id);
  if (relationState.key === key) {
    return relationState;
  }
  return {
    key,
    links: getFallbackDrillThroughLinks(table, row),
    message: '',
    status: 'loading',
  };
}

function syncRelationState(table: TableKey, row: Row | null) {
  if (!row) {
    relationAbortController?.abort();
    relationAbortController = null;
    relationState = { key: '', links: [], message: '', status: 'idle' };
    return;
  }

  const key = relationKey(table, row.id);
  if (relationState.key === key && relationState.status !== 'idle') return;

  relationAbortController?.abort();
  const fallbackLinks = getFallbackDrillThroughLinks(table, row);
  relationState = {
    key,
    links: fallbackLinks,
    message: '',
    status: 'loading',
  };

  const controller = new AbortController();
  relationAbortController = controller;
  fetchExactRelations(table, row.id, controller.signal)
    .then((links) => {
      if (controller.signal.aborted || !isCurrentRelationKey(key)) return;
      relationState = {
        key,
        links: links.length > 0 ? links : fallbackLinks,
        message: '',
        status: 'ready',
      };
      render();
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted || !isCurrentRelationKey(key)) return;
      relationState = {
        key,
        links: fallbackLinks,
        message:
          error instanceof Error && error.message
            ? `Exact relations unavailable: ${error.message}`
            : 'Exact relations unavailable. Showing generated links.',
        status: 'error',
      };
      render();
    });
}

async function fetchExactRelations(
  table: TableKey,
  rowId: string,
  signal: AbortSignal,
): Promise<DrillThroughLink[]> {
  const params = new URLSearchParams({ id: rowId, table });
  const response = await fetch(`/api/sb/relations?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`RPC returned ${response.status}`);
  }
  return parseRelationPayload(await response.json());
}

function parseRelationPayload(payload: unknown): DrillThroughLink[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { edges?: unknown }).edges)
  ) {
    return [];
  }

  return (payload as { edges: unknown[] }).edges
    .map((edge) => parseRelationEdge(edge))
    .filter((edge): edge is DrillThroughLink => edge !== null);
}

function parseRelationEdge(edge: unknown): DrillThroughLink | null {
  if (!edge || typeof edge !== 'object') return null;
  const item = edge as Partial<Record<keyof DrillThroughLink, unknown>>;
  const table = item.table;
  if (
    typeof item.filterKey !== 'string' ||
    typeof item.label !== 'string' ||
    typeof table !== 'string' ||
    typeof item.value !== 'string' ||
    !isTableKey(table)
  ) {
    return null;
  }

  const filterKey = item.filterKey as keyof Row;
  if (!getFilterColumns(table).some((column) => column.key === filterKey)) {
    return null;
  }

  return {
    filterKey,
    label: item.label,
    table,
    value: item.value,
  };
}

function relationKey(table: TableKey, rowId: string): string {
  return `${table}:${rowId}`;
}

function isCurrentRelationKey(key: string): boolean {
  return relationKey(state.table, state.rowId) === key;
}

function isTableKey(value: string): value is TableKey {
  return value === 'issues' || value === 'plugins' || value === 'users';
}

function renderDrillThroughLinks(links: DrillThroughLink[]): HTMLElement | null {
  if (links.length === 0) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'related-links';
  wrapper.setAttribute('aria-label', 'Related rows');

  for (const link of links) {
    const button = document.createElement('button');
    const count = countRowsForLink(link);
    button.type = 'button';
    button.className = 'related-chip';
    button.textContent = `${link.label} ${count}`;
    button.setAttribute('aria-label', `${link.label}: ${count} matching rows`);
    button.addEventListener('click', () => navigateDrillThrough(link));
    wrapper.append(button);
  }

  return wrapper;
}

function getFallbackDrillThroughLinks(table: TableKey, row: Row): DrillThroughLink[] {
  if (table === 'users') {
    return [
      {
        filterKey: 'userId',
        label: 'Assigned issues',
        table: 'issues',
        value: row.id,
      },
    ];
  }

  if (table === 'issues') {
    return [
      row.userId
        ? {
            filterKey: 'id',
            label: 'Reporter',
            table: 'users',
            value: row.userId,
          }
        : null,
      row.pluginId
        ? {
            filterKey: 'id',
            label: 'Plugin',
            table: 'plugins',
            value: row.pluginId,
          }
        : null,
      row.repo
        ? {
            filterKey: 'repo',
            label: 'Repository issues',
            table: 'issues',
            value: row.repo,
          }
        : null,
    ].filter((link): link is DrillThroughLink => link !== null);
  }

  return [
    {
      filterKey: 'pluginId',
      label: 'Linked issues',
      table: 'issues',
      value: row.id,
    },
  ];
}

function countRowsForLink(link: DrillThroughLink): number {
  const filters = serializeFilters([{ key: link.filterKey, op: 'eq', value: link.value }]);
  return filterRowsForTable(link.table, TABLES[link.table].rows, filters).length;
}

function navigateDrillThrough(link: DrillThroughLink) {
  const filters = serializeFilters([{ key: link.filterKey, op: 'eq', value: link.value }]);
  const targetRows = sortRows(
    filterRowsForTable(link.table, TABLES[link.table].rows, filters),
    DEFAULT_STATE.sort,
    DEFAULT_STATE.desc,
  );
  setState({
    desc: DEFAULT_STATE.desc,
    filters,
    offset: 0,
    rowId: targetRows[0]?.id ?? '',
    sort: DEFAULT_STATE.sort,
    table: link.table,
  });
}

function filterRowsForTable(table: TableKey, rows: Row[], query: string): Row[] {
  const filters = parseFilters(query, getFilterColumns(table));
  if (filters.length === 0) return rows;
  return rows.filter((row) =>
    filters.every((filter) => {
      const cellValue = String(row[filter.key] ?? '');
      if (filter.op === 'eq') {
        return cellValue.toLowerCase() === filter.value.toLowerCase();
      }
      return cellValue.toLowerCase().includes(filter.value.toLowerCase());
    }),
  );
}

function sortRows(rows: Row[], sort: keyof Row, desc: boolean): Row[] {
  const direction = desc ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = String(left[sort] ?? '');
    const rightValue = String(right[sort] ?? '');
    return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * direction;
  });
}

function parseFilters(value: string, columns: Column[]): ColumnFilter[] {
  if (!value) return [];
  const columnKeys = new Set(columns.map((column) => column.key));
  return value
    .split(',')
    .map((part) => {
      const [key, op, ...rawValueParts] = part.split('.');
      const rawValue = rawValueParts.join('.');
      if (!key || !isFilterOperator(op) || !columnKeys.has(key as keyof Row) || !rawValue) {
        return null;
      }
      const decodedValue = decodeURIComponent(rawValue).trim();
      return decodedValue ? { key: key as keyof Row, op, value: decodedValue } : null;
    })
    .filter((filter): filter is ColumnFilter => filter !== null);
}

function normalizeFilters(value: string | null, columns: Column[]): string {
  return serializeFilters(parseFilters(value?.trim() ?? DEFAULT_STATE.filters, columns));
}

function serializeFilters(filters: ColumnFilter[]): string {
  return filters
    .map((filter) => `${String(filter.key)}.${filter.op}.${encodeURIComponent(filter.value)}`)
    .join(',');
}

function isFilterOperator(value: string | undefined): value is FilterOperator {
  return value === 'eq' || value === 'ilike';
}

function scheduleChart(table: TableKey, rows: Row[]) {
  pendingChart = { rows, table };
  if (chartFrame) return;
  chartFrame = requestAnimationFrame(() => {
    chartFrame = 0;
    if (!pendingChart) return;
    renderChart(pendingChart.table, pendingChart.rows);
    pendingChart = null;
  });
}

function renderChart(table: TableKey, rows: Row[]) {
  const chartPanel = byId<HTMLElement>('chartPanel');
  const chartKey: keyof Row = table === 'plugins' ? 'health' : 'status';
  const title = chartKey === 'health' ? 'Health totals' : 'Status totals';
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[chartKey] ?? 'unknown');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((left, right) => {
    const byCount = right[1] - left[1];
    return byCount || left[0].localeCompare(right[0]);
  });

  const heading = document.createElement('h2');
  heading.className = 'chart-title';
  heading.textContent = `${title} from ${rows.length} current rows`;

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'No rows to chart';
    chartPanel.replaceChildren(heading, empty);
    return;
  }

  const maxCount = Math.max(...entries.map(([, count]) => count));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const width = 640;
  const rowHeight = 32;
  const height = entries.length * rowHeight + 18;
  svg.classList.add('chart-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} chart`);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  entries.forEach(([label, count], index) => {
    const y = index * rowHeight + 8;
    const barWidth = Math.max(2, Math.round((count / maxCount) * 360));
    const text = `${label} ${count}`;

    const labelNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelNode.setAttribute('x', '0');
    labelNode.setAttribute('y', String(y + 17));
    labelNode.textContent = label;

    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', '150');
    bar.setAttribute('y', String(y));
    bar.setAttribute('width', String(barWidth));
    bar.setAttribute('height', '20');
    bar.setAttribute('rx', '3');

    const countNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    countNode.setAttribute('x', String(160 + barWidth));
    countNode.setAttribute('y', String(y + 16));
    countNode.textContent = String(count);

    const titleNode = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleNode.textContent = text;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.append(titleNode, labelNode, bar, countNode);
    svg.append(group);
  });

  chartPanel.replaceChildren(heading, svg);
}

function renderSavedViews() {
  const savedViewSelect = byId<HTMLSelectElement>('savedViewSelect');
  const applySavedView = byId<HTMLButtonElement>('applySavedView');
  const deleteSavedView = byId<HTMLButtonElement>('deleteSavedView');
  const selectedName = savedViewSelect.value;
  const savedViews = loadSavedViews();
  savedViewSelect.replaceChildren(
    ...savedViews.map((view) => {
      const option = document.createElement('option');
      option.value = view.name;
      option.textContent = view.name;
      return option;
    }),
  );
  if (savedViews.some((view) => view.name === selectedName)) {
    savedViewSelect.value = selectedName;
  }
  const hasViews = savedViews.length > 0;
  savedViewSelect.disabled = !hasViews;
  applySavedView.disabled = !hasViews;
  deleteSavedView.disabled = !hasViews;
}

function saveCurrentView(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) return;
  const savedViews = loadSavedViews().filter((view) => view.name !== normalizedName);
  savedViews.push({
    name: normalizedName,
    search: `?${serializeState(state).toString()}`,
  });
  savedViews.sort((left, right) => left.name.localeCompare(right.name));
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  renderSavedViews();
}

function applySavedView(name: string) {
  const savedView = loadSavedViews().find((view) => view.name === name);
  if (!savedView) return;
  pendingScrollTop = 0;
  state = parseStateFromUrl(savedView.search);
  render();
  updateUrl('push');
}

function deleteSavedView(name: string) {
  const savedViews = loadSavedViews().filter((view) => view.name !== name);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  renderSavedViews();
}

function loadSavedViews(): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((view) => {
        if (
          typeof view?.name !== 'string' ||
          typeof view?.search !== 'string' ||
          !view.search.startsWith('?')
        ) {
          return null;
        }
        return {
          name: view.name,
          search: view.search,
        };
      })
      .filter((view): view is SavedView => view !== null);
  } catch {
    return [];
  }
}

function loadLastTable(): TableKey {
  try {
    return parseTable(localStorage.getItem(LAST_TABLE_KEY));
  } catch {
    return DEFAULT_STATE.table;
  }
}

function saveLastTable(table: TableKey) {
  try {
    localStorage.setItem(LAST_TABLE_KEY, table);
  } catch {
    // URL state remains authoritative when storage is unavailable.
  }
}

function loadTableScrollTop(table: TableKey): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABLE_SCROLL_KEY) ?? '{}');
    const value = parsed?.[table];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveTableScrollTop(table: TableKey, scrollTop: number) {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABLE_SCROLL_KEY) ?? '{}');
    const next = typeof parsed === 'object' && parsed !== null ? parsed : {};
    localStorage.setItem(
      TABLE_SCROLL_KEY,
      JSON.stringify({
        ...next,
        [table]: Math.max(0, Math.round(scrollTop)),
      }),
    );
  } catch {
    // Scroll persistence is a convenience layer only.
  }
}

function exportCurrentView(format: 'csv' | 'json') {
  const table = TABLES[state.table];
  const fileBase = `os-ubq-fi-${state.table}-${state.offset + 1}-${state.offset + activePageRows.length}`;

  if (format === 'csv') {
    const header = activeColumns.map((column) => encodeCsvCell(column.label)).join(',');
    const rows = activePageRows.map((row) =>
      activeColumns.map((column) => encodeCsvCell(String(row[column.key] ?? ''))).join(','),
    );
    downloadBlob(
      `\uFEFF${[header, ...rows].join('\r\n')}\r\n`,
      'text/csv;charset=utf-8',
      `${fileBase}.csv`,
    );
    return;
  }

  const payload = {
    columns: activeColumns.map((column) => ({
      key: column.key,
      label: column.label,
    })),
    meta: {
      desc: state.desc,
      exportedRows: activePageRows.length,
      filters: state.filters,
      generatedAt: new Date().toISOString(),
      limit: state.limit,
      offset: state.offset,
      rowId: state.rowId,
      sort: state.sort,
      table: state.table,
      tableLabel: table.label,
      totalRows: activeTotalRows,
    },
    rows: activePageRows.map((row) =>
      Object.fromEntries(activeColumns.map((column) => [column.key, row[column.key] ?? ''])),
    ),
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'application/json', `${fileBase}.json`);
}

function encodeCsvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

function downloadBlob(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function makeUsers(): Row[] {
  const statuses = ['active', 'pending', 'suspended'];
  return Array.from({ length: 5000 }, (_, index) => ({
    id: makeRowId('usr', index + 1),
    created: makeDate(index),
    email: `user${index + 1}@ubq.fi`,
    name: `User ${index + 1}`,
    status: statuses[index % statuses.length] ?? 'active',
  }));
}

function makeIssues(): Row[] {
  const repos = ['pay.ubq.fi', 'work.ubq.fi', 'os.ubq.fi', 'command-start-stop'];
  const statuses = ['priced', 'assigned', 'review', 'blocked'];
  return Array.from({ length: 5000 }, (_, index) => ({
    id: makeRowId('iss', index + 1),
    created: makeDate(index * 2),
    name: `Issue ${index + 1}: workflow follow-up`,
    pluginId: makeRowId('plg', ((index * 7) % 5000) + 1),
    repo: repos[index % repos.length] ?? 'os.ubq.fi',
    status: statuses[index % statuses.length] ?? 'priced',
    userId: makeRowId('usr', (index % 5000) + 1),
  }));
}

function makePlugins(): Row[] {
  const owners = ['ubiquity-os-marketplace', 'ubiquity', '0x4007'];
  const health = ['healthy', 'warning', 'failing'];
  return Array.from({ length: 5000 }, (_, index) => ({
    id: makeRowId('plg', index + 1),
    created: makeDate(index * 3),
    health: health[index % health.length] ?? 'healthy',
    name: `Plugin ${index + 1}`,
    owner: owners[index % owners.length] ?? 'ubiquity-os-marketplace',
    status: 'monitored',
  }));
}

function makeRowId(prefix: 'iss' | 'plg' | 'usr', index: number): string {
  return `${prefix}_${String(index).padStart(4, '0')}`;
}

function makeDate(offset: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const tableSelect = byId<HTMLSelectElement>('tableSelect');
  const limitSelect = byId<HTMLSelectElement>('limitSelect');
  const filterColumn = byId<HTMLSelectElement>('filterColumn');
  const filterInput = byId<HTMLInputElement>('filterInput');
  const filterOperator = byId<HTMLSelectElement>('filterOperator');
  const addFilter = byId<HTMLButtonElement>('addFilter');
  const savedViewName = byId<HTMLInputElement>('savedViewName');
  const savedViewSelect = byId<HTMLSelectElement>('savedViewSelect');
  const saveCurrentViewButton = byId<HTMLButtonElement>('saveCurrentView');
  const applySavedViewButton = byId<HTMLButtonElement>('applySavedView');
  const deleteSavedViewButton = byId<HTMLButtonElement>('deleteSavedView');
  const exportCsv = byId<HTMLButtonElement>('exportCsv');
  const exportJson = byId<HTMLButtonElement>('exportJson');
  const prevPage = byId<HTMLButtonElement>('prevPage');
  const nextPage = byId<HTMLButtonElement>('nextPage');
  const tableScroll = byId<HTMLDivElement>('tableScroll');

  tableSelect.addEventListener('change', () => {
    const table = parseTable(tableSelect.value);
    setState({
      desc: DEFAULT_STATE.desc,
      filters: '',
      offset: 0,
      rowId: '',
      sort: DEFAULT_STATE.sort,
      table,
    });
  });

  limitSelect.addEventListener('change', () => {
    setState({ limit: parseLimit(limitSelect.value), offset: 0 });
  });

  addFilter.addEventListener('click', () => {
    const value = filterInput.value.trim();
    const columns = getFilterColumns(state.table);
    const key = parseColumn(filterColumn.value, columns);
    const op = isFilterOperator(filterOperator.value) ? filterOperator.value : 'ilike';
    if (!value) return;

    setState({
      filters: serializeFilters([...parseFilters(state.filters, columns), { key, op, value }]),
      offset: 0,
      rowId: '',
    });
    filterInput.value = '';
  });

  filterInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addFilter.click();
  });

  saveCurrentViewButton.addEventListener('click', () => {
    saveCurrentView(savedViewName.value);
    savedViewName.value = '';
  });

  savedViewName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveCurrentViewButton.click();
  });

  applySavedViewButton.addEventListener('click', () => {
    applySavedView(savedViewSelect.value);
  });

  deleteSavedViewButton.addEventListener('click', () => {
    deleteSavedView(savedViewSelect.value);
  });

  exportCsv.addEventListener('click', () => {
    exportCurrentView('csv');
  });

  exportJson.addEventListener('click', () => {
    exportCurrentView('json');
  });

  prevPage.addEventListener('click', () => {
    setState({ offset: Math.max(0, state.offset - state.limit) });
  });

  nextPage.addEventListener('click', () => {
    setState({ offset: state.offset + state.limit });
  });

  window.addEventListener('popstate', () => {
    const previous = state;
    state = parseStateFromUrl(location.search);
    if (shouldResetVirtualScroll(previous, state)) {
      pendingScrollTop = 0;
    }
    render();
  });

  tableScroll.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      saveTableScrollTop(state.table, tableScroll.scrollTop);
      renderVirtualRows(
        byId<HTMLTableSectionElement>('tableBody'),
        activeColumns,
        activePageRows,
        tableScroll,
      );
    });
  });

  pendingScrollTop = loadTableScrollTop(state.table);
  render();
  requestAnimationFrame(() => {
    gridStatus = 'ready';
    render();
    updateUrl('replace');
  });
});

function shouldResetVirtualScroll(previous: ViewState, next: ViewState): boolean {
  return (
    previous.desc !== next.desc ||
    previous.filters !== next.filters ||
    previous.limit !== next.limit ||
    previous.offset !== next.offset ||
    previous.sort !== next.sort ||
    previous.table !== next.table
  );
}
