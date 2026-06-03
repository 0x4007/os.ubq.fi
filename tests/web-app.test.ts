import { assertEquals, assertStringIncludes } from '@std/assert';
import { computeResultTotals, renderTotalsChart, type ResultRow } from '../src/web/app.ts';

Deno.test('computeResultTotals counts current result row states', () => {
  const rows: ResultRow[] = [
    { id: 'health', label: 'Health', state: 'loaded' },
    { id: 'time', label: 'Time', state: 'waiting' },
    { id: 'echo', label: 'Echo', state: 'error' },
  ];

  assertEquals(computeResultTotals(rows), [
    { label: 'Loaded', value: 1 },
    { label: 'Waiting', value: 1 },
    { label: 'Errors', value: 1 },
  ]);
});

Deno.test('renderTotalsChart emits an inline SVG from computed totals', () => {
  const svg = renderTotalsChart([
    { label: 'Loaded', value: 2 },
    { label: 'Waiting', value: 1 },
    { label: 'Errors & warnings', value: 0 },
  ]);

  assertStringIncludes(svg, '<svg');
  assertStringIncludes(svg, 'role="img"');
  assertStringIncludes(svg, '>2</text>');
  assertStringIncludes(svg, 'Errors &amp; warnings');
});
