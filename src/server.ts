import { serveDir } from '@std/http/file-server';
import '@std/dotenv/load';

const PUBLIC_DIR = Deno.env.get('PUBLIC_DIR') ?? 'public';
const PORT = Number.parseInt(Deno.env.get('PORT') ?? '8000');

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // API routes
    if (pathname.startsWith('/api/')) {
      // Health
      if (pathname === '/api/health' && req.method === 'GET') {
        const uptimeMS = Math.floor(performance.now());
        return json({ ok: true, uptimeMS });
      }

      // Server time
      if (pathname === '/api/time' && req.method === 'GET') {
        const now = new Date();
        return json({ iso: now.toISOString(), epochMS: now.getTime() });
      }

      // Echo helper
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

      // Supabase: list available tables (via OpenAPI spec)
      if (pathname === '/api/sb/tables' && req.method === 'GET') {
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const spec = await getOpenAPISpec(cfg.value);
        if (!spec.ok) return json({ error: spec.error }, { status: 502 });
        const list = Array.from(spec.value.tables).sort((a, b) => a.localeCompare(b));
        return json({ tables: list });
      }

      // Supabase: fetch rows from a table
      if (pathname === '/api/sb/rows' && req.method === 'GET') {
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const { url: sbUrl, serviceRoleKey } = cfg.value;
        const table = url.searchParams.get('table');
        if (!table) return json({ error: 'Missing "table" param' }, { status: 400 });
        const select = url.searchParams.get('select') ?? '*';
        const schema = url.searchParams.get('schema') ?? 'public';
        const limit = clampInt(url.searchParams.get('limit'), 1, 1000, 100);
        const offset = clampInt(url.searchParams.get('offset'), 0, 1_000_000, 0);
        const order = url.searchParams.get('order') ?? '';
        const desc = (url.searchParams.get('desc') ?? 'false').toLowerCase() === 'true';

        const qs = new URLSearchParams();
        qs.set('select', select);
        qs.set('limit', String(limit));
        if (offset > 0) qs.set('offset', String(offset));
        if (order) qs.set('order', `${order}.${desc ? 'desc' : 'asc'}`);

        const target = `${sbUrl}/rest/v1/${encodeURIComponent(table)}?${qs.toString()}`;
        const res2 = await fetch(target, {
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            accept: 'application/json',
            prefer: 'count=exact',
            'accept-profile': schema, // choose schema (defaults to public)
          },
        });
        const text = await res2.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : [];
        } catch {
          data = text;
        }
        const range = res2.headers.get('content-range') ?? '';
        const total = parseTotalFromContentRange(range);
        if (!res2.ok) {
          return json(
            {
              error: 'Supabase query failed',
              status: res2.status,
              details: typeof data === 'string' ? data : undefined,
            },
            { status: 502 },
          );
        }
        return json({ rows: Array.isArray(data) ? data : [], total, limit, offset });
      }

      // Supabase: fetch columns for a table (parsed from OpenAPI spec)
      if (pathname === '/api/sb/columns' && req.method === 'GET') {
        const table = url.searchParams.get('table');
        if (!table) return json({ error: 'Missing "table" param' }, { status: 400 });
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const spec = await getOpenAPISpec(cfg.value);
        if (!spec.ok) return json({ error: spec.error }, { status: 502 });
        const cols = spec.value.columnsByTable.get(table);
        if (!cols) return json({ error: `Unknown table: ${table}` }, { status: 404 });
        return json({ columns: cols });
      }

      // Supabase: discover relationships (prefers exact RPC if available; otherwise heuristic)
      if (pathname === '/api/sb/relations' && req.method === 'GET') {
        const focus = url.searchParams.get('table');
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const exact = await fetchRelationsFromRPC(cfg.value);
        if (exact.ok) {
          if (focus) {
            const r = exact.byTable.get(focus);
            if (!r) return json({ outbound: [], inbound: [] });
            return json(r);
          }
          return json({
            relations: Array.from(exact.byTable.entries()).map(([table, v]) => ({ table, ...v })),
          });
        }
        const spec = await getOpenAPISpec(cfg.value);
        if (!spec.ok) return json({ error: spec.error }, { status: 502 });
        const rel = buildHeuristicRelations(spec.value);
        if (focus) {
          const r = rel.byTable.get(focus);
          if (!r) return json({ outbound: [], inbound: [] });
          return json(r);
        }
        return json({
          relations: Array.from(rel.byTable.entries()).map(([table, v]) => ({ table, ...v })),
        });
      }

      // Supabase: fetch a single row by primary key (default 'id')
      if (pathname === '/api/sb/row' && req.method === 'GET') {
        const table = url.searchParams.get('table');
        const id = url.searchParams.get('id');
        const pk = url.searchParams.get('pk') ?? 'id';
        if (!table || !id) return json({ error: 'Missing "table" or "id"' }, { status: 400 });
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const { url: sbUrl, serviceRoleKey } = cfg.value;
        const target = `${sbUrl}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(pk)}=eq.${encodeURIComponent(id)}&limit=1`;
        const res2 = await fetch(target, {
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            accept: 'application/json',
            prefer: 'count=none',
          },
        });
        if (!res2.ok)
          return json({ error: 'Row fetch failed', status: res2.status }, { status: 502 });
        const rows = (await res2.json().catch(() => [])) as unknown[];
        return json({ row: Array.isArray(rows) ? (rows[0] ?? null) : null });
      }

      // Supabase: related (outbound) — fetch referenced rows for *_id columns
      if (pathname === '/api/sb/outbound' && req.method === 'GET') {
        const table = url.searchParams.get('table');
        const id = url.searchParams.get('id');
        const pk = url.searchParams.get('pk') ?? 'id';
        if (!table || !id) return json({ error: 'Missing "table" or "id"' }, { status: 400 });
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const spec = await getOpenAPISpec(cfg.value);
        if (!spec.ok) return json({ error: spec.error }, { status: 502 });
        const rel = buildHeuristicRelations(spec.value);
        const tableInfo = rel.byTable.get(table);
        if (!tableInfo) return json({ error: `Unknown table: ${table}` }, { status: 404 });
        // fetch base row
        const base = await fetchJSONFromRest(
          cfg.value,
          table,
          `${encodeURIComponent(pk)}=eq.${encodeURIComponent(id)}&limit=1`,
        );
        if (!base.ok) return json({ error: base.error, status: base.status }, { status: 502 });
        const row = Array.isArray(base.data)
          ? (base.data[0] as Record<string, unknown> | undefined)
          : undefined;
        if (!row) return json({ refs: [] });
        const out = tableInfo.outbound;
        const results: Array<{ column: string; toTable: string; row: unknown | null }> = [];
        for (const o of out) {
          const val = row[o.fromColumn as keyof typeof row] as unknown;
          if (val == null) {
            results.push({ column: o.fromColumn, toTable: o.toTable, row: null });
            continue;
          }
          const r = await fetchJSONFromRest(
            cfg.value,
            o.toTable,
            `id=eq.${encodeURIComponent(String(val))}&limit=1`,
          );
          if (r.ok) {
            const rr = Array.isArray(r.data) ? (r.data[0] ?? null) : null;
            results.push({ column: o.fromColumn, toTable: o.toTable, row: rr });
          } else {
            results.push({ column: o.fromColumn, toTable: o.toTable, row: null });
          }
        }
        return json({ refs: results });
      }

      // Supabase: related (inbound) — fetch rows that reference this row
      if (pathname === '/api/sb/inbound' && req.method === 'GET') {
        const table = url.searchParams.get('table');
        const id = url.searchParams.get('id');
        const pk = url.searchParams.get('pk') ?? 'id';
        const limit = clampInt(url.searchParams.get('limit'), 1, 100, 10);
        if (!table || !id) return json({ error: 'Missing "table" or "id"' }, { status: 400 });
        const cfg = readSupabaseConfig();
        if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });
        const spec = await getOpenAPISpec(cfg.value);
        if (!spec.ok) return json({ error: spec.error }, { status: 502 });
        const rel = buildHeuristicRelations(spec.value);
        const tableInfo = rel.byTable.get(table);
        if (!tableInfo) return json({ error: `Unknown table: ${table}` }, { status: 404 });
        const results: Array<{
          fromTable: string;
          fromColumn: string;
          rows: unknown[];
          total: number | null;
        }> = [];
        for (const inc of tableInfo.inbound) {
          const qs = `${encodeURIComponent(inc.fromColumn)}=eq.${encodeURIComponent(id)}&limit=${limit}`;
          const r = await fetchJSONFromRest(cfg.value, inc.fromTable, qs, true);
          if (r.ok) {
            results.push({
              fromTable: inc.fromTable,
              fromColumn: inc.fromColumn,
              rows: Array.isArray(r.data) ? (r.data as unknown[]) : [],
              total: r.total,
            });
          } else {
            results.push({
              fromTable: inc.fromTable,
              fromColumn: inc.fromColumn,
              rows: [],
              total: 0,
            });
          }
        }
        return json({ refs: results, pk });
      }

      // GitHub: fetch user by numeric id (lazy, cached)
      if (pathname === '/api/gh/user' && req.method === 'GET') {
        const idStr = url.searchParams.get('id');
        if (!idStr) return json({ error: 'Missing "id" param' }, { status: 400 });
        const id = Number.parseInt(idStr);
        if (!Number.isFinite(id)) return json({ error: 'Invalid id' }, { status: 400 });
        const user = await getGitHubUser(id);
        if (!user.ok) return json({ error: user.error }, { status: 502 });
        return json({
          id: user.value.id,
          login: user.value.login,
          name: user.value.name,
          avatar_url: user.value.avatar_url,
          html_url: user.value.html_url,
        });
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

type SupabaseCfg = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

function readSupabaseConfig(): { ok: true; value: SupabaseCfg } | { ok: false; error: string } {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!url) return { ok: false, error: 'Missing SUPABASE_URL' };
  if (!anonKey) return { ok: false, error: 'Missing SUPABASE_ANON_KEY' };
  if (!serviceRoleKey) return { ok: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' };
  return { ok: true, value: { url, anonKey, serviceRoleKey } };
}

function clampInt(val: string | null, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(val ?? '');
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseTotalFromContentRange(h: string): number | null {
  // Format: "0-9/123" or "*/0"
  const m = h.match(/\/(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!);
  return Number.isFinite(n) ? n : null;
}

// ---- Supabase OpenAPI helpers ----

type OpenAPISpec = {
  definitions?: Record<string, { properties?: Record<string, { type?: string }> }>;
  paths?: Record<string, unknown>;
};

type OpenAPISummary = {
  tables: Set<string>;
  columnsByTable: Map<string, Array<{ name: string; type: string }>>;
};

let openApiCache: { at: number; value: OpenAPISummary } | null = null;

async function getOpenAPISpec(
  cfg: SupabaseCfg,
): Promise<{ ok: true; value: OpenAPISummary } | { ok: false; error: string }> {
  const now = Date.now();
  if (openApiCache && now - openApiCache.at < 60_000) {
    return { ok: true, value: openApiCache.value };
  }
  const res = await fetch(`${cfg.url}/rest/v1/`, {
    headers: { apikey: cfg.anonKey, accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `OpenAPI fetch failed: ${res.status} ${text.slice(0, 200)}` };
  }
  const spec = (await res.json().catch(() => null)) as OpenAPISpec | null;
  if (!spec) return { ok: false, error: 'Invalid OpenAPI JSON' };
  const tables = new Set<string>();
  const cols = new Map<string, Array<{ name: string; type: string }>>();
  if (spec.definitions) {
    for (const [t, def] of Object.entries(spec.definitions)) {
      tables.add(t);
      const properties = def?.properties ?? {};
      const arr: Array<{ name: string; type: string }> = [];
      for (const [name, meta] of Object.entries(properties)) {
        arr.push({ name, type: meta?.type ?? 'unknown' });
      }
      cols.set(t, arr);
    }
  }
  if (spec.paths) {
    for (const p of Object.keys(spec.paths)) {
      if (p === '/' || p.startsWith('/rpc')) continue;
      const n = p.replace(/^\//, '').trim();
      if (n) tables.add(n);
      if (!cols.has(n)) cols.set(n, []);
    }
  }
  openApiCache = { at: now, value: { tables, columnsByTable: cols } };
  return { ok: true, value: openApiCache.value };
}

function pluralCandidates(base: string): string[] {
  const out = new Set<string>();
  out.add(base);
  if (!base.endsWith('s')) out.add(base + 's');
  if (base.endsWith('y')) out.add(base.slice(0, -1) + 'ies');
  if (base.endsWith('s')) out.add(base + 'es');
  return Array.from(out);
}

function buildHeuristicRelations(summary: OpenAPISummary): {
  byTable: Map<
    string,
    {
      outbound: Array<{ fromColumn: string; toTable: string }>;
      inbound: Array<{ fromTable: string; fromColumn: string }>;
    }
  >;
} {
  const byTable = new Map<
    string,
    {
      outbound: Array<{ fromColumn: string; toTable: string }>;
      inbound: Array<{ fromTable: string; fromColumn: string }>;
    }
  >();
  const tables = summary.tables;
  const columns = summary.columnsByTable;

  for (const t of tables) {
    const cols = columns.get(t) ?? [];
    const outbound: Array<{ fromColumn: string; toTable: string }> = [];
    for (const c of cols) {
      if (!c.name.endsWith('_id')) continue;
      const base = c.name.slice(0, -3);
      for (const cand of pluralCandidates(base)) {
        if (tables.has(cand)) {
          outbound.push({ fromColumn: c.name, toTable: cand });
          break;
        }
      }
    }
    byTable.set(t, { outbound, inbound: [] });
  }

  // populate inbound by scanning others' outbound
  for (const [fromTable, info] of byTable.entries()) {
    for (const out of info.outbound) {
      const dest = byTable.get(out.toTable);
      if (dest) {
        dest.inbound.push({ fromTable, fromColumn: out.fromColumn });
      }
    }
  }

  return { byTable };
}

async function fetchJSONFromRest(
  cfg: SupabaseCfg,
  table: string,
  query: string,
  withCount = false,
): Promise<
  { ok: true; data: unknown; total: number | null } | { ok: false; status: number; error: string }
> {
  const target = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${query}`;
  const headers: Record<string, string> = {
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    accept: 'application/json',
  };
  if (withCount) headers.prefer = 'count=exact';
  const res = await fetch(target, { headers });
  const text = await res.text();
  let data: unknown = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = [];
  }
  const total = withCount
    ? parseTotalFromContentRange(res.headers.get('content-range') ?? '')
    : null;
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
  return { ok: true, data, total };
}

async function fetchRelationsFromRPC(cfg: SupabaseCfg): Promise<
  | {
      ok: true;
      byTable: Map<
        string,
        {
          outbound: Array<{ fromColumn: string; toTable: string }>;
          inbound: Array<{ fromTable: string; fromColumn: string }>;
        }
      >;
    }
  | { ok: false; error: string }
> {
  const target = `${cfg.url}/rest/v1/rpc/db_relations`;
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        apikey: cfg.serviceRoleKey,
        authorization: `Bearer ${cfg.serviceRoleKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ schema: 'public' }),
    });
    if (!res.ok) return { ok: false, error: `RPC status ${res.status}` };
    type Row = {
      table_name: string;
      column_name: string;
      foreign_table: string;
      foreign_column: string;
    };
    const rows = (await res.json().catch(() => [])) as Row[];
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Empty RPC result' };
    const byTable = new Map<
      string,
      {
        outbound: Array<{ fromColumn: string; toTable: string }>;
        inbound: Array<{ fromTable: string; fromColumn: string }>;
      }
    >();
    for (const r of rows) {
      const cur = byTable.get(r.table_name) ?? { outbound: [], inbound: [] };
      cur.outbound.push({ fromColumn: r.column_name, toTable: r.foreign_table });
      byTable.set(r.table_name, cur);
    }
    for (const [fromTable, info] of byTable.entries()) {
      for (const o of info.outbound) {
        const dst = byTable.get(o.toTable) ?? { outbound: [], inbound: [] };
        dst.inbound.push({ fromTable, fromColumn: o.fromColumn });
        byTable.set(o.toTable, dst);
      }
    }
    return { ok: true, byTable };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---- GitHub helpers ----

type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
};

const ghUserCache = new Map<number, { at: number; value: GitHubUser }>();
const GH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getGitHubUser(
  id: number,
): Promise<{ ok: true; value: GitHubUser } | { ok: false; error: string }> {
  const now = Date.now();
  const cached = ghUserCache.get(id);
  if (cached && now - cached.at < GH_TTL_MS) {
    return { ok: true, value: cached.value };
  }
  const token = Deno.env.get('GITHUB_TOKEN')?.trim();
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'os.ubq.fi-dashboard',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/user/${id}`, { headers });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 120)}` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid GitHub JSON' };
  }
  const obj = raw as {
    id: number;
    login: string;
    name?: string | null;
    avatar_url: string;
    html_url: string;
  };
  const out: GitHubUser = {
    id: obj.id,
    login: obj.login,
    name: obj.name ?? null,
    avatar_url: obj.avatar_url,
    html_url: obj.html_url,
  };
  ghUserCache.set(id, { at: now, value: out });
  return { ok: true, value: out };
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
