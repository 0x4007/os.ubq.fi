/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };

export type SavedView = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type SaveViewResult = {
  savedView: SavedView;
  savedViews: SavedView[];
  mode: 'created' | 'updated';
};

const SAVED_VIEWS_STORAGE_KEY = 'os.ubq.fi:savedViews';
const MAX_SAVED_VIEW_NAME_LENGTH = 80;

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

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function normalizeSavedViewName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, MAX_SAVED_VIEW_NAME_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view.id === 'string' &&
    view.id.length > 0 &&
    typeof view.name === 'string' &&
    view.name.length > 0 &&
    typeof view.url === 'string' &&
    view.url.length > 0 &&
    typeof view.createdAt === 'string' &&
    typeof view.updatedAt === 'string'
  );
}

export function parseSavedViews(value: string | null): SavedView[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

export function getCurrentViewUrl(location: Location | URL): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function saveNamedView(
  savedViews: SavedView[],
  rawName: string,
  url: string,
  now = new Date(),
): SaveViewResult | null {
  const name = normalizeSavedViewName(rawName);
  if (!name) return null;

  const timestamp = now.toISOString();
  const existingIndex = savedViews.findIndex((view) => view.name === name);

  if (existingIndex >= 0) {
    const existing = savedViews[existingIndex]!;
    const savedView = { ...existing, url, updatedAt: timestamp };
    return {
      savedView,
      savedViews: [
        savedView,
        ...savedViews.slice(0, existingIndex),
        ...savedViews.slice(existingIndex + 1),
      ],
      mode: 'updated',
    };
  }

  const savedView: SavedView = {
    id: `view-${timestamp}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    url,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    savedView,
    savedViews: [savedView, ...savedViews],
    mode: 'created',
  };
}

export function removeSavedView(savedViews: SavedView[], id: string): SavedView[] {
  return savedViews.filter((view) => view.id !== id);
}

function initSavedViews() {
  const form = byId<HTMLFormElement>('savedViewForm');
  const nameInput = byId<HTMLInputElement>('savedViewName');
  const list = byId<HTMLUListElement>('savedViewsList');
  const status = byId<HTMLParagraphElement>('savedViewsStatus');

  let savedViews = parseSavedViews(readStorage(SAVED_VIEWS_STORAGE_KEY));

  function persistAndRender(nextViews: SavedView[]) {
    savedViews = nextViews;
    writeStorage(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(savedViews));
    renderSavedViews();
  }

  function renderSavedViews() {
    list.replaceChildren();

    if (savedViews.length === 0) {
      const item = document.createElement('li');
      item.className = 'saved-view-empty';
      item.textContent = 'No saved views yet.';
      list.append(item);
      return;
    }

    for (const view of savedViews) {
      const item = document.createElement('li');
      item.className = 'saved-view-item';

      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'saved-view-apply';
      applyButton.textContent = view.name;
      applyButton.title = `Apply ${view.url}`;
      applyButton.addEventListener('click', () => {
        window.location.assign(view.url);
      });

      const urlText = document.createElement('span');
      urlText.className = 'saved-view-url';
      urlText.textContent = view.url;

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'saved-view-delete';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => {
        persistAndRender(removeSavedView(savedViews, view.id));
        status.textContent = `Deleted "${view.name}".`;
      });

      item.append(applyButton, urlText, deleteButton);
      list.append(item);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = saveNamedView(savedViews, nameInput.value, getCurrentViewUrl(window.location));
    if (!result) {
      status.textContent = 'Enter a name before saving this view.';
      return;
    }

    persistAndRender(result.savedViews);
    nameInput.value = '';
    status.textContent =
      result.mode === 'created'
        ? `Saved "${result.savedView.name}".`
        : `Updated "${result.savedView.name}".`;
  });

  renderSavedViews();
}

function initApp() {
  initSavedViews();

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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
