/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

export type TableName = 'issues' | 'users' | 'plugins';

export type DrillRow = Readonly<{ id: string } & Record<string, string>>;

export type DrillData = Readonly<Record<TableName, readonly DrillRow[]>>;

export type DrillThroughState = {
  table: TableName;
  filterKey?: string;
  filterValue?: string;
  rowId?: string;
};

export type RelatedLink = {
  label: string;
  description: string;
  targetTable: TableName;
  filterKey: string;
  filterValue: string;
};

export const DRILL_THROUGH_DATA: DrillData = {
  users: [
    { id: 'usr_ada', name: 'Ada Lovelace', role: 'Protocol steward', team: 'Core' },
    { id: 'usr_grace', name: 'Grace Hopper', role: 'Runtime owner', team: 'Infrastructure' },
    {
      id: 'usr_katherine',
      name: 'Katherine Johnson',
      role: 'Workflow analyst',
      team: 'Operations',
    },
  ],
  plugins: [
    { id: 'plg_router', name: 'Router', category: 'Navigation', maintainerId: 'usr_ada' },
    { id: 'plg_indexer', name: 'Indexer', category: 'Data', maintainerId: 'usr_grace' },
    {
      id: 'plg_scheduler',
      name: 'Scheduler',
      category: 'Automation',
      maintainerId: 'usr_katherine',
    },
  ],
  issues: [
    {
      id: 'iss_nav',
      title: 'Add relationship drill-through',
      status: 'Ready',
      userId: 'usr_ada',
      pluginId: 'plg_router',
      repo: '0x4007/os.ubq.fi',
    },
    {
      id: 'iss_queue',
      title: 'Expose queue ownership',
      status: 'In review',
      userId: 'usr_katherine',
      pluginId: 'plg_scheduler',
      repo: '0x4007/os.ubq.fi',
    },
    {
      id: 'iss_index',
      title: 'Normalize index refresh state',
      status: 'Open',
      userId: 'usr_grace',
      pluginId: 'plg_indexer',
      repo: '0x4007/os.ubq.fi',
    },
    {
      id: 'iss_docs',
      title: 'Document router callbacks',
      status: 'Open',
      userId: 'usr_ada',
      pluginId: 'plg_router',
      repo: '0x4007/docs.ubq.fi',
    },
  ],
};

const TABLES: readonly TableName[] = ['issues', 'users', 'plugins'];

const TABLE_LABELS: Record<TableName, string> = {
  issues: 'Issues',
  users: 'Users',
  plugins: 'Plugins',
};

const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  issues: ['id', 'title', 'status', 'userId', 'pluginId', 'repo'],
  users: ['id', 'name', 'role', 'team'],
  plugins: ['id', 'name', 'category', 'maintainerId'],
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

function normalizeTableName(value: string | null): TableName {
  return TABLES.find((table) => table === value) ?? 'issues';
}

function createDrillState(
  table: TableName,
  filterKey?: string,
  filterValue?: string,
  rowId?: string,
): DrillThroughState {
  const state: DrillThroughState = { table };

  if (filterKey && filterValue !== undefined) {
    state.filterKey = filterKey;
    state.filterValue = filterValue;
  }

  if (rowId) {
    state.rowId = rowId;
  }

  return state;
}

export function parseDrillThroughState(search: string | URLSearchParams): DrillThroughState {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;

  return createDrillState(
    normalizeTableName(params.get('table')),
    params.get('filterKey')?.trim() || undefined,
    params.get('filterValue') ?? undefined,
    params.get('rowId')?.trim() || undefined,
  );
}

export function serializeDrillThroughState(state: DrillThroughState): string {
  const params = new URLSearchParams();
  params.set('table', state.table);

  if (state.filterKey && state.filterValue !== undefined) {
    params.set('filterKey', state.filterKey);
    params.set('filterValue', state.filterValue);
  }

  if (state.rowId) {
    params.set('rowId', state.rowId);
  }

  return `?${params.toString()}`;
}

