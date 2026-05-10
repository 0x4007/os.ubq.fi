/// <reference lib="dom" />

type TableKey = 'users' | 'issues' | 'plugins';

type Row = {
  id: string;
  created: string;
  email?: string;
  health?: string;
  name: string;
  owner?: string;
  repo?: string;
  status: string;
};

type Column = {
  key: keyof Row;
  label: string;
};

type FilterOperator = 'eq' | 'ilike';

type ColumnFilter = {
  key: keyof Row;
  op: FilterOperator;
  value: string;
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

const TABLES: Record<TableKey, { label: string; columns: Column[]; rows: Row[] }> = {
  users: {
    label: 'Users',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
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
const SAVED_VIEWS_KEY = 'os.ubq.fi.savedViews';

let state = parseStateFromUrl(location.search);
let activeColumns: Column[] = [];
let activePageRows: Row[] = [];
let activeTotalRows = 0;
let pendingScrollTop: number | null = null;
let scrollFrame = 0;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function parseStateFromUrl(search: string): ViewState {
  const params = new URLSearchParams(search);
  const table = parseTable(params.get('table'));
  const columns = TABLES[table].columns;
  const sort = parseColumn(params.get('sort'), columns);

  return {
    desc: params.get('desc') === 'true',
    filters: normalizeFilters(params.get('filters'), columns),
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
  const filtered = filterRows(table.rows, state.filters);
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

  tableSelect.value = state.table;
  limitSelect.value = String(state.limit);
  renderFilterControls(table.columns);
  renderSavedViews();
  pageSummary.textContent = `${table.label}: ${start}-${end} of ${sorted.length}`;
  prevPage.disabled = offset === 0;
  nextPage.disabled = offset + state.limit >= sorted.length;

  activeColumns = table.columns;
  activePageRows = pageRows;
  activeTotalRows = sorted.length;
  if (pendingScrollTop !== null) {
    tableScroll.scrollTop = pendingScrollTop;
    pendingScrollTop = null;
  }

  tableHead.replaceChildren(renderHeader(table.columns));
  renderVirtualRows(tableBody, table.columns, pageRows, tableScroll);
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
}

function renderEmptyRow(colSpan: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.textContent = 'No matching rows';
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
    button.type = 'button';
    button.className = 'sort-button';
    button.textContent = `${column.label}${isActive ? (state.desc ? ' ↓' : ' ↑') : ''}`;
    button.setAttribute('aria-sort', isActive ? (state.desc ? 'descending' : 'ascending') : 'none');
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
  th.textContent = 'Details';
  tr.append(th);
  return tr;
}

function renderRow(row: Row, columns: Column[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.dataset.rowId = row.id;
  if (row.id === state.rowId) {
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
  button.textContent = row.id === state.rowId ? 'Close' : 'Open';
  button.setAttribute('aria-expanded', String(row.id === state.rowId));
  button.addEventListener('click', () => {
    setState({ rowId: state.rowId === row.id ? '' : row.id });
  });
  action.append(button);
  tr.append(action);
  return tr;
}

function renderDetails(row: Row | null): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'details-panel';
  if (!row) {
    wrapper.textContent =
      'Select a row to inspect its state. The selected row is reflected in rowId=.';
    return wrapper;
  }

  const heading = document.createElement('h2');
  heading.textContent = row.name;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(row, null, 2);
  wrapper.append(heading, pre);
  return wrapper;
}

function filterRows(rows: Row[], query: string): Row[] {
  const filters = parseFilters(query, TABLES[state.table].columns);
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
    id: `usr_${String(index + 1).padStart(4, '0')}`,
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
    id: `iss_${String(index + 1).padStart(4, '0')}`,
    created: makeDate(index * 2),
    name: `Issue ${index + 1}: workflow follow-up`,
    repo: repos[index % repos.length] ?? 'os.ubq.fi',
    status: statuses[index % statuses.length] ?? 'priced',
  }));
}

function makePlugins(): Row[] {
  const owners = ['ubiquity-os-marketplace', 'ubiquity', '0x4007'];
  const health = ['healthy', 'warning', 'failing'];
  return Array.from({ length: 5000 }, (_, index) => ({
    id: `plg_${String(index + 1).padStart(4, '0')}`,
    created: makeDate(index * 3),
    health: health[index % health.length] ?? 'healthy',
    name: `Plugin ${index + 1}`,
    owner: owners[index % owners.length] ?? 'ubiquity-os-marketplace',
    status: 'monitored',
  }));
}

function makeDate(offset: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
}

window.addEventListener('DOMContentLoaded', () => {
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
    const table = TABLES[state.table];
    const key = parseColumn(filterColumn.value, table.columns);
    const op = isFilterOperator(filterOperator.value) ? filterOperator.value : 'ilike';
    if (!value) return;

    setState({
      filters: serializeFilters([
        ...parseFilters(state.filters, table.columns),
        { key, op, value },
      ]),
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
      renderVirtualRows(
        byId<HTMLTableSectionElement>('tableBody'),
        activeColumns,
        activePageRows,
        tableScroll,
      );
    });
  });

  render();
  updateUrl('replace');
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
