import { assertEquals } from '@std/assert';
import { initApp, nextTheme, themeButtonLabel } from '../src/web/app.ts';

Deno.test('nextTheme toggles between dark and light themes', () => {
  assertEquals(nextTheme('dark'), 'light');
  assertEquals(nextTheme('light'), 'dark');
});

Deno.test('themeButtonLabel describes the next available theme', () => {
  assertEquals(themeButtonLabel('dark'), 'Light theme');
  assertEquals(themeButtonLabel('light'), 'Dark theme');
});

Deno.test('initApp is importable outside a browser document', () => {
  assertEquals(typeof initApp, 'function');
});
