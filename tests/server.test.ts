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

Deno.test('GET /api/sb/rows sorts issues by header field ascending', async () => {
  const res = await handler(new Request('http://localhost/api/sb/rows?table=issues&sort=title'));
  assertEquals(res.status, 200);
  const data = await res.json();

  assertEquals(data.sort, 'title');
  assertEquals(data.desc, false);
  assertEquals(
    data.rows.map((row: { title: string }) => row.title),
    [
      'Contributor reward proof',
      'Dynamic sitemap refresh',
      'Plugin health monitor',
      'Sorting header state',
    ],
  );
});

Deno.test('GET /api/sb/rows sorts issues by header field descending', async () => {
  const res = await handler(
    new Request('http://localhost/api/sb/rows?table=issues&sort=created&desc=true'),
  );
  assertEquals(res.status, 200);
  const data = await res.json();

  assertEquals(data.sort, 'created');
  assertEquals(data.desc, true);
  assertEquals(
    data.rows.map((row: { id: string }) => row.id),
    ['iss_0004', 'iss_0003', 'iss_0002', 'iss_0001'],
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
