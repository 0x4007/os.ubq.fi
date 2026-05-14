import { assertMatch } from '@std/assert';

const styles = await Deno.readTextFile('public/styles.css');

Deno.test('print stylesheet keeps exported pages clean and legible', () => {
  assertMatch(styles, /@media\s+print/);
  assertMatch(styles, /button,\s*textarea\s*\{/);
  assertMatch(styles, /display:\s*none\s*!important/);
  assertMatch(styles, /page-break-inside:\s*avoid/);
  assertMatch(styles, /background:\s*#fff\s*!important/);
});