export function getFilteredRows(
  table: TableName,
  state: DrillThroughState,
  data: DrillData = DRILL_THROUGH_DATA,
): readonly DrillRow[] {
  const rows = data[table];

  if (!state.filterKey || state.filterValue === undefined) {
    return rows;
  }

  const { filterKey, filterValue } = state;
  return rows.filter((row) => String(row[filterKey] ?? '') === filterValue);
}

export function resolveDrillThroughState(
  state: DrillThroughState,
  data: DrillData = DRILL_THROUGH_DATA,
): DrillThroughState {
  const filteredRows = getFilteredRows(state.table, state, data);
  const selectedRow =
    filteredRows.find((row) => row.id === state.rowId) ?? filteredRows[0] ?? data[state.table][0];

  return createDrillState(state.table, state.filterKey, state.filterValue, selectedRow?.id);
}

export function getRelatedLinks(table: TableName, row: DrillRow): RelatedLink[] {
  if (table === 'issues') {
    const links: RelatedLink[] = [];

    if (row.userId) {
      links.push({
        label: 'Reporter',
        description: `Open user ${row.userId}`,
        targetTable: 'users',
        filterKey: 'id',
        filterValue: row.userId,
      });
    }

    if (row.pluginId) {
      links.push({
        label: 'Plugin',
        description: `Open plugin ${row.pluginId}`,
        targetTable: 'plugins',
        filterKey: 'id',
        filterValue: row.pluginId,
      });
    }

    if (row.repo) {
      links.push({
        label: 'Repository issues',
        description: `Filter issues by ${row.repo}`,
        targetTable: 'issues',
        filterKey: 'repo',
        filterValue: row.repo,
      });
    }

    return links;
  }

  if (table === 'users') {
    return [
      {
        label: 'Reported issues',
        description: `Filter issues by ${row.id}`,
        targetTable: 'issues',
        filterKey: 'userId',
        filterValue: row.id,
      },
    ];
  }

  return [
    {
      label: 'Linked issues',
      description: `Filter issues by ${row.id}`,
      targetTable: 'issues',
      filterKey: 'pluginId',
      filterValue: row.id,
    },
  ];
}

