/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
type IssueRow = {
  id: string;
  title: string;
  status: string;
  created: string;
};

type RowsResponse = {
  sort: keyof IssueRow;
  desc: boolean;
  rows: IssueRow[];
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

window.addEventListener('DOMContentLoaded', () => {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const issueRows = byId<HTMLTableSectionElement>('issueRows');
  const issueInspector = byId<HTMLElement>('issueInspector');
  const sortHeaders = [...document.querySelectorAll<HTMLButtonElement>('.sort-header')];
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

  async function loadIssueRows() {
    const params = new URLSearchParams(window.location.search);
    const sort = params.get('sort') ?? 'id';
    const desc = params.get('desc') === 'true';
    const res = await fetchJSON(
      `/api/sb/rows?table=issues&sort=${encodeURIComponent(sort)}&desc=${desc}`,
    );

    if (!res.ok || !isRowsResponse(res.data)) {
      issueRows.innerHTML = `<tr><td colspan="4">Unable to load rows.</td></tr>`;
      return;
    }

    issueRows.replaceChildren(
      ...res.data.rows.map((row) => {
        const isSelected = params.get('rowId') === row.id;
        const tr = document.createElement('tr');
        tr.className = 'row-link';
        tr.tabIndex = 0;
        tr.dataset.rowId = row.id;
        tr.setAttribute('aria-selected', String(isSelected));
        tr.addEventListener('click', () => selectIssueRow(row));
        tr.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          selectIssueRow(row);
        });
        tr.append(cell(row.id), cell(row.title), cell(row.status), cell(row.created));
        return tr;
      }),
    );

    const rowId = params.get('rowId');
    const selected = rowId ? res.data.rows.find((row) => row.id === rowId) : null;
    renderIssueInspector(selected ?? null, rowId);

    for (const button of sortHeaders) {
      const isActive = button.dataset.sort === res.data.sort;
      button.setAttribute(
        'aria-sort',
        isActive ? (res.data.desc ? 'descending' : 'ascending') : 'none',
      );
      const indicator = button.querySelector('span');
      if (indicator) indicator.textContent = isActive ? (res.data.desc ? '↓' : '↑') : '';
    }
  }

  function selectIssueRow(row: IssueRow) {
    const params = new URLSearchParams(window.location.search);
    params.set('rowId', row.id);
    history.pushState(null, '', `?${params.toString()}`);
    for (const tr of issueRows.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]')) {
      tr.setAttribute('aria-selected', String(tr.dataset.rowId === row.id));
    }
    renderIssueInspector(row, row.id);
  }

  function renderIssueInspector(row: IssueRow | null, requestedRowId: string | null) {
    if (!row) {
      const message = requestedRowId
        ? `No issue row found for ${requestedRowId}.`
        : 'Select a row or open a URL with rowId.';
      issueInspector.replaceChildren(inspectorItem('Status', message));
      return;
    }

    issueInspector.replaceChildren(
      inspectorItem('ID', row.id),
      inspectorItem('Title', row.title),
      inspectorItem('Status', row.status),
      inspectorItem('Created', row.created),
    );
  }

  for (const button of sortHeaders) {
    button.addEventListener('click', () => {
      const params = new URLSearchParams(window.location.search);
      const nextSort = button.dataset.sort ?? 'id';
      const currentSort = params.get('sort') ?? 'id';
      const currentDesc = params.get('desc') === 'true';
      params.set('sort', nextSort);
      params.set('desc', String(currentSort === nextSort ? !currentDesc : false));
      history.pushState(null, '', `?${params.toString()}`);
      void loadIssueRows();
    });
  }

  window.addEventListener('popstate', () => {
    void loadIssueRows();
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

  void loadIssueRows();
});

function cell(value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = value;
  return td;
}

function inspectorItem(label: string, value: string): HTMLDivElement {
  const item = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value;
  item.append(dt, dd);
  return item;
}

function isRowsResponse(data: unknown): data is RowsResponse {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<RowsResponse>;
  return (
    typeof candidate.sort === 'string' &&
    typeof candidate.desc === 'boolean' &&
    Array.isArray(candidate.rows)
  );
}
