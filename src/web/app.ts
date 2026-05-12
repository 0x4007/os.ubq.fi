/// <reference lib="dom" />

type FetchJSONResult = { ok: boolean; status: number; data: unknown };
type Row = Record<string, unknown>;

export type TotalsChartEntry = { label: string; value: number };

const ROW_KEYS = ['rows', 'items', 'results'] as const;
const MAX_CHART_ROWS = 8;

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
  renderInlineTotalsChart(el, value);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function extractRows(value: unknown): Row[] {
  const current = unwrapPayload(value);

  if (Array.isArray(current)) {
    return current.filter(isRow);
  }

  if (!isRow(current)) {
    return [];
  }

  for (const key of ROW_KEYS) {
    const rows = current[key];
    if (Array.isArray(rows)) {
      return rows.filter(isRow);
    }
  }

  return [current];
}

export function computeNumericTotals(rows: Row[]): TotalsChartEntry[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    for (const [label, rawValue] of Object.entries(row)) {
      const value = toFiniteNumber(rawValue);
      if (value === null) continue;
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }

  return [...totals].map(([label, value]) => ({ label, value }));
}

export function renderTotalsSvg(entries: TotalsChartEntry[]): string {
  const visibleEntries = entries
    .filter((entry) => Number.isFinite(entry.value))
    .slice(0, MAX_CHART_ROWS);

  if (visibleEntries.length === 0) {
    return '';
  }

  const width = 420;
  const labelWidth = 124;
  const valueWidth = 74;
  const rowHeight = 30;
  const top = 30;
  const height = top + visibleEntries.length * rowHeight + 14;
  const chartWidth = width - labelWidth - valueWidth - 24;
  const maxValue = Math.max(...visibleEntries.map((entry) => Math.abs(entry.value)), 1);
  const summary = visibleEntries
    .map((entry) => `${entry.label} ${formatNumber(entry.value)}`)
    .join(', ');

  const rows = visibleEntries
    .map((entry, index) => {
      const y = top + index * rowHeight;
      const barWidth = Math.round((Math.abs(entry.value) / maxValue) * chartWidth);
      const value = formatNumber(entry.value);

      return [
        `<g transform="translate(0 ${y})">`,
        `<text x="12" y="15" fill="#9aa4af" font-size="12">${escapeXML(entry.label)}</text>`,
        `<rect x="${labelWidth}" y="3" width="${barWidth}" height="18" rx="4" fill="#7cd7ff"></rect>`,
        `<text x="${labelWidth + chartWidth + 12}" y="15" fill="#e6e8ea" font-size="12">${escapeXML(value)}</text>`,
        '</g>',
      ].join('');
    })
    .join('');

  return [
    `<svg class="inline-totals-chart__svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXML(`Totals chart: ${summary}`)}">`,
    `<title>${escapeXML(`Totals chart: ${summary}`)}</title>`,
    '<text x="12" y="18" fill="#e6e8ea" font-size="12" font-weight="700">Totals</text>',
    rows,
    '</svg>',
  ].join('');
}

function initApp() {
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

function renderInlineTotalsChart(anchor: HTMLElement, value: unknown) {
  const totals = computeNumericTotals(extractRows(value));
  const existing = getExistingChart(anchor);

  if (totals.length === 0) {
    existing?.remove();
    return;
  }

  ensureChartStyles();

  const chart = existing ?? document.createElement('div');
  chart.className = 'inline-totals-chart';
  chart.dataset.chartFor = anchor.id;
  chart.innerHTML = renderTotalsSvg(totals);

  if (!existing) {
    anchor.insertAdjacentElement('afterend', chart);
  }
}

function getExistingChart(anchor: HTMLElement): HTMLElement | null {
  const next = anchor.nextElementSibling;
  if (next instanceof HTMLElement && next.dataset.chartFor === anchor.id) {
    return next;
  }
  return null;
}

function ensureChartStyles() {
  if (document.getElementById('inlineTotalsChartStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'inlineTotalsChartStyles';
  style.textContent = `
.inline-totals-chart {
  margin: 0.75rem 0 0;
  overflow-x: auto;
}
.inline-totals-chart__svg {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid #1b1f2a;
  border-radius: 6px;
  background: #0f1115;
}
`;
  document.head.append(style);
}

function unwrapPayload(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRow(current)) {
      return current;
    }

    if (
      typeof current.ok === 'boolean' &&
      typeof current.status === 'number' &&
      'data' in current
    ) {
      current = current.data;
      continue;
    }

    if ('echoed' in current) {
      current = current.echoed;
      continue;
    }

    return current;
  }

  return current;
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  const parsed = Number(trimmed.replace(/[$,%]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeXML(value: string): string {
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
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
