/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'os.ubq.fi.theme';
const THEME_COOKIE_NAME = 'os_ubq_fi_theme';

function getThemeStorage(): Storage | undefined {
  try {
    return globalThis.window?.localStorage;
  } catch {
    return undefined;
  }
}

function readThemeCookie(): Theme | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${THEME_COOKIE_NAME}=`))
    ?.split('=')[1];
  return value === 'light' || value === 'dark' ? value : undefined;
}

function writeThemeCookie(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

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

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

export function themeButtonLabel(theme: Theme): string {
  return theme === 'dark' ? 'Light theme' : 'Dark theme';
}

function readStoredTheme(): Theme {
  const stored = getThemeStorage()?.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return readThemeCookie() ?? 'dark';
}

function applyTheme(theme: Theme, toggle: HTMLButtonElement) {
  document.documentElement.dataset.theme = theme;
  toggle.textContent = themeButtonLabel(theme);
  toggle.setAttribute('aria-pressed', String(theme === 'light'));
  getThemeStorage()?.setItem(THEME_STORAGE_KEY, theme);
  writeThemeCookie(theme);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function initApp() {
  const themeToggle = byId<HTMLButtonElement>('themeToggle');
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');
  let activeTheme = readStoredTheme();

  applyTheme(activeTheme, themeToggle);

  themeToggle.addEventListener('click', () => {
    activeTheme = nextTheme(activeTheme);
    applyTheme(activeTheme, themeToggle);
  });

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

if (typeof document !== 'undefined') {
  globalThis.addEventListener('DOMContentLoaded', initApp);
}
