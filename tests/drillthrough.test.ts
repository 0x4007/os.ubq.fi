import { assertEquals, assertExists } from '@std/assert';
import {
  applyDrillThroughLink,
  DRILL_THROUGH_DATA,
  getFilteredRows,
  getRelatedLinks,
  parseDrillThroughState,
  resolveDrillThroughState,
  serializeDrillThroughState,
} from '../src/web/app.ts';

Deno.test('parseDrillThroughState reads URL-backed table, filter, and row selection', () => {
  const state = parseDrillThroughState(
    '?table=users&filterKey=id&filterValue=usr_ada&rowId=usr_ada',
  );

  assertEquals(state, {
    table: 'users',
    filterKey: 'id',
    filterValue: 'usr_ada',
    rowId: 'usr_ada',
  });
  assertEquals(
    serializeDrillThroughState(state),
    '?table=users&filterKey=id&filterValue=usr_ada&rowId=usr_ada',
  );
});

Deno.test(
  'applyDrillThroughLink filters the target table and selects the first matching row',
  () => {
    const issue = DRILL_THROUGH_DATA.issues[0];
    assertExists(issue);
    const reporterLink = getRelatedLinks('issues', issue).find((link) => link.label === 'Reporter');
    assertExists(reporterLink);

    const state = applyDrillThroughLink(reporterLink);

    assertEquals(state, {
      table: 'users',
      filterKey: 'id',
      filterValue: 'usr_ada',
      rowId: 'usr_ada',
    });
    assertEquals(
      getFilteredRows(state.table, state).map((row) => row.id),
      ['usr_ada'],
    );
  },
);

Deno.test('repository related links stay on issues and select the first issue in that repo', () => {
  const issue = DRILL_THROUGH_DATA.issues[0];
  assertExists(issue);
  const repoLink = getRelatedLinks('issues', issue).find(
    (link) => link.label === 'Repository issues',
  );
  assertExists(repoLink);

  const state = applyDrillThroughLink(repoLink);

  assertEquals(state.table, 'issues');
  assertEquals(state.filterKey, 'repo');
  assertEquals(state.filterValue, '0x4007/os.ubq.fi');
  assertEquals(state.rowId, 'iss_nav');
});

Deno.test(
  'resolveDrillThroughState keeps history-restored filters and repairs stale row ids',
  () => {
    const state = resolveDrillThroughState({
      table: 'issues',
      filterKey: 'pluginId',
      filterValue: 'plg_router',
      rowId: 'missing',
    });

    assertEquals(state, {
      table: 'issues',
      filterKey: 'pluginId',
      filterValue: 'plg_router',
      rowId: 'iss_nav',
    });
  },
);
