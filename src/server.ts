import { serveDir } from '@std/http/file-server';

const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

type FilterOperator = 'eq' | 'ilike';

type IssueRow = {
  id: string;
  title: string;
  repo: string;
  status: string;
  created: string;
};

type AppliedFilter = {
  column: keyof IssueRow;
  op: FilterOperator;
  value: string;
};

const ISSUE_ROWS: IssueRow[] = [
  {
    id: 'iss_1001',
    title: 'Price label sync stalls after invoice creation',
    repo: 'pay.ubq.fi',
    status: 'open',
    created: '2026-01-12',
  },
  {
    id: 'iss_1002',
    title: 'Worker startup retries hide plugin failures',
    repo: 'os.ubq.fi',
    status: 'review',
    created: '2026-02-08',
  },
  {
    id: 'iss_1003',
    title: 'Command runner drops repository filter state',
    repo: 'command-start-stop',
    status: 'open',
    created: '2026-03-03',
  },
  {
    id: 'iss_1004',
    title: 'Contributor reward proof export',
    repo: 'work.ubq.fi',
    status: 'done',
    created: '2026-03-28',
  },
  {
    id: 'iss_1005',
    title: 'Plugin registry health card is stale',
    repo: 'os.ubq.fi',
    status: 'blocked',
    created: '2026-04-16',
  },
];

const ISSUE_FILTER_COLUMNS = new Set<keyof IssueRow>(['id', 'title', 'repo', 'status', 'created']);

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

function rows(params: URLSearchParams): Response {
  const table = params.get('table') ?? 'issues';
  if (table !== 'issues') {
    return json({ error: `Unsupported table "${table}"` }, { status: 400 });
  }

  const filters = parseIssueFilters(params);
  const rows = ISSUE_ROWS.filter((row) => matchesFilters(row, filters));
  return json({ table, filters, rows });
}

function parseIssueFilters(params: URLSearchParams): AppliedFilter[] {
  const filters: AppliedFilter[] = [];

  for (const column of ISSUE_FILTER_COLUMNS) {
    const raw = params.get(column);
    if (!raw) continue;

    const filter = parsePostgrestFilter(column, raw);
    if (filter) {
      filters.push(filter);
    }
  }

  return filters;
}

function parsePostgrestFilter(column: keyof IssueRow, raw: string): AppliedFilter | null {
  const separatorIndex = raw.indexOf('.');
  if (separatorIndex <= 0) return null;

  const op = raw.slice(0, separatorIndex);
  const value = raw.slice(separatorIndex + 1).trim();
  if ((op !== 'eq' && op !== 'ilike') || !value) return null;

  return {
    column,
    op,
    value: op === 'ilike' ? value.replace(/^\*|\*$/g, '') : value,
  };
}

function matchesFilters(row: IssueRow, filters: AppliedFilter[]): boolean {
  return filters.every((filter) => {
    const actual = String(row[filter.column] ?? '').toLowerCase();
    const expected = filter.value.toLowerCase();

    return filter.op === 'eq' ? actual === expected : actual.includes(expected);
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
