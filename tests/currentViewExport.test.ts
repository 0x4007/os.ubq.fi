import { buildCurrentViewExport } from '../src/web/currentViewExport.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('buildCurrentViewExport preserves current columns rows and meta', () => {
  const payload = buildCurrentViewExport(
    ['id', 'status'],
    [
      { id: 'iss_0001', status: 'open', hidden: 'ignored' },
      { id: 'iss_0002', status: 'closed', hidden: 'ignored' },
    ],
    { table: 'issues', offset: 0, limit: 2 },
    new Date(0),
  );

  assertEquals(payload, {
    columns: ['id', 'status'],
    rows: [
      { id: 'iss_0001', status: 'open' },
      { id: 'iss_0002', status: 'closed' },
    ],
    meta: {
      table: 'issues',
      offset: 0,
      limit: 2,
      rowCount: 2,
      exportedAt: '1970-01-01T00:00:00.000Z',
    },
  });
});
