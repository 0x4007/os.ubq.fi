# API Endpoints (Explorer)

All endpoints are server-proxied; no keys are exposed to the browser. Server loads `.env` and uses least-privileged REST calls.

Base URL: `/api`

## GitHub

- `GET /api/gh/user?id=<numeric>` → `{ id, login, name, avatar_url, html_url }`
  - Looks up a GitHub user by numeric ID via `https://api.github.com/user/{id}`.
  - Optional `GITHUB_TOKEN` in `.env` increases rate limits; server caches responses for 6 hours.

## Health

- `GET /api/health` → `{ ok, uptimeMS }`

## Tables and Columns

- `GET /api/sb/tables` → `{ tables: string[] }`
  - Source: Supabase OpenAPI (`/rest/v1/`)
- `GET /api/sb/columns?table=<name>` → `{ columns: { name, type }[] }`
  - Source: Supabase OpenAPI `definitions.*.properties`

## Data

- `GET /api/sb/rows?table=<name>&limit=100&offset=0&order=<col>&desc=<true|false>`
  - Response: `{ rows: any[], total: number|null, limit, offset }`
  - Uses `Prefer: count=exact` to read total from `Content-Range`.
- `GET /api/sb/row?table=<name>&id=<val>&pk=id` → `{ row: any|null }`

## Relationships

- `GET /api/sb/relations[?table=<name>]`
  - Returns `{ relations: { table, outbound, inbound }[] }` or a single `{ outbound, inbound }` for `?table=`.
  - Prefers exact FK graph via `rpc/db_relations`; falls back to heuristic (`*_id` → table) if RPC not present.
- `GET /api/sb/outbound?table=<t>&id=<val>&pk=id`
  - For the given row, fetches referenced rows for each `*_id`.
  - Response: `{ refs: { column, toTable, row|null }[] }`
- `GET /api/sb/inbound?table=<t>&id=<val>&limit=5&pk=id`
  - For the given row, lists rows that reference it across all inbound edges.
  - Response: `{ refs: { fromTable, fromColumn, rows, total|null }[], pk }`

## Auth/Permissions

- Server uses `SUPABASE_ANON_KEY` for OpenAPI spec and `SUPABASE_SERVICE_ROLE_KEY` for data and RPC calls.
- Client never sees credentials.

## Errors

- Non-2xx from Supabase are mapped to `502` with a short detail payload.
- Missing inputs return `400` with an `{ error }` message.
