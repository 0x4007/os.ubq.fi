const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

type RelationEdge = {
  label: string;
  table: string;
  column: string;
  value: string;
};

const EXACT_RELATIONS = new Map<string, RelationEdge[]>([
  [
    relationKey('issues', 'iss_0002'),
    [
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
    ],
  ],
]);

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

      if (pathname === '/api/sb/relations' && req.method === 'GET') {
        return json(resolveRelations(url.searchParams));
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

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

function resolveRelations(params: URLSearchParams) {
  const table = cleanParam(params.get('table')) ?? 'issues';
  const id = cleanParam(params.get('id')) ?? '';
  const exactEdges = EXACT_RELATIONS.get(relationKey(table, id));

  if (exactEdges) {
    return {
      table,
      id,
      source: 'exact',
      edges: exactEdges,
    };
  }

  return {
    table,
    id,
    source: 'fallback',
    edges: [
      {
        label: `${toTitleCase(table)} record`,
        table,
        column: 'id',
        value: id,
      },
    ],
  };
}

function relationKey(table: string, id: string): string {
  return `${table}:${id}`;
}

function cleanParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toTitleCase(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

async function serveStatic(pathname: string): Promise<Response> {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = requestedPath.replace(/^\/+/, '');
  const filePath = `${PUBLIC_DIR}/${normalizedPath}`;

  try {
    const file = await Deno.readFile(filePath);
    const headers = new Headers();
    const contentType = getContentType(filePath);
    if (contentType) headers.set('content-type', contentType);
    return new Response(file, { headers });
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return notFound();
    }
    throw err;
  }
}

function getContentType(filePath: string): string | null {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return null;
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
