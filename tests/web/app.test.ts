import { assertEquals } from '@std/assert';
import { parseStoredScrollTop, resolveInitialTable } from '../../src/web/app.ts';

Deno.test('resolveInitialTable prefers valid URL table', () => {
  assertEquals(resolveInitialTable('time', 'echo'), 'time');
});

Deno.test('resolveInitialTable falls back to stored table', () => {
  assertEquals(resolveInitialTable(null, 'echo'), 'echo');
});

Deno.test('resolveInitialTable ignores invalid values', () => {
  assertEquals(resolveInitialTable('unknown', 'also-unknown'), 'health');
});

Deno.test('parseStoredScrollTop accepts non-negative numbers', () => {
  assertEquals(parseStoredScrollTop('42'), 42);
  assertEquals(parseStoredScrollTop('0'), 0);
});

Deno.test('parseStoredScrollTop rejects invalid values', () => {
  assertEquals(parseStoredScrollTop(null), 0);
  assertEquals(parseStoredScrollTop('-1'), 0);
  assertEquals(parseStoredScrollTop('not-a-number'), 0);
});
