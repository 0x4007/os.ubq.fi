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

Large pages are virtualized. The `5000` row option keeps the same selection and expanded row state while rendering only the visible scroll window.

The CSV and JSON export buttons download the current sorted, filtered, paginated slice. CSV exports use the visible column labels and values, excluding raw row identifiers. JSON exports include `{ columns, rows, meta }` for the same slice.

Print/PDF output hides interactive chrome, expands the table scroll area, wraps table cells, and keeps the inspector readable in a single-column layout.
