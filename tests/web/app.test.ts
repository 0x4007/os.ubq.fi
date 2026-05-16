import { assertEquals } from '@std/assert';
import { buildVisibleRowsCSV } from '../../src/web/csv.ts';

Deno.test('buildVisibleRowsCSV exports visible columns and excludes raw ids', () => {
  const csv = buildVisibleRowsCSV([
    {
      id: 'internal_001',
      endpoint: '/api/example',
      method: 'GET',
      description: 'Visible endpoint',
      status: 'Ready',
    },
  ]);

  assertEquals(
    csv,
    'Endpoint,Method,Description,Status\r\n/api/example,GET,Visible endpoint,Ready',
  );
  assertEquals(csv.includes('internal_001'), false);
});

Deno.test('buildVisibleRowsCSV escapes values for spreadsheet apps', () => {
  const csv = buildVisibleRowsCSV([
    {
      id: 'internal_002',
      endpoint: '/api/echo',
      method: 'POST',
      description: 'Echo "JSON", text, or form data',
      status: 'Ready\nNow',
    },
  ]);

  assertEquals(
    csv,
    'Endpoint,Method,Description,Status\r\n/api/echo,POST,"Echo ""JSON"", text, or form data","Ready\nNow"',
  );
});
