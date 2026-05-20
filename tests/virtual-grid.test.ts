import { assertEquals } from '@std/assert';
import {
  createVirtualRows,
  getVirtualWindow,
  resolveSelectedRowId,
  toggleExpandedRow,
} from '../src/web/app.ts';

Deno.test('createVirtualRows builds a deterministic 5000 row dataset', () => {
  const rows = createVirtualRows(5000);

  assertEquals(rows.length, 5000);
  assertEquals(rows[0]?.id, 'row_00001');
  assertEquals(rows[4999]?.id, 'row_05000');
  assertEquals(rows[4999]?.title, 'Large dataset record 5000');
});

Deno.test('getVirtualWindow renders a small row slice with spacer heights', () => {
  const windowState = getVirtualWindow({
    scrollTop: 0,
    viewportHeight: 420,
    rowHeight: 44,
    totalRows: 5000,
    overscan: 6,
  });

  assertEquals(windowState.start, 0);
  assertEquals(windowState.end, 22);
  assertEquals(windowState.beforeHeight, 0);
  assertEquals(windowState.afterHeight, 219_032);
});

Deno.test('getVirtualWindow clamps near the bottom of the 5000 row list', () => {
  const windowState = getVirtualWindow({
    scrollTop: 220_000,
    viewportHeight: 420,
    rowHeight: 44,
    totalRows: 5000,
    overscan: 6,
  });

  assertEquals(windowState.end, 5000);
  assertEquals(windowState.afterHeight, 0);
});

Deno.test('selection and expanded row helpers preserve row ids across renders', () => {
  const rows = createVirtualRows(3);
  const expandedOnce = toggleExpandedRow(new Set(), 'row_00002');
  const expandedTwice = toggleExpandedRow(expandedOnce, 'row_00002');

  assertEquals(resolveSelectedRowId(rows, 'row_00003'), 'row_00003');
  assertEquals(resolveSelectedRowId(rows, 'missing'), 'row_00001');
  assertEquals(expandedOnce.has('row_00002'), true);
  assertEquals(expandedTwice.has('row_00002'), false);
});
