import { assertEquals } from '@std/assert';
import { getStatusView } from '../src/web/app.ts';

Deno.test('getStatusView describes empty panels without retry', () => {
  assertEquals(getStatusView('empty', 'Health'), {
    title: 'No health response yet',
    message: 'Run the request to populate this panel.',
    className: 'is-empty',
    busy: false,
    showRetry: false,
  });
});

Deno.test('getStatusView marks loading panels as busy skeleton states', () => {
  assertEquals(getStatusView('loading', 'Time'), {
    title: 'Loading time...',
    message: 'Waiting for the server response.',
    className: 'is-loading',
    busy: true,
    showRetry: false,
  });
});

Deno.test('getStatusView exposes retryable error banners', () => {
  assertEquals(getStatusView('error', 'Echo', 'Invalid JSON'), {
    title: 'Echo request failed',
    message: 'Invalid JSON',
    className: 'is-error',
    busy: false,
    showRetry: true,
  });
});
