import { assertEquals } from '@std/assert';
import { parseViewState, viewStateToSearch } from '../src/web/app.ts';

Deno.test('parseViewState reads deep-link parameters', () => {
  const state = parseViewState(
    new URLSearchParams(
      'table=users&offset=50&limit=25&sort=created&desc=true&filters=status:active&rowId=u_1',
    ),
  );

  assertEquals(state, {
    table: 'users',
    offset: 50,
    limit: 25,
    sort: 'created',
    desc: true,
    filters: 'status:active',
    rowId: 'u_1',
  });
});

Deno.test('parseViewState falls back for missing and invalid numeric params', () => {
  const state = parseViewState(new URLSearchParams('offset=-1&limit=abc'));

  assertEquals(state.offset, 0);
  assertEquals(state.limit, 25);
  assertEquals(state.table, 'users');
  assertEquals(state.sort, 'created');
});

Deno.test('viewStateToSearch writes stable shareable parameters', () => {
  const query = viewStateToSearch({
    table: 'orders',
    offset: 10,
    limit: 50,
    sort: 'total',
    desc: false,
    filters: '',
    rowId: 'ord_9',
  });

  assertEquals(query, 'table=orders&offset=10&limit=50&sort=total&desc=false&rowId=ord_9');
});
