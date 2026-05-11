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

Deno.test('GET /api/sb/relations returns exact issue edges', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/relations?table=issues&id=iss_0002'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.source, 'exact-fk-rpc');
  assertEquals(data.edges, [
    {
      filterKey: 'id',
      label: 'Reporter',
      table: 'users',
      value: 'usr_0002',
    },
    {
      filterKey: 'id',
      label: 'Plugin',
      table: 'plugins',
      value: 'plg_0008',
    },
    {
      filterKey: 'repo',
      label: 'Repository issues',
      table: 'issues',
      value: 'work.ubq.fi',
    },
  ]);
});

Deno.test('GET /api/sb/relations validates query params', async () => {
  const badTable = await handler(
    new Request('http://localhost/api/sb/relations?table=unknown&id=iss_0001'),
  );
  assertEquals(badTable.status, 400);

  const badId = await handler(
    new Request('http://localhost/api/sb/relations?table=issues&id=missing'),
  );
  assertEquals(badId.status, 404);
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
