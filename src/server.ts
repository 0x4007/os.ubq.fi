const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

type IssueRow = {
  id: string;
  title: string;
  status: string;
  created: string;
};

const ISSUE_ROWS: IssueRow[] = [
  {
    id: 'iss_0001',
    title: 'Sorting header state',
    status: 'open',
    created: '2026-01-12',
  },
  {
    id: 'iss_0002',
    title: 'Plugin health monitor',
    status: 'assigned',
    created: '2026-02-04',
  },
  {
    id: 'iss_0003',
    title: 'Dynamic sitemap refresh',
    status: 'open',
    created: '2026-03-18',
  },
  {
    id: 'iss_0004',
    title: 'Contributor reward proof',
    status: 'done',
    created: '2026-04-02',
  },
];

const ISSUE_SORT_FIELDS = new Set<keyof IssueRow>(['id', 'title', 'status', 'created']);

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // API routes
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health' && req.method === 'GET') {
        const uptimeMS = Math.floor(performance.now());
        return json({ ok: true, uptimeMS });
      }

      if (pathname === '/api/time' && req.method === 'GET') {
        const now = new Date();
        return json({ iso: now.toISOString(), epochMS: now.getTime() });
      }

      if (pathname === '/api/sb/rows' && req.method === 'GET') {
        return rows(url.searchParams);
      }

      if (pathname === '/api/echo' && req.method === 'POST') {
        const ct = req.headers.get('content-type') ?? '';
        let body: unknown = null;
        if (ct.includes('application/json')) {
          body = await req.json().catch(() => null);
        } else if (ct.includes('text/plain')) {
          body = await req.text().catch(() => null);
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          const form = await req.formData();
          const obj: Record<string, string> = {};
          for (const [k, v] of form.entries()) {
            if (typeof v === 'string') obj[k] = v;
          }
          body = obj;
        } else if (ct.includes('multipart/form-data')) {
          const form = await req.formData();
          const obj: Record<string, unknown> = {};
          for (const [k, v] of form.entries()) {
            obj[k] = typeof v === 'string' ? v : { name: v.name, size: v.size };
          }
          body = obj;
        } else {
          body = await req.text().catch(() => null);
        }
        return json({ echoed: body });
      }

      return notFound();
    }

    // Static file serving for everything else.
    return await serveStatic(pathname);
  } catch (err) {
    console.error('Request error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

function rows(params: URLSearchParams): Response {
  const table = params.get('table') ?? 'issues';
  if (table !== 'issues') {
    return json({ error: `Unsupported table "${table}"` }, { status: 400 });
  }

  const requestedSort = params.get('sort') ?? 'id';
  const sort = ISSUE_SORT_FIELDS.has(requestedSort as keyof IssueRow)
    ? (requestedSort as keyof IssueRow)
    : 'id';
  const desc = params.get('desc') === 'true';
  const rows = [...ISSUE_ROWS].sort((left, right) => {
    const order = left[sort].localeCompare(right[sort]);
    return desc ? -order : order;
  });

  return json({ table, sort, desc, rows });
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

async function serveStatic(pathname: string): Promise<Response> {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relativePath.includes('..')) {
    return notFound();
  }

  try {
    const file = await Deno.readFile(`${PUBLIC_DIR}/${relativePath}`);
    return new Response(file, {
      headers: { 'content-type': contentType(relativePath) },
    });
  } catch {
    return notFound();
  }
}

function contentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

if (import.meta.main) {
  Deno.serve(
    {
      port: PORT,
      onListen: ({ hostname, port }) => {
        const host = hostname ?? 'localhost';
        console.log(`Server listening on http://${host}:${port}`);
        console.log(`Serving static files from "${PUBLIC_DIR}"`);
      },
    },
    handler,
  );
}
