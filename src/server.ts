import { serveDir } from '@std/http/file-server';

const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

type SortKey = 'service' | 'status' | 'latencyMS' | 'updatedAt';
type SortOrder = 'asc' | 'desc';
type SBRow = { service: string; status: string; latencyMS: number; updatedAt: string };

const SORT_KEYS: SortKey[] = ['service', 'status', 'latencyMS', 'updatedAt'];
const DEFAULT_SORT_KEY: SortKey = 'service';
const DEFAULT_SORT_ORDER: SortOrder = 'asc';
const SB_ROWS: SBRow[] = [
  { service: 'api', status: 'ok', latencyMS: 34, updatedAt: '2026-06-03T02:10:00.000Z' },
  { service: 'worker', status: 'queued', latencyMS: 88, updatedAt: '2026-06-03T02:13:00.000Z' },
  { service: 'web', status: 'ok', latencyMS: 21, updatedAt: '2026-06-03T02:11:00.000Z' },
];

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
        const sort = readSortKey(url.searchParams.get('sort'));
        const order = readSortOrder(url.searchParams.get('order'));
        return json({ sort, order, rows: sortRows(SB_ROWS, sort, order) });
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

    // Static file serving for everything else
    return await serveDir(req, {
      fsRoot: PUBLIC_DIR,
      showIndex: true,
      quiet: true,
    });
  } catch (err) {
    console.error('Request error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function readSortKey(value: string | null): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : DEFAULT_SORT_KEY;
}

function readSortOrder(value: string | null): SortOrder {
  return value === 'desc' ? 'desc' : DEFAULT_SORT_ORDER;
}

export function sortRows(rows: SBRow[], sort: SortKey, order: SortOrder): SBRow[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[sort];
    const bValue = b[sort];
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction;
    }
    return String(aValue).localeCompare(String(bValue)) * direction;
  });
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
