# UI Guide

This document describes the UI navigation state that should be kept in the URL
so views can be shared, bookmarked, and restored without extra setup.

## URL Parameters And Filters

The UI should treat the address bar as the source of truth for table state.
When a user changes a filter, sort, or focused row, the query string should be
updated with stable parameter names.

Recommended parameters:

| Parameter | Example | Purpose |
| --- | --- | --- |
| `table` | `?table=issues` | Opens a specific table or data view. |
| `q` | `?q=bounty` | Applies a free-text search term. |
| `status` | `?status=open` | Filters records by status. |
| `label` | `?label=Price%3A%209%20USD` | Filters records by one label or category. |
| `sort` | `?sort=updated_desc` | Restores the selected sort order. |
| `row` | `?row=ubiquity-123` | Restores the currently selected record. |

Examples:

```text
/?table=issues&status=open&label=Price%3A%209%20USD
/?table=pulls&q=docs&sort=updated_desc
/?table=issues&row=ubiquity-123
```

Filter values should be URL encoded and composable. Unknown parameters should
be ignored so old links continue to load after new filters are added.

## Saved Views

Saved Views are named snapshots of the current UI state. A saved view should
store the same state that appears in the URL: table, filters, search text, sort
order, selected columns, and optionally the focused row.

Recommended behavior:

- Saving a view captures the current URL parameters.
- Loading a view updates the URL and refreshes the visible table.
- Renaming or deleting a view should not affect other saved views.
- If a saved view references a missing table or filter, the UI should fall back
  to the closest valid state and show an empty/error state rather than crashing.

Example saved view:

```json
{
  "name": "Open small bounties",
  "params": {
    "table": "issues",
    "status": "open",
    "label": "Price: 9 USD",
    "sort": "updated_desc"
  }
}
```

## Drill-Through Behavior

Drill-through starts from an aggregate view and opens the records behind that
number. For example, clicking an "Open issues" count should navigate to the
issues table with the matching filters already applied.

Expected flow:

1. User clicks an aggregate count or chart segment.
2. The UI opens the target table.
3. The URL is updated with the matching filters.
4. The previous aggregate context can be restored with browser Back.

Example:

```text
/overview?status=open
```

Clicking a "Price: 9 USD" segment should navigate to:

```text
/?table=issues&status=open&label=Price%3A%209%20USD
```

This keeps drill-through links shareable and makes browser navigation
predictable.
