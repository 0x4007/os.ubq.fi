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
