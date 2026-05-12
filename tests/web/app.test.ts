import { assertEquals, assertStringIncludes } from '@std/assert';
import { computeNumericTotals, extractRows, renderTotalsSvg } from '../../src/web/app.ts';

Deno.test('extractRows unwraps current response rows without fetching', () => {
  const rows = extractRows({
    ok: true,
    status: 200,
    data: {
      echoed: [
        { open: 2, closed: '3' },
        { open: 4, closed: 1, ignored: 'n/a' },
      ],
    },
  });

  assertEquals(rows, [
    { open: 2, closed: '3' },
    { open: 4, closed: 1, ignored: 'n/a' },
  ]);
});

Deno.test('computeNumericTotals sums numeric fields from current rows', () => {
  const totals = computeNumericTotals([
    { open: 2, closed: '3' },
    { open: 4, closed: 1, ignored: 'n/a' },
  ]);

  assertEquals(totals, [
    { label: 'open', value: 6 },
    { label: 'closed', value: 4 },
  ]);
});

Deno.test('renderTotalsSvg renders escaped lightweight SVG', () => {
  const svg = renderTotalsSvg([
    { label: '<open>', value: 6 },
    { label: 'closed', value: 4 },
  ]);

  assertStringIncludes(svg, '<svg');
  assertStringIncludes(svg, '&lt;open&gt;');
  assertStringIncludes(svg, 'Totals chart: &lt;open&gt; 6, closed 4');
});
