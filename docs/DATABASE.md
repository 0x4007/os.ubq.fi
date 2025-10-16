# Database Overview and Relationships

This document captures a snapshot of the project’s database API surface, inferred relationships, and practical notes from wiring the Supabase-backed data explorer.

## Project Surface (OpenAPI)

Tables detected via the project’s OpenAPI spec (`/rest/v1/`):

- credits
- debits
- issue_comments
- issues
- issues_view (view)
- locations
- partners
- permits
- settlements
- tokens
- users
- wallets

Note: This list comes from the PostgREST OpenAPI response, which describes what is exposed over REST. It does not include metadata schemas.

## Guessed Relationships (Heuristic)

Heuristics: columns ending in `_id` are treated as foreign keys to a table whose name matches the `_id` prefix (with simple pluralization rules).

- credits
  - permit_id → permits
  - location_id → locations
- debits
  - token_id → tokens
  - location_id → locations
- permits
  - token_id → tokens
  - partner_id → partners
  - location_id → locations
  - beneficiary_id → (no exact table match by naming; likely users or wallets — see Notes)
- issues / issue_comments
  - issue_comments.issue_id → issues
  - user linking columns (e.g., user_id) are common in such tables; not confirmed from OpenAPI snapshot
- settlements
  - Likely references permits and/or partners depending on model; not confirmed from OpenAPI snapshot

Confidence levels:

- High: credits.permit_id → permits, credits.location_id → locations, debits.token_id → tokens, debits.location_id → locations, permits.token_id → tokens, permits.partner_id → partners, permits.location_id → locations, issue_comments.issue_id → issues.
- Uncertain: permits.beneficiary_id (no table named beneficiaries; likely users or wallets). If this is intended to point at `users` or `wallets`, consider renaming to `user_id` or `wallet_id` for consistency, or add a precise FK.

## Column Notes (from OpenAPI)

OpenAPI shows commonly filtered columns for the major tables; highlights include:

- credits: id, created, updated, amount, permit_id, location_id
- debits: id, created, updated, amount, location_id, token_id
- permits: id, created, updated, amount, nonce, deadline, signature, token_id, partner_id, beneficiary_id, transaction, location_id

These suggest core flows: permits associate partners, beneficiaries, and tokens at a location; credits/debits track amounts tied to permits/tokens at locations.

## Exact FK Introspection

For precise relationships (rather than naming heuristics), install the `public.db_relations` RPC described in docs/RELATIONS.md. The server will automatically prefer the RPC when present and fall back to the heuristic otherwise.

## Data Availability (Quick Check)

Ad-hoc checks during development sometimes returned 0 rows for several tables (e.g., debits), which is consistent with a sparse dev dataset. The explorer still enumerates schemas and relations; sampling limits (paging and small inbound samples) keep requests lightweight.

## Recommendations

- Prefer exact foreign keys in Postgres and expose `public.db_relations` for accurate relationship graphs in the UI.
- Use consistent `_id` names that match target tables (e.g., `user_id → users`, `wallet_id → wallets`). This improves heuristic coverage and readability.
- Document primary keys (default `id`) and any composite keys that break assumptions in the row inspector; we can add per-table PK overrides.
- Consider adding views for common joins to reduce client-side N+1 exploration.

## Next Steps

- Enable exact FK RPC and update the UI to show constraint names and actions (RESTRICT/CASCADE) where useful.
- Add multi-hop traversal in the UI and simple graph export (e.g., Graphviz JSON).
- Add filters/sorts and column selection per table to focus on relevant fields.
