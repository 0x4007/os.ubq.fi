# Supabase Relations (FK) Introspection

The UI includes a Relationships viewer to help explore how tables connect. By default it uses a safe heuristic (columns ending with `_id` map to tables with the same base name), which works well when you follow typical naming like `location_id → locations.id`.

For exact FK metadata, you can install a tiny Postgres function and expose it via PostgREST. The server will automatically prefer this RPC when available.

## 1) Install RPC function

Run this in Supabase SQL editor:

```sql
-- Lists foreign key relationships for the given schema (default: public)
create or replace function public.db_relations(schema text default 'public')
returns table (
  table_name text,
  column_name text,
  foreign_table text,
  foreign_column text
) stable security definer language sql as $$
  select
    tc.table_name,
    kcu.column_name,
    ccu.table_name as foreign_table,
    ccu.column_name as foreign_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = schema;
$$;

-- Optional: allow calling from anon/authenticated (not required for server-side service_role usage)
grant execute on function public.db_relations(text) to anon, authenticated;
```

Notes

- The function runs with `security definer`, so it can read `information_schema` safely.
- You can change the schema argument if you organize beyond `public`.

## 2) How the server uses this

- Endpoint: `GET /api/sb/relations[?table=<name>]`
  - If `public.db_relations` exists, the server calls `/rest/v1/rpc/db_relations` (service role) and returns exact `inbound` and `outbound` edges.
  - Otherwise it falls back to the heuristic.

## 3) UI behavior

- Click “Show Table Relations” in the Supabase Explorer to see outbound and inbound relations for the selected table.
- Click a row in the grid to open the Row Inspector:
  - Outbound: loads referenced rows for `*_id` columns.
  - Inbound: fetches referencing rows per relationship (first 5, with totals).
