/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

type FilterOperator = 'eq' | 'ilike';

type IssueColumn = 'id' | 'title' | 'repo' | 'status' | 'created';

type IssueRow = Record<IssueColumn, string>;

type AppliedFilter = {
  column: IssueColumn;
  label: string;
  op: FilterOperator;
  value: string;
};

type RowsResponse = {
  table: 'issues';
  filters: AppliedFilter[];
  rows: IssueRow[];
};

const FILTER_COLUMNS: { key: IssueColumn; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'repo', label: 'Repository' },
  { key: 'status', label: 'Status' },
  { key: 'created', label: 'Created' },
  { key: 'id', label: 'ID' },
];

const FILTER_OPERATORS: Record<FilterOperator, string> = {
  eq: 'equals',
  ilike: 'contains',
};

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

export function buildPostgrestFilter(operator: FilterOperator, rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  return operator === 'ilike' ? `ilike.*${value}*` : `eq.${value}`;
}

export function parseActiveFilters(search: string): AppliedFilter[] {
  const params = new URLSearchParams(search);
  return FILTER_COLUMNS.flatMap((column) => {
    const raw = params.get(column.key);
    if (!raw) return [];

    const filter = parseFilterParam(column.key, column.label, raw);
    return filter ? [filter] : [];
  });
}

export function removeFilterFromSearch(search: string, column: IssueColumn): string {
  const params = new URLSearchParams(search);
  params.delete(column);
  return params.toString();
}

function parseFilterParam(column: IssueColumn, label: string, raw: string): AppliedFilter | null {
  const separatorIndex = raw.indexOf('.');
  if (separatorIndex <= 0) return null;

  const op = raw.slice(0, separatorIndex);
  const value = raw
    .slice(separatorIndex + 1)
    .replace(/^\*|\*$/g, '')
    .trim();
  if ((op !== 'eq' && op !== 'ilike') || !value) return null;

  return { column, label, op, value };
}

function initFilters() {
  const form = byId<HTMLFormElement>('filterForm');
  const columnSelect = byId<HTMLSelectElement>('filterColumn');
  const operatorSelect = byId<HTMLSelectElement>('filterOperator');
  const filterInput = byId<HTMLInputElement>('filterValue');

  columnSelect.replaceChildren(
    ...FILTER_COLUMNS.map((column) => {
      const option = document.createElement('option');
      option.value = column.key;
      option.textContent = column.label;
      return option;
    }),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const column = columnSelect.value as IssueColumn;
    const operator = operatorSelect.value === 'eq' ? 'eq' : 'ilike';
    const filter = buildPostgrestFilter(operator, filterInput.value);
    if (!filter) return;

    const params = new URLSearchParams(window.location.search);
    params.set(column, filter);
    history.pushState(null, '', `?${params.toString()}`);
    filterInput.value = '';
    void loadIssueRows();
  });
}

async function loadIssueRows() {
  const params = new URLSearchParams(window.location.search);
  params.set('table', 'issues');

  const result = await fetchJSON(`/api/sb/rows?${params.toString()}`);
  if (!result.ok || !isRowsResponse(result.data)) {
    renderIssueRows([]);
    renderFilterChips();
    byId<HTMLParagraphElement>('issuesStatus').textContent = 'Unable to load filtered rows.';
    return;
  }

  renderIssueRows(result.data.rows);
  renderFilterChips();
  byId<HTMLParagraphElement>('issuesStatus').textContent =
    result.data.filters.length === 0
      ? `${result.data.rows.length} issues`
      : `${result.data.rows.length} issues match ${result.data.filters.length} filter${
          result.data.filters.length === 1 ? '' : 's'
        }`;
}

function renderIssueRows(rows: IssueRow[]) {
  const tableBody = byId<HTMLTableSectionElement>('issueRows');
  if (rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = FILTER_COLUMNS.length;
    cell.textContent = 'No matching issues.';
    row.append(cell);
    tableBody.replaceChildren(row);
    return;
  }

  tableBody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement('tr');
      tr.append(
        tableCell(row.title),
        tableCell(row.repo),
        tableCell(row.status),
        tableCell(row.created),
        tableCell(row.id),
      );
      return tr;
    }),
  );
}

function renderFilterChips() {
  const chips = byId<HTMLDivElement>('filterChips');
  const filters = parseActiveFilters(window.location.search);
  chips.replaceChildren(
    ...filters.map((filter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.textContent = `${filter.label} ${FILTER_OPERATORS[filter.op]} ${filter.value} x`;
      button.setAttribute(
        'aria-label',
        `Remove ${filter.label} ${FILTER_OPERATORS[filter.op]} ${filter.value} filter`,
      );
      button.addEventListener('click', () => {
        const nextSearch = removeFilterFromSearch(window.location.search, filter.column);
        history.pushState(null, '', nextSearch ? `?${nextSearch}` : window.location.pathname);
        void loadIssueRows();
      });
      return button;
    }),
  );
}

function tableCell(value: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function isRowsResponse(data: unknown): data is RowsResponse {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<RowsResponse>;
  return (
    candidate.table === 'issues' &&
    Array.isArray(candidate.filters) &&
    Array.isArray(candidate.rows)
  );
}

function initApp() {
  initFilters();

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

  window.addEventListener('popstate', () => {
    void loadIssueRows();
  });

  void loadIssueRows();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
