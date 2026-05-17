# UI Query Parameters

The UI can be linked to a specific table, search, and filter state by adding query
parameters to the page URL. Parameters are optional and can be combined.

## Parameters

| Parameter | Description | Example |
| --- | --- | --- |
| `table` | Opens the named table or resource view. | `?table=issues` |
| `q` | Applies a free-text search term. | `?q=payment` |
| `filter` | Applies one or more structured filters. | `?filter=status:open` |
| `sort` | Sorts by a field. Prefix with `-` for descending order. | `?sort=-updatedAt` |
| `page` | Opens a 1-based page number. | `?page=2` |
| `limit` | Sets the number of rows per page. | `?limit=50` |

## Filter Syntax

Filters use `field:operator:value` syntax. The operator is optional; when it is
omitted, equality is used.

```text
field:value
field:eq:value
field:ne:value
field:gt:value
field:gte:value
field:lt:value
field:lte:value
field:contains:value
field:in:value1,value2,value3
```

Multiple filters can be supplied by repeating the `filter` parameter:

```text
?filter=status:open&filter=assignee:contains:alice
```

Values with spaces or reserved URL characters must be URL encoded:

```text
?filter=title:contains:payment%20review
```

## Examples

Open the issues table and show open items:

```text
/?table=issues&filter=status:open
```

Search payments and show the most recently updated rows first:

```text
/?q=payment&sort=-updatedAt
```

Show high-priority tasks assigned to either `alice` or `bob`:

```text
/?table=tasks&filter=priority:gte:3&filter=assignee:in:alice,bob
```

Open page 2 with 50 rows per page:

```text
/?table=issues&page=2&limit=50
```

## Saved Views

Saved Views preserve a reusable table state: table name, search term, filters,
sorting, pagination size, and visible columns. A saved view should be encoded as
the same URL parameter state that the UI already understands so it can be
bookmarked or shared.

Example saved view for open payment issues:

```text
/?table=issues&q=payment&filter=status:open&sort=-updatedAt&limit=50
```

When a user opens a saved view, the UI should:

1. Restore the saved table.
2. Apply all saved filters in order.
3. Apply the saved search term and sort.
4. Use the saved page size.
5. Keep the URL in sync with any later changes.

## Drill-Through Links

Drill-through links let a summary, count, or chart open the detailed rows that
produced it. A drill-through URL should include the destination `table` and the
filters needed to recreate the source slice.

Example: a dashboard card for open payment issues can link to:

```text
/?table=issues&q=payment&filter=status:open
```

Example: a chart segment for high-priority tasks assigned to `alice` can link
to:

```text
/?table=tasks&filter=priority:gte:3&filter=assignee:alice
```

Drill-through links should be deterministic. Opening the same link again should
restore the same data slice, even after navigating away and returning.
