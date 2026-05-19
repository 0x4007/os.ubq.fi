# UI URL Parameters

The UI keeps table state in the URL so views can be shared, refreshed, and restored without losing context.

## Parameters

| Parameter | Example          | Description                                                                                  |
| --------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `table`   | `issues`         | Selects the data table or view to display.                                                   |
| `filter`  | `status:eq:open` | Applies one or more filters to the current table. Repeat the parameter for multiple filters. |
| `sort`    | `created`        | Sorts rows by the named column.                                                              |
| `desc`    | `true`           | Reverses the sort direction when set to `true`; any other value is treated as ascending.     |
| `rowId`   | `iss_0002`       | Opens or highlights a specific row after the table loads.                                    |
| `page`    | `2`              | Selects the current page for paginated views.                                                |
| `limit`   | `50`             | Sets the number of rows requested for the current slice.                                     |

## Filter Syntax

Filters use a colon-delimited format:

```text
field:operator:value
```

Supported operators:

| Operator   | Example                | Meaning                            |
| ---------- | ---------------------- | ---------------------------------- |
| `eq`       | `status:eq:open`       | Exact match.                       |
| `neq`      | `status:neq:closed`    | Excludes exact matches.            |
| `contains` | `title:contains:rpc`   | Case-insensitive substring search. |
| `in`       | `status:in:open,ready` | Matches any comma-separated value. |
| `gte`      | `priority:gte:2`       | Greater than or equal comparison.  |
| `lte`      | `priority:lte:3`       | Less than or equal comparison.     |

Use URL encoding for values that contain spaces, colons, commas, or other reserved characters.

## Examples

Open issues sorted by newest first:

```text
/?table=issues&filter=status:eq:open&sort=created&desc=true
```

Search plugin issues and keep the first 25 rows:

```text
/?table=issues&filter=title:contains:plugin&limit=25
```

Combine multiple filters:

```text
/?table=issues&filter=status:eq:open&filter=priority:gte:2&sort=priority&desc=true
```

Deep-link directly to a row:

```text
/?table=issues&rowId=iss_0002
```

Paginate a filtered view:

```text
/?table=issues&filter=assignee:eq:alice&page=3&limit=50
```

## Saved Views

A saved view stores the same URL state described above. Saving a view should capture the current `table`, repeated `filter` values, `sort`, `desc`, `page`, and `limit` parameters.

Saved view URLs are ordinary shareable links:

```text
/?table=issues&filter=status:eq:open&filter=priority:gte:2&sort=priority&desc=true&limit=25
```

When a saved view is opened, the UI should restore the encoded table state before requesting the current slice. If a parameter is missing, the UI should use the default for that control rather than clearing the rest of the saved state.

Recommended saved view labels should describe the active slice, for example:

| Saved view           | URL state                                                                          |
| -------------------- | ---------------------------------------------------------------------------------- |
| Open priority issues | `table=issues&filter=status:eq:open&filter=priority:gte:2&sort=priority&desc=true` |
| Plugin search        | `table=issues&filter=title:contains:plugin&limit=25`                               |
| Alice assignments    | `table=issues&filter=assignee:eq:alice&sort=created&desc=true`                     |

## Drill-Through

Drill-through links use `rowId` together with the surrounding table state. This lets users open a saved or filtered view and focus a specific record after the table loads.

Example drill-through URL:

```text
/?table=issues&filter=status:eq:open&sort=created&desc=true&rowId=iss_0002
```

Expected behavior:

1. Restore the table, filter, sort, and pagination parameters.
2. Fetch the current slice for that state.
3. Select or highlight the row matching `rowId`.
4. Open the row inspector when the row is present in the fetched slice.
5. Keep the table view visible and show an empty inspector state if the row is not present.

For drill-through from aggregate views, include enough filter context to reproduce the aggregate before adding `rowId`:

```text
/?table=issues&filter=plugin:eq:plg_0008&filter=status:eq:open&rowId=iss_0002
```
