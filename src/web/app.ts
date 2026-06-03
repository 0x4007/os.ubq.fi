/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
export type RequestState = 'empty' | 'loading' | 'success' | 'error';
export type StatusView = {
  title: string;
  message: string;
  className: string;
  busy: boolean;
  showRetry: boolean;
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

export function getStatusView(state: RequestState, label: string, details = ''): StatusView {
  switch (state) {
    case 'empty':
      return {
        title: `No ${label.toLowerCase()} response yet`,
        message: 'Run the request to populate this panel.',
        className: 'is-empty',
        busy: false,
        showRetry: false,
      };
    case 'loading':
      return {
        title: `Loading ${label.toLowerCase()}...`,
        message: 'Waiting for the server response.',
        className: 'is-loading',
        busy: true,
        showRetry: false,
      };
    case 'error':
      return {
        title: `${label} request failed`,
        message: details || 'The request did not complete. Try again.',
        className: 'is-error',
        busy: false,
        showRetry: true,
      };
    case 'success':
      return {
        title: `${label} loaded`,
        message: 'Response loaded successfully.',
        className: 'is-success',
        busy: false,
        showRetry: false,
      };
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function renderState(
  stateEl: HTMLElement,
  outputEl: HTMLElement,
  view: StatusView,
  onRetry?: () => void,
) {
  outputEl.hidden = view.className !== 'is-success';
  stateEl.hidden = view.className === 'is-success';
  stateEl.className = `state-panel ${view.className}`;
  stateEl.setAttribute('aria-busy', String(view.busy));
  stateEl.replaceChildren();

  const title = document.createElement('strong');
  title.textContent = view.title;
  stateEl.append(title);

  const message = document.createElement('span');
  message.textContent = view.message;
  stateEl.append(message);

  if (view.busy) {
    const stack = document.createElement('div');
    stack.className = 'skeleton-stack';
    stack.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      const line = document.createElement('div');
      line.className = 'skeleton-line';
      stack.append(line);
    }
    stateEl.append(stack);
  }

  if (view.showRetry && onRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry-button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', onRetry);
    stateEl.append(retry);
  }
}

function renderEmptyState(stateEl: HTMLElement, outputEl: HTMLElement, label: string) {
  renderState(stateEl, outputEl, getStatusView('empty', label));
}

export function initApp() {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthState = byId<HTMLDivElement>('healthState');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeState = byId<HTMLDivElement>('timeState');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoState = byId<HTMLDivElement>('echoState');
  const echoOut = byId<HTMLPreElement>('echoOut');

  renderEmptyState(healthState, healthOut, 'Health');
  renderEmptyState(timeState, timeOut, 'Time');
  renderEmptyState(echoState, echoOut, 'Echo');

  async function loadHealth() {
    renderState(healthState, healthOut, getStatusView('loading', 'Health'));
    try {
      const res = await fetchJSON('/api/health');
      if (!res.ok) {
        renderState(
          healthState,
          healthOut,
          getStatusView('error', 'Health', `Server returned HTTP ${res.status}.`),
          loadHealth,
        );
        return;
      }
      show(healthOut, res);
      renderState(healthState, healthOut, getStatusView('success', 'Health'));
    } catch (err) {
      renderState(
        healthState,
        healthOut,
        getStatusView('error', 'Health', String(err)),
        loadHealth,
      );
    }
  }

  async function loadTime() {
    renderState(timeState, timeOut, getStatusView('loading', 'Time'));
    try {
      const res = await fetchJSON('/api/time');
      if (!res.ok) {
        renderState(
          timeState,
          timeOut,
          getStatusView('error', 'Time', `Server returned HTTP ${res.status}.`),
          loadTime,
        );
        return;
      }
      show(timeOut, res);
      renderState(timeState, timeOut, getStatusView('success', 'Time'));
    } catch (err) {
      renderState(timeState, timeOut, getStatusView('error', 'Time', String(err)), loadTime);
    }
  }

  async function submitEcho() {
    const bodyText = echoInput.value || '{}';
    renderState(echoState, echoOut, getStatusView('loading', 'Echo'));
    try {
      JSON.parse(bodyText);
    } catch (err) {
      renderState(
        echoState,
        echoOut,
        getStatusView('error', 'Echo', `Invalid JSON: ${String(err)}`),
        submitEcho,
      );
      return;
    }
    try {
      const res = await fetchJSON('/api/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bodyText,
      });
      if (!res.ok) {
        renderState(
          echoState,
          echoOut,
          getStatusView('error', 'Echo', `Server returned HTTP ${res.status}.`),
          submitEcho,
        );
        return;
      }
      show(echoOut, res);
      renderState(echoState, echoOut, getStatusView('success', 'Echo'));
    } catch (err) {
      renderState(echoState, echoOut, getStatusView('error', 'Echo', String(err)), submitEcho);
    }
  }

  healthBtn.addEventListener('click', loadHealth);
  timeBtn.addEventListener('click', loadTime);
  echoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitEcho();
  });
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
