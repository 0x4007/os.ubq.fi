import { assertEquals } from '@std/assert';
import {
  getCurrentViewUrl,
  normalizeSavedViewName,
  parseSavedViews,
  removeSavedView,
  saveNamedView,
  type SavedView,
} from '../src/web/app.ts';

Deno.test('normalizeSavedViewName trims whitespace and rejects blank names', () => {
  assertEquals(normalizeSavedViewName('  My   view  '), 'My view');
  assertEquals(normalizeSavedViewName('   '), null);
});

Deno.test('parseSavedViews returns only well-formed saved views', () => {
  const valid: SavedView = {
    id: 'view-1',
    name: 'Health',
    url: '/?table=health',
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  };

  assertEquals(parseSavedViews('not json'), []);
  assertEquals(parseSavedViews(JSON.stringify([valid, { name: 'missing fields' }])), [valid]);
});

Deno.test('saveNamedView creates a new saved view for the current URL', () => {
  const result = saveNamedView(
    [],
    'Health check',
    '/?table=health',
    new Date('2026-05-20T00:00:00Z'),
  );

  assertEquals(result?.mode, 'created');
  assertEquals(result?.savedViews.length, 1);
  assertEquals(result?.savedView.name, 'Health check');
  assertEquals(result?.savedView.url, '/?table=health');
});

Deno.test('saveNamedView updates an existing view with the same name', () => {
  const existing: SavedView = {
    id: 'view-1',
    name: 'Health',
    url: '/?table=health',
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  };

  const result = saveNamedView(
    [existing],
    'Health',
    '/?table=health&row=latest',
    new Date('2026-05-20T01:00:00Z'),
  );

  assertEquals(result?.mode, 'updated');
  assertEquals(result?.savedViews.length, 1);
  assertEquals(result?.savedView.id, existing.id);
  assertEquals(result?.savedView.createdAt, existing.createdAt);
  assertEquals(result?.savedView.updatedAt, '2026-05-20T01:00:00.000Z');
  assertEquals(result?.savedView.url, '/?table=health&row=latest');
});

Deno.test('removeSavedView deletes a saved view by id', () => {
  const views: SavedView[] = [
    {
      id: 'view-1',
      name: 'Health',
      url: '/?table=health',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      id: 'view-2',
      name: 'Time',
      url: '/?table=time',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ];

  assertEquals(removeSavedView(views, 'view-1'), [views[1]]);
});

Deno.test('getCurrentViewUrl keeps path, search params, and hash', () => {
  const url = new URL('https://example.com/dashboard?table=health#row-1');
  assertEquals(getCurrentViewUrl(url), '/dashboard?table=health#row-1');
});
