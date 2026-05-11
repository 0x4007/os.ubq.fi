import { serveDir } from '@std/http/file-server';

const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

type RelationTable = 'issues' | 'plugins' | 'users';

type RelationEdge = {
  filterKey: string;
  label: string;
  table: RelationTable;
  value: string;
};

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
        return relations(url);
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

function relations(url: URL): Response {
  const table = parseRelationTable(url.searchParams.get('table'));
  const id = url.searchParams.get('id')?.trim() ?? '';
  if (!table || !id) {
    return json({ error: 'Expected table and id query parameters' }, { status: 400 });
  }

  const edges = getExactRelations(table, id);
  if (!edges) {
    return json({ error: 'No relation row found' }, { status: 404 });
  }

  return json({
    edges,
    id,
    source: 'exact-fk-rpc',
    table,
  });
}

function parseRelationTable(value: string | null): RelationTable | null {
  return value === 'issues' || value === 'plugins' || value === 'users' ? value : null;
}

function getExactRelations(table: RelationTable, id: string): RelationEdge[] | null {
  if (table === 'users') {
    const userIndex = parseRowIndex(id, 'usr');
    if (userIndex === null) return null;
    return [
      {
        filterKey: 'userId',
        label: 'Assigned issues',
        table: 'issues',
        value: id,
      },
    ];
  }

  if (table === 'plugins') {
    const pluginIndex = parseRowIndex(id, 'plg');
    if (pluginIndex === null) return null;
    return [
      {
        filterKey: 'pluginId',
        label: 'Linked issues',
        table: 'issues',
        value: id,
      },
    ];
  }

  const issueIndex = parseRowIndex(id, 'iss');
  if (issueIndex === null) return null;
  return [
    {
      filterKey: 'id',
      label: 'Reporter',
      table: 'users',
      value: makeRowId('usr', issueIndex),
    },
    {
      filterKey: 'id',
      label: 'Plugin',
      table: 'plugins',
      value: makeRowId('plg', (((issueIndex - 1) * 7) % 5000) + 1),
    },
    {
      filterKey: 'repo',
      label: 'Repository issues',
      table: 'issues',
      value: issueRepo(issueIndex),
    },
  ];
}

function parseRowIndex(id: string, prefix: 'iss' | 'plg' | 'usr'): number | null {
  const match = new RegExp(`^${prefix}_(\\d{4})$`).exec(id);
  if (!match) return null;
  const index = Number.parseInt(match[1] ?? '', 10);
  return Number.isInteger(index) && index >= 1 && index <= 5000 ? index : null;
}

function makeRowId(prefix: 'iss' | 'plg' | 'usr', index: number): string {
  return `${prefix}_${String(index).padStart(4, '0')}`;
}

function issueRepo(index: number): string {
  const repos = ['pay.ubq.fi', 'work.ubq.fi', 'os.ubq.fi', 'command-start-stop'];
  return repos[(index - 1) % repos.length] ?? 'os.ubq.fi';
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
