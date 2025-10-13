# os.ubq.fi — Minimal Deno Server

Simple Deno 2 server for a small UI with a few API endpoints.

## Prerequisites

- Deno >= 2.5 (check with `deno --version`)

## Quickstart

- Dev (watch): `deno task dev`
- Start: `deno task start`
- Lint/Format: `deno task lint` / `deno task fmt`
- Test: `deno task test`
- Build: `deno task build` (compiles server to `bin/os-ubq-fi`)

Server runs on `http://localhost:8000` by default.

## Configuration

- `PORT` — server port (default `8000`)
- `PUBLIC_DIR` — static files directory (default `public`)

## Endpoints

- `GET /` — serves `public/index.html`
- `GET /api/health` — `{ ok: true, uptimeMS }`
- `GET /api/time` — `{ iso, epochMS }`
- `POST /api/echo` — echoes JSON/text/form payload

## File Structure

- `src/server.ts` — HTTP server and routing
- `public/` — static UI (HTML/CSS/JS)
- `tests/` — minimal tests for API and static index
- `deno.json` — tasks and imports (JSR `@std/*`)

## Development

Run common tasks via Deno:

```
deno task dev        # run server with watch
deno task start      # run server once
deno task test       # run tests (with coverage)
deno task coverage   # generate lcov report
deno task fmt        # Prettier format (do NOT use deno fmt)
deno task lint       # ESLint
deno task knip       # detect unused code/exports
```

## Notes

- Static files use `@std/http/file-server` (`serveDir`) per Deno 2 best practices.
- Run with explicit permissions: `--allow-net --allow-read=public --allow-env`.
- Prettier is the only formatter; never run `deno fmt`. ESLint (flat config) and Knip are configured.

## Contributing

- See `AGENTS.md` for structure, tasks, and commit style.
- Use Conventional Commits and keep PRs focused.
- Ensure `deno task fmt`, `lint`, `knip`, and `test` pass before opening a PR.
