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

// ─── Theme toggle ──────────────────────────────────────────────────

const THEME_KEY = 'theme';
type Theme = 'light' | 'dark';

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

function applyTheme(theme: Theme, btn: HTMLButtonElement) {
  document.documentElement.dataset['theme'] = theme;
  btn.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function initTheme(btn: HTMLButtonElement) {
  const initial = getStoredTheme();
  applyTheme(initial, btn);

  btn.addEventListener('click', () => {
    const next: Theme = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next, btn);
  });
}

// ─── Main ──────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const themeBtn = byId<HTMLButtonElement>('themeToggle');
  initTheme(themeBtn);

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
});
