# os.ubq.fi — Minimal Deno Server

Simple Deno 2 server for a small UI with a few API endpoints.

## Prerequisites

- Deno >= 2.5 (check with `deno --version`)

## Quickstart

- Dev (watch): `deno task dev` (esbuild watch + server)
- Dev (watch, background): `deno task dev:daemon` (auto-picks 8000→8001; stop with `deno task stop:dev`)
- Start: `deno task start` (build client then run server)
- Lint/Format: `deno task lint` / `deno task fmt`
- Test: `deno task test`
- Build: `deno task build` (bundles client with esbuild and compiles server to `bin/os-ubq-fi`)

Server runs on `http://localhost:8000` by default.

## Configuration

- `PORT` — server port (default `8000`)
- `PUBLIC_DIR` — static files directory (default `public`)
- Supabase (create `.env` from `.env.example`):
  - `SUPABASE_URL` — your project URL (e.g. `https://<ref>.supabase.co`)
  - `SUPABASE_ANON_KEY` — public anon key (used to fetch the OpenAPI spec)
  - `SUPABASE_SERVICE_ROLE_KEY` — service role secret (server-only; used to proxy data queries)

## Endpoints

- `GET /` — serves `public/index.html`
- `GET /api/health` — `{ ok: true, uptimeMS }`
- `GET /api/time` — `{ iso, epochMS }`
- `POST /api/echo` — echoes JSON/text/form payload
- Supabase Explorer (server-proxied; no keys in the browser):
  - `GET /api/sb/tables` — list tables (via Supabase OpenAPI)
  - `GET /api/sb/rows?table=<name>&limit=100&offset=0` — fetch rows with total count
  - `GET /api/sb/columns?table=<name>` — columns for a table (from OpenAPI)
  - `GET /api/sb/relations[?table=<name>]` — relationships (uses RPC if available, else heuristic)
  - `GET /api/sb/outbound?table=<t>&id=<val>` — referenced rows for `*_id` columns
  - `GET /api/sb/inbound?table=<t>&id=<val>&limit=5` — rows referencing the given row

## File Structure

- `src/server.ts` — HTTP server and routing
- `public/` — static UI (HTML/CSS); built JS lives in `public/assets/` (generated from `src/web/*.ts`)
- `tests/` — minimal tests for API and static index
- `deno.json` — tasks and imports (JSR `@std/*`)

## Development

Run common tasks via Deno:

```
deno task dev        # esbuild watch (frontend) + server watch
deno task dev:daemon # hot-reload in background (stop with deno task stop:dev)
deno task start      # run server once
deno task test       # run tests (with coverage)
deno task coverage   # generate lcov report
deno task fmt        # Prettier format (do NOT use deno fmt)
deno task lint       # ESLint
deno task knip       # detect unused code/exports
```

## Notes

- Frontend is authored in TypeScript only; no JS source files are committed. Bundling is done via esbuild (invoked with `deno run -A npm:esbuild`).
- Static files use `@std/http/file-server` (`serveDir`) per Deno 2 best practices.
- Run with explicit permissions: `--allow-net --allow-read=public --allow-env`.
- Prettier is the only formatter; never run `deno fmt`. ESLint (flat config) and Knip are configured.
- Relationships: see `docs/RELATIONS.md` to enable exact FK introspection via a one-line SQL function. The server falls back to heuristics when RPC is not installed.

## Contributing

- See `AGENTS.md` for structure, tasks, and commit style.
- Use Conventional Commits and keep PRs focused.
- Ensure `deno task fmt`, `lint`, `knip`, and `test` pass before opening a PR.