export function applyDrillThroughLink(
  link: RelatedLink,
  data: DrillData = DRILL_THROUGH_DATA,
): DrillThroughState {
  return resolveDrillThroughState(
    createDrillState(link.targetTable, link.filterKey, link.filterValue),
    data,
  );
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

function findSelectedRow(state: DrillThroughState, data: DrillData = DRILL_THROUGH_DATA): DrillRow {
  const resolved = resolveDrillThroughState(state, data);
  const rows = getFilteredRows(resolved.table, resolved, data);
  const selectedRow =
    rows.find((row) => row.id === resolved.rowId) ?? rows[0] ?? data[resolved.table][0];

  if (!selectedRow) {
    throw new Error(`No rows available for ${resolved.table}`);
  }

  return selectedRow;
}

function appendTableTabs(
  container: HTMLElement,
  state: DrillThroughState,
  navigate: (nextState: DrillThroughState) => void,
) {
  const tabs = createElement('div', { className: 'drill-tabs' });

  for (const table of TABLES) {
    const button = createElement('button', { text: TABLE_LABELS[table] });
    button.type = 'button';
    button.className = table === state.table ? 'drill-tab is-active' : 'drill-tab';
    button.setAttribute('aria-pressed', String(table === state.table));
    button.addEventListener('click', () => navigate(resolveDrillThroughState({ table })));
    tabs.append(button);
  }

  container.append(tabs);
}

function appendFilterSummary(
  container: HTMLElement,
  state: DrillThroughState,
  navigate: (nextState: DrillThroughState) => void,
) {
  if (!state.filterKey || state.filterValue === undefined) {
    return;
  }

  const summary = createElement('div', {
    className: 'drill-filter',
    text: `${TABLE_LABELS[state.table]} filtered by ${state.filterKey} = ${state.filterValue}`,
  });
  const clearButton = createElement('button', { text: 'Clear' });
  clearButton.type = 'button';
  clearButton.addEventListener('click', () =>
    navigate(resolveDrillThroughState({ table: state.table })),
  );
  summary.append(clearButton);
  container.append(summary);
}

function appendRows(
  container: HTMLElement,
  state: DrillThroughState,
  navigate: (nextState: DrillThroughState) => void,
) {
  const columns = TABLE_COLUMNS[state.table];
  const rows = getFilteredRows(state.table, state);
  const list = createElement('div', { className: 'drill-rows' });
  list.style.setProperty('--drill-column-count', String(columns.length));
  const header = createElement('div', { className: 'drill-row drill-row-header' });

  for (const column of columns) {
    header.append(createElement('span', { text: column }));
  }

  list.append(header);

  for (const row of rows) {
    const button = createElement('button');
    button.type = 'button';
    button.className = row.id === state.rowId ? 'drill-row is-selected' : 'drill-row';
    button.dataset.rowId = row.id;
    button.setAttribute('aria-pressed', String(row.id === state.rowId));
    button.addEventListener('click', () =>
      navigate(createDrillState(state.table, state.filterKey, state.filterValue, row.id)),
    );

    for (const column of columns) {
      button.append(createElement('span', { text: row[column] ?? '' }));
    }

    list.append(button);
  }

  if (rows.length === 0) {
    list.append(
      createElement('p', { className: 'drill-empty', text: 'No rows match this relationship.' }),
    );
  }

  container.append(list);
}

function appendDetails(
  container: HTMLElement,
  state: DrillThroughState,
  navigate: (nextState: DrillThroughState) => void,
) {
  const selectedRow = findSelectedRow(state);
  const links = getRelatedLinks(state.table, selectedRow);
  const details = createElement('div', { className: 'drill-details' });
  const heading = createElement('h3', {
    text: selectedRow.name ?? selectedRow.title ?? selectedRow.id,
  });
  details.append(heading);

  const meta = createElement('dl', { className: 'drill-meta' });
  for (const [key, value] of Object.entries(selectedRow)) {
    const term = createElement('dt', { text: key });
    const description = createElement('dd', { text: value });
    meta.append(term, description);
  }
  details.append(meta);

  const related = createElement('div', { className: 'related-cards' });
  for (const link of links) {
    const button = createElement('button', { className: 'related-card' });
    button.type = 'button';
    button.dataset.relatedTarget = `${link.targetTable}:${link.filterKey}:${link.filterValue}`;
    const label = createElement('strong', { text: link.label });
    const description = createElement('span', { text: link.description });
    button.append(label, description);
    button.addEventListener('click', () => navigate(applyDrillThroughLink(link)));
    related.append(button);
  }

  details.append(related);
  container.append(details);
}

function renderDrillThroughExplorer(
  root: HTMLElement,
  state: DrillThroughState,
  navigate: (nextState: DrillThroughState) => void,
) {
  const resolvedState = resolveDrillThroughState(state);
  root.replaceChildren();
  root.append(createElement('h2', { text: 'Related records' }));
  appendTableTabs(root, resolvedState, navigate);
  appendFilterSummary(root, resolvedState, navigate);
  appendRows(root, resolvedState, navigate);
  appendDetails(root, resolvedState, navigate);
}

function initDrillThroughExplorer() {
  const root = document.getElementById('drillThroughExplorer');

  if (!root) {
    return;
  }

  let currentState = resolveDrillThroughState(parseDrillThroughState(window.location.search));

  const render = () => renderDrillThroughExplorer(root, currentState, navigate);

  function navigate(nextState: DrillThroughState) {
    currentState = resolveDrillThroughState(nextState);
    window.history.pushState(currentState, '', serializeDrillThroughState(currentState));
    render();
  }

  window.addEventListener('popstate', () => {
    currentState = resolveDrillThroughState(parseDrillThroughState(window.location.search));
    render();
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

  echoForm.addEventListener('submit', async (e: Event) => {
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
    initDrillThroughExplorer();
  });
}
