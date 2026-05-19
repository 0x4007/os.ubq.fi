import { handler } from '../src/server.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

Deno.test('GET /api/sb/relations returns exact issue edges when available', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/relations?table=issues&id=iss_0002'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();

  assertEquals(data.source, 'exact');
  assertEquals(data.edges, [
    {
      label: 'Reporter',
      table: 'users',
      column: 'id',
      value: 'usr_0002',
    },
    {
      label: 'Plugin',
      table: 'plugins',
      column: 'id',
      value: 'plg_0008',
    },
  ]);
});

Deno.test('GET /api/sb/relations falls back to generated labels without exact edges', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/relations?table=issues&id=iss_9999'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();

  assertEquals(data.source, 'fallback');
  assertEquals(data.edges, [
    {
      label: 'Issues record',
      table: 'issues',
      column: 'id',
      value: 'iss_9999',
    },
  ]);
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
