import { assertEquals } from '@std/assert';
import { handler } from '../src/server.ts';

Deno.test('GET /api/health returns ok', async () => {
  const res = await handler(new Request('http://localhost/api/health'));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  // uptimeMS is a number
  assertEquals(typeof data.uptimeMS, 'number');
});

Deno.test('GET /api/time returns iso timestamp', async () => {
  const res = await handler(new Request('http://localhost/api/time'));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(typeof data.iso, 'string');
  assertEquals(typeof data.epochMS, 'number');
});

Deno.test('GET /api/sb/rows sorts rows by query parameters', async () => {
  const res = await handler(new Request('http://localhost/api/sb/rows?sort=latencyMS&order=desc'));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.sort, 'latencyMS');
  assertEquals(data.order, 'desc');
  assertEquals(
    data.rows.map((row: { latencyMS: number }) => row.latencyMS),
    [88, 34, 21],
  );
});

Deno.test('POST /api/echo returns same JSON', async () => {
  const payload = { hello: 'world' };
  const res = await handler(
    new Request('http://localhost/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.echoed.hello, 'world');
});

Deno.test('GET / serves index.html', async () => {
  const res = await handler(new Request('http://localhost/'));
  assertEquals(res.status, 200);
  const ct = res.headers.get('content-type') ?? '';
  // Drain the body to avoid resource leaks in tests
  await res.text();
  const isHTML = ct.includes('text/html');
  assertEquals(isHTML, true);
});
