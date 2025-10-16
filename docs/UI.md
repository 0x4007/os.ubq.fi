# Explorer UI Guide

The Supabase Explorer provides a compact way to browse tables and see how rows relate.

## Sections

- Tables sidebar — select a table, load a paginated slice of rows.
- Main Grid — each row has an expander (▶) to show its related data inline:
  - Related (outbound): resolved rows for each `*_id` in that row.
  - Referenced By (inbound): small samples of rows that reference this row, with totals.
- Row Inspector — automatically selects the first row of each page; clicking any row updates the inspector with the same related data, plus a key-value summary.

### GitHub Username Enrichment

- When a field named `user_id` (or `users.id`) is shown, the UI lazily fetches the GitHub login and appends a tag like `@octocat` next to the numeric ID.
- This uses `GET /api/gh/user?id=<id>` behind the scenes; results are cached on the server (memory) and in the browser via `localStorage` for 30 days to minimize API calls.

### ID Hiding & Friendly Substitutions

- The grid and inspector never display raw numeric IDs.
- Primary key `id` columns are hidden.
- For `*_id` columns, the UI replaces numbers with friendly representations:
  - `user_id` → `@username` (with avatar, linked to GitHub).
  - `wallet_id` → in-cell inline object showing wallet fields (e.g., `address`, `created`).
  - `location_id` → GitHub link to the location’s `node_url` with its `node_type` label.
  - Other relations → compact inline object of the referenced row (excluding IDs).
- Add `GITHUB_TOKEN` to `.env` to raise API limits when exploring many rows.

## Tips

- Use small page sizes when exploring large tables; pagination keeps it responsive.
- If a relation doesn’t appear but you expect one, check column naming or add exact FKs.
  - Heuristics need `*_id` to match a table name (`user_id` → `users`).
- To get exact relationships, install the `public.db_relations` RPC described in `docs/RELATIONS.md` (no UI change required).

## Keyboard & Theme

- Grid navigation: Arrow Up/Down moves selection; Enter toggles the row expander. The selected row is highlighted. The grid itself is focusable; press Tab to focus, then use the keys.
- Theme toggle: click the “Theme” button in the toolbar to switch between dark and light. The choice is saved to `localStorage` and restored on reload.

## Notes on Expanders

- Expanding a row makes two API calls (`/api/sb/outbound` and `/api/sb/inbound`) for that row ID.
- Inbound previews show up to 3 sample rows per relation to keep rendering fast.
- Rows without an `id` won’t show expanders content (the ID is required to query relations).

## Keyboard/UX Ideas (future)

- Arrow keys to move between rows.
- Pin columns and enable per-column sorting.
- Multi-hop traversal and quick graph view.
