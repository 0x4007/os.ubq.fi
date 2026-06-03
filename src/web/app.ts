/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
export type ResultRowState = 'waiting' | 'loaded' | 'error';
export type ResultRow = { id: string; label: string; state: ResultRowState };
export type ChartBucket = { label: string; value: number };

const RESULT_STATE_LABELS: Record<ResultRowState, string> = {
  loaded: 'Loaded',
  waiting: 'Waiting',
  error: 'Errors',
};

const RESULT_STATE_ORDER: ResultRowState[] = ['loaded', 'waiting', 'error'];

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

export function computeResultTotals(rows: readonly ResultRow[]): ChartBucket[] {
  const totals = new Map<ResultRowState, number>();
  for (const state of RESULT_STATE_ORDER) {
    totals.set(state, 0);
  }
  for (const row of rows) {
    totals.set(row.state, (totals.get(row.state) ?? 0) + 1);
  }
  return RESULT_STATE_ORDER.map((state) => ({
    label: RESULT_STATE_LABELS[state],
    value: totals.get(state) ?? 0,
  }));
}

export function renderTotalsChart(buckets: readonly ChartBucket[]): string {
  const width = 420;
  const height = 170;
  const paddingX = 28;
  const chartTop = 18;
  const barGap = 14;
  const barHeight = 28;
  const labelWidth = 78;
  const maxBarWidth = width - paddingX * 2 - labelWidth - 46;
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.value));

  const bars = buckets
    .map((bucket, index) => {
      const y = chartTop + index * (barHeight + barGap);
      const barWidth = Math.round((bucket.value / maxValue) * maxBarWidth);
      const safeLabel = escapeHTML(bucket.label);
      return [
        `<text x="${paddingX}" y="${y + 19}" class="chart-label">${safeLabel}</text>`,
        `<rect x="${paddingX + labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" class="chart-bar"></rect>`,
        `<text x="${paddingX + labelWidth + barWidth + 10}" y="${y + 19}" class="chart-value">${bucket.value}</text>`,
      ].join('');
    })
    .join('');

  return `<svg class="totals-chart" role="img" aria-label="Current result totals chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function initApp() {
  const healthBtn = byId<HTMLButtonElement>('checkHealth');
  const healthOut = byId<HTMLPreElement>('healthOut');
  const timeBtn = byId<HTMLButtonElement>('getTime');
  const timeOut = byId<HTMLPreElement>('timeOut');
  const echoForm = byId<HTMLFormElement>('echoForm');
  const echoInput = byId<HTMLTextAreaElement>('echoInput');
  const echoOut = byId<HTMLPreElement>('echoOut');
  const chartBtn = byId<HTMLButtonElement>('showResultChart');
  const chartOut = byId<HTMLDivElement>('resultChart');
  const rows: ResultRow[] = [
    { id: 'health', label: 'Health', state: 'waiting' },
    { id: 'time', label: 'Time', state: 'waiting' },
    { id: 'echo', label: 'Echo', state: 'waiting' },
  ];
  let chartRendered = false;

  function setRowState(id: string, state: ResultRowState) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    row.state = state;
    if (chartRendered) renderChart();
  }

  function renderChart() {
    chartRendered = true;
    chartOut.innerHTML = renderTotalsChart(computeResultTotals(rows));
    chartBtn.textContent = 'Refresh Chart';
  }

  healthBtn.addEventListener('click', async () => {
    try {
      const res = await fetchJSON('/api/health');
      show(healthOut, res);
      setRowState('health', res.ok ? 'loaded' : 'error');
    } catch (err) {
      show(healthOut, { error: 'Request failed', details: String(err) });
      setRowState('health', 'error');
    }
  });

  timeBtn.addEventListener('click', async () => {
    try {
      const res = await fetchJSON('/api/time');
      show(timeOut, res);
      setRowState('time', res.ok ? 'loaded' : 'error');
    } catch (err) {
      show(timeOut, { error: 'Request failed', details: String(err) });
      setRowState('time', 'error');
    }
  });

  echoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bodyText = echoInput.value || '{}';
    try {
      JSON.parse(bodyText);
    } catch (err) {
      show(echoOut, { error: 'Invalid JSON', details: String(err) });
      setRowState('echo', 'error');
      return;
    }
    try {
      const res = await fetchJSON('/api/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bodyText,
      });
      show(echoOut, res);
      setRowState('echo', res.ok ? 'loaded' : 'error');
    } catch (err) {
      show(echoOut, { error: 'Request failed', details: String(err) });
      setRowState('echo', 'error');
    }
  });

  chartBtn.addEventListener('click', renderChart);
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
