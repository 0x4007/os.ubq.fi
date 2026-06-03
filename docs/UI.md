# UI State

The browser URL is the source of truth for shareable UI state.

Supported query parameters:

- `table`: selected table name.
- `offset`: zero-based row offset.
- `limit`: visible row count.
- `sort`: active sort column.
- `desc`: `true` for descending sort, `false` for ascending sort.
- `filters`: serialized filter text for the current view.
- `rowId`: selected row identifier.

Opening `/?table=users&offset=50&limit=25&sort=created&desc=true` restores those controls on load. Editing the controls pushes a new history entry, and browser back/forward restores the previous state.
