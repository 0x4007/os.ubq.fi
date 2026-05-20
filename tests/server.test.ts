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

Deno.test('GET /api/sb/rows filters issues with PostgREST eq operator', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/rows?table=issues&status=eq.open'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.rows.length, 2);
  assertEquals(data.filters, [{ column: 'status', op: 'eq', value: 'open' }]);
  assertEquals(
    data.rows.every((row: { status: string }) => row.status === 'open'),
    true,
  );
});

Deno.test('GET /api/sb/rows filters issues with PostgREST ilike operator', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/rows?table=issues&title=ilike.*plugin*'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.rows.length, 2);
  assertEquals(
    data.rows.every((row: { title: string }) => /plugin/i.test(row.title)),
    true,
  );
});

Deno.test('GET /api/sb/rows combines column filters', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/rows?table=issues&repo=eq.os.ubq.fi&status=eq.blocked'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(
    data.rows.map((row: { id: string }) => row.id),
    ['iss_1005'],
  );
});

Deno.test('GET /api/sb/rows rejects unsupported tables', async () => {
  const res = await handler(new Request('http://localhost/api/sb/rows?table=users'));
  assertEquals(res.status, 400);
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
