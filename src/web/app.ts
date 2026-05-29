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

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function setPanelState(
  el: HTMLElement,
  state: 'empty' | 'error' | 'loading' | 'ready',
  value?: unknown,
) {
  el.className = `output output--${state}`;
  el.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');

  if (state === 'loading') {
    el.textContent = 'Loading...';
    return;
  }

  if (state === 'empty') {
    el.textContent = 'No data to display yet.';
    return;
  }

  show(el, value);
}

async function loadPanel(el: HTMLElement, path: string, options: RequestInit = {}) {
  setPanelState(el, 'loading');
  try {
    const res = await fetchJSON(path, options);
    if (!res.ok) {
      setPanelState(el, 'error', { error: 'Request failed', status: res.status, details: res.data });
      return;
    }
    setPanelState(el, isEmptyValue(res.data) ? 'empty' : 'ready', res);
  } catch (err) {
    setPanelState(el, 'error', { error: 'Network request failed', details: String(err) });
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
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');

  setPanelState(healthOut, 'empty');
  setPanelState(timeOut, 'empty');
  setPanelState(echoOut, 'empty');

  healthBtn.addEventListener('click', async () => {
    await loadPanel(healthOut, '/api/health');
  });

  timeBtn.addEventListener('click', async () => {
    await loadPanel(timeOut, '/api/time');
  });

  echoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bodyText = echoInput.value || '{}';
    try {
      JSON.parse(bodyText);
    } catch (err) {
      setPanelState(echoOut, 'error', { error: 'Invalid JSON', details: String(err) });
      return;
    }
    await loadPanel(echoOut, '/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyText,
    });
  });
});
