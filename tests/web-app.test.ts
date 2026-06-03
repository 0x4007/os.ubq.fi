import { assertEquals } from '@std/assert';
import { nextSortState, readSortState, rowsURL } from '../src/web/app.ts';

Deno.test('readSortState falls back to the default sort for invalid parameters', () => {
  const state = readSortState(new URLSearchParams('sort=missing&order=sideways'));
  assertEquals(state, { key: 'service', order: 'asc' });
});

Deno.test('nextSortState toggles order for the active header', () => {
  const state = nextSortState({ key: 'service', order: 'asc' }, 'service');
  assertEquals(state, { key: 'service', order: 'desc' });
});

Deno.test('nextSortState starts ascending for a different header', () => {
  const state = nextSortState({ key: 'service', order: 'desc' }, 'latencyMS');
  assertEquals(state, { key: 'latencyMS', order: 'asc' });
});

Deno.test('rowsURL passes sort state to /api/sb/rows', () => {
  assertEquals(
    rowsURL({ key: 'updatedAt', order: 'desc' }),
    '/api/sb/rows?sort=updatedAt&order=desc',
  );
});
