# Lessons Learned (Supabase + Deno Explorer)

A brief summary of key findings, caveats, and design choices from implementing the explorer.

## Introspection Realities

- PostgREST OpenAPI (`/rest/v1/`) is great for enumerating tables/views but does not include foreign key graph in an easily consumable way.
- `information_schema` and `pg_catalog` are not exposed by default via REST for security; avoid exposing them globally. Use a targeted RPC instead.
- pg-meta endpoints (`/pg` or `/pg-meta`) are not enabled on all projects; in this project they returned 404, so we avoided that path.

## Approach Chosen

- Server-proxied design: the browser never sees keys; the server reads `.env` and talks to Supabase REST.
- Heuristic relationships: `*_id` → table match (simple pluralization) as a universally safe fallback.
- Exact relationships (optional, recommended): tiny RPC (`public.db_relations`) that queries `information_schema` with `security definer`, exposed via PostgREST.
- Minimal, paginated queries: prefer small samples with `Prefer: count=exact` for totals.

## Deno 2 Notes

- Use `@std/dotenv` with `import '@std/dotenv/load'` and grant `--allow-read=.env` (updated in tasks).
- Keep server permissions tight: `--allow-net --allow-read=public,.env --allow-env`.
- Use esbuild via `deno run -A npm:esbuild` for frontend bundling.

## Security

- Never expose the service role key to browsers. All sensitive calls happen server-side.
- The RPC runs with `security definer`, but only returns minimal FK metadata; avoid broader exposure.

## Performance

- Favor small page sizes and targeted calls in the row inspector (first N inbound refs per relation, with totals).
- Cache the OpenAPI spec briefly to reduce overhead (60s in-memory cache in server).

## Developer Experience

- API added for tables, rows, columns, relations, outbound/inbound neighbors keeps the UI simple and testable.
- Heuristic relations enable immediate usefulness even without DB changes; adding the RPC upgrades accuracy with no UI changes.

## Future Enhancements

- Add per-table PK overrides and composite key support.
- Add graph viz for schema and row-level hop exploration.
- Add query filters and sorting in the UI.
- Support multi-schema exploration through the RPC argument.
