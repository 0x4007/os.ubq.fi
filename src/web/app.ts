/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
type RelationEdge = { label: string; table: string; column: string; value: string };
type RelationsPayload = {
  source: string;
  edges: RelationEdge[];
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

function isRelationsPayload(value: unknown): value is RelationsPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.source === 'string' && Array.isArray(payload.edges);
}

function showRelations(el: HTMLElement, value: unknown) {
  el.replaceChildren();
  if (!isRelationsPayload(value)) return;

  for (const edge of value.edges) {
    const item = document.createElement('span');
    item.className = `relation-pill relation-pill--${value.source}`;
    item.textContent = `${edge.label}: ${edge.table}.${edge.column} = ${edge.value}`;
    el.append(item);
  }
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
  const relationsForm = byId<HTMLFormElement>('relationsForm');
  const relationsTable = byId<HTMLInputElement>('relationsTable');
  const relationsId = byId<HTMLInputElement>('relationsId');
  const relationsList = byId<HTMLDivElement>('relationsList');
  const relationsOut = byId<HTMLPreElement>('relationsOut');
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

  relationsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const params = new URLSearchParams({
      table: relationsTable.value.trim() || 'issues',
      id: relationsId.value.trim(),
    });
    const res = await fetchJSON(`/api/sb/relations?${params.toString()}`);
    showRelations(relationsList, res.data);
    show(relationsOut, res);
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
});
