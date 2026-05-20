import { assertEquals } from '@std/assert';
import {
  buildPostgrestFilter,
  parseActiveFilters,
  removeFilterFromSearch,
} from '../src/web/app.ts';

Deno.test('buildPostgrestFilter creates eq and ilike expressions', () => {
  assertEquals(buildPostgrestFilter('eq', ' open '), 'eq.open');
  assertEquals(buildPostgrestFilter('ilike', ' plugin '), 'ilike.*plugin*');
  assertEquals(buildPostgrestFilter('eq', '   '), null);
});

Deno.test('parseActiveFilters reads supported filters from URL search', () => {
  assertEquals(parseActiveFilters('?status=eq.open&title=ilike.*plugin*&ignored=eq.nope'), [
    { column: 'title', label: 'Title', op: 'ilike', value: 'plugin' },
    { column: 'status', label: 'Status', op: 'eq', value: 'open' },
  ]);
});

Deno.test('removeFilterFromSearch drops one column filter and keeps the rest', () => {
  assertEquals(
    removeFilterFromSearch('?status=eq.open&title=ilike.*plugin*', 'status'),
    'title=ilike.*plugin*',
  );
});
