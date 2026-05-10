# UI State Links

The dashboard stores the table view in URL parameters so support and operations links can recreate the same state.

Supported parameters:

- `table`: `users`, `issues`, or `plugins`
- `offset`: zero-based row offset
- `limit`: page size, one of `10`, `25`, `50`, `100`, or `5000`
- `sort`: the active column key for the selected table
- `desc`: `true` for descending order, `false` for ascending order
- `filters`: comma-separated column filters in `column.operator.value` form
- `rowId`: expanded row identifier

Example:

```text
/?table=users&offset=50&limit=25&sort=created&desc=true
```

Filter operators are:

- `eq`: exact value match
- `ilike`: case-insensitive contains match

Example with filters:

```text
/?table=issues&offset=0&limit=25&sort=created&desc=false&filters=repo.ilike.work,status.eq.assigned
```

Changing controls pushes a history entry. Browser back and forward restore the previous table, pagination, sort direction, filters, and expanded row.

Saved views store the current query string in `localStorage` under a user-provided name. Applying a saved view restores the stored URL state and pushes it into browser history. Deleting a saved view removes only that local entry.

Example saved view workflow:

```text
1. Filter issues to repo equals os.ubq.fi.
2. Enter "os issues" in View name.
3. Save the view, switch tables, then apply "os issues" to restore the issue filters.
```

The app also stores the last selected table and each table's scroll position in `localStorage`. When users return without a table parameter, the last table is restored; when the large table window is opened again, the saved scroll position is reused.

Row details include related chips for drill-through navigation. Clicking a chip switches to the target table, applies an exact FK filter, selects the first matching row, and pushes the new state into browser history so back and forward return to the prior row.

Example drill-through links:

```text
/?table=issues&offset=0&limit=25&sort=created&desc=false&rowId=iss_0001
```

From an issue detail, `Reporter` opens the users table with `filters=id.eq.<userId>`, and `Plugin` opens the plugins table with `filters=id.eq.<pluginId>`. From a user or plugin detail, issue chips open the issues table with `filters=userId.eq.<id>` or `filters=pluginId.eq.<id>`.

The chart panel renders lazily from the current filtered rows without extra requests. Users and issues show status totals; plugins show health totals.

Large pages are virtualized. The `5000` row option keeps the same selection and expanded row state while rendering only the visible scroll window.

The CSV and JSON export buttons download the current sorted, filtered, paginated slice. CSV exports use the visible column labels and values, excluding raw row identifiers. JSON exports include `{ columns, rows, meta }` for the same slice.

Print/PDF output hides interactive chrome, expands the table scroll area, wraps table cells, and keeps the inspector readable in a single-column layout.
