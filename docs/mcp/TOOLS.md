# MCP Tools Reference

28 tools available. Read tools require `viewer` permission, write tools require `editor`.

---

## Read Tools

### list_projects

List all ERD projects accessible to the authenticated user.

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | | | |

**Returns**: Array of `{ id, name }` objects.

---

### get_schema

Get the full ERD schema JSON for a project.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**: Complete `ERDSchema` JSON (tables, columns, FKs, domains, memos).

---

### get_schema_summary

Get a high-level summary of a project schema.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**:
```json
{
  "tableCount": 12,
  "columnCount": 87,
  "fkCount": 15,
  "indexCount": 3,
  "groups": ["auth", "billing"],
  "domains": [{ "id": "...", "name": "user_id", "type": "BIGINT" }]
}
```

---

### list_tables

List tables with summary info (no full column data).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `group` | string | No | Filter by group name (exact match) |

**Returns**: Array of:
```json
{
  "id": "abc123",
  "name": "users",
  "comment": "User accounts",
  "group": "auth",
  "color": "blue",
  "columnCount": 8,
  "fkCount": 0,
  "pkColumns": ["id"]
}
```

---

### get_table

Get full details of a single table (columns, foreignKeys, uniqueKeys, indexes).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | No | Table ID (provide either `tableId` or `tableName`) |
| `tableName` | string | No | Table name (case-insensitive match) |

**Returns**: Full `Table` JSON.

---

### list_groups

List groups with table counts and table names.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**:
```json
[
  { "group": "auth", "tableCount": 3, "tableNames": ["users", "sessions", "roles"] },
  { "group": "(ungrouped)", "tableCount": 2, "tableNames": ["logs", "settings"] }
]
```

---

### export_ddl

Export DDL SQL for a project schema.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `dialect` | enum | Yes | `mysql` \| `postgresql` \| `mariadb` \| `mssql` |
| `includeComments` | boolean | No | Include comments in DDL |
| `includeForeignKeys` | boolean | No | Include FK constraints |
| `includeIndexes` | boolean | No | Include indexes |
| `includeDomains` | boolean | No | Include domain comments on columns |
| `upperCaseKeywords` | boolean | No | Uppercase SQL keywords |

**Returns**: DDL SQL string.

---

### lint_schema

Run schema lint validation and return issues.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**: Array of lint issues. 8 rules:
- Missing primary key
- Missing FK target table/column
- SET NULL on NOT NULL column
- Duplicate column names
- Duplicate table names
- Duplicate index names
- Circular FK references
- Empty table (no columns)

---

### export_diagram

Export ERD as Mermaid or PlantUML diagram.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `format` | enum | Yes | `mermaid` \| `plantuml` |

**Returns**: Diagram source text.

---

## Write Tools

### add_table

Add a new table to the ERD schema.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `name` | string | No | Table name (auto-generated like `table_1` if omitted) |
| `comment` | string | No | Table comment |
| `color` | enum | No | `red` \| `orange` \| `amber` \| `green` \| `teal` \| `blue` \| `purple` \| `pink` \| `lime` \| `cyan` \| `indigo` \| `rose` \| `slate` \| `brown` |
| `group` | string | No | Table group name |
| `withPk` | boolean | No | Auto-create `id` PK column (default: true) |

**Returns**: `{ tableId, name }`

---

### update_table

Update table properties.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID |
| `name` | string | No | New table name |
| `comment` | string | No | New comment (empty string to clear) |
| `color` | string | No | New color (empty string to clear) |
| `group` | string | No | New group (empty string to clear) |

---

### delete_table

Delete a table and clean up FK references from other tables.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID to delete |

---

### add_column

Add a column to a table.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID |
| `name` | string | No | Column name |
| `type` | enum | No | `INT` \| `BIGINT` \| `SMALLINT` \| `VARCHAR` \| `CHAR` \| `TEXT` \| `BOOLEAN` \| `DATE` \| `DATETIME` \| `TIMESTAMP` \| `DECIMAL` \| `FLOAT` \| `DOUBLE` \| `JSON` \| `UUID` \| `ENUM` |
| `length` | number | No | Column length (e.g. 255 for VARCHAR) |
| `scale` | number | No | Decimal scale |
| `nullable` | boolean | No | Allow NULL |
| `primaryKey` | boolean | No | Primary key |
| `unique` | boolean | No | Unique constraint |
| `autoIncrement` | boolean | No | Auto increment |
| `defaultValue` | string | No | Default value expression |
| `comment` | string | No | Column comment |
| `enumValues` | string[] | No | ENUM values (for ENUM type) |

**Returns**: `{ columnId }`

---

### update_column

Update column properties.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID |
| `columnId` | string | Yes | Column ID |
| `name` | string | No | New column name |
| `type` | enum | No | New column type (same options as add_column) |
| `length` | number | No | New length |
| `scale` | number | No | New decimal scale |
| `nullable` | boolean | No | Allow NULL |
| `primaryKey` | boolean | No | Primary key |
| `unique` | boolean | No | Unique |
| `autoIncrement` | boolean | No | Auto increment |
| `defaultValue` | string | No | Default value expression |
| `comment` | string | No | Column comment |

---

### delete_column

Delete a column and clean up FK/UQ references.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID |
| `columnId` | string | Yes | Column ID to delete |

---

### add_foreign_key

Add a foreign key relationship between tables. Supports composite FKs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Source table ID |
| `columnIds` | string[] | Yes | Source column IDs |
| `referencedTableId` | string | Yes | Referenced table ID |
| `referencedColumnIds` | string[] | Yes | Referenced column IDs |
| `onDelete` | enum | No | `CASCADE` \| `SET NULL` \| `RESTRICT` \| `NO ACTION` |
| `onUpdate` | enum | No | `CASCADE` \| `SET NULL` \| `RESTRICT` \| `NO ACTION` |

**Returns**: `{ fkId }`

---

### delete_foreign_key

Delete a foreign key from a table.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `tableId` | string | Yes | Table ID |
| `fkId` | string | Yes | Foreign key ID to delete |

---

### update_group_color

Set or clear the color of a table group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `group` | string | Yes | Group name |
| `color` | string | No | CSS color value (e.g. `#ff6600`). Omit to clear. |

---

### import_ddl

Import DDL SQL to create/update tables in a project.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `sql` | string | Yes | DDL SQL statements (max 1MB) |
| `dialect` | enum | No | `mysql` \| `postgresql` \| `mariadb` \| `mssql` (default: mysql) |
| `replace` | boolean | No | Replace existing schema (default: false, merges new tables) |

**Returns**: Import summary with table count, errors, and warnings.

---

## Memo Tools

### list_memos

List all memos in a project with summary info.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**: Array of:
```json
{
  "id": "abc123",
  "content": "Design notes for auth module...",
  "color": "yellow",
  "locked": false,
  "position": { "x": 100, "y": 200 },
  "width": 200,
  "height": 150
}
```

Content is truncated to 100 characters in the list view.

---

### add_memo

Add a new sticky memo to the ERD canvas.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `content` | string | No | Memo text content (max 10,000 chars) |
| `color` | enum | No | `yellow` \| `blue` \| `green` \| `pink` \| `purple` \| `orange` |
| `x` | number | No | X position on canvas |
| `y` | number | No | Y position on canvas |
| `width` | number | No | Memo width (default: 200) |
| `height` | number | No | Memo height (default: 150) |

**Returns**: `{ memoId }`

---

### update_memo

Update memo properties.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `memoId` | string | Yes | Memo ID |
| `content` | string | No | New text content |
| `color` | enum | No | New color (empty string to reset to yellow) |
| `x` | number | No | New X position |
| `y` | number | No | New Y position |
| `width` | number | No | New width |
| `height` | number | No | New height |
| `locked` | boolean | No | Lock/unlock the memo |

---

### delete_memo

Delete a memo from the ERD canvas.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `memoId` | string | Yes | Memo ID to delete |

---

## Domain Tools

### list_domains

List all column domains in a project with usage counts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**: Array of domain objects with `usageCount` (number of linked columns).

---

### get_domain

Get full details of a domain by ID or name, including linked columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `domainId` | string | No | Domain ID (provide either `domainId` or `domainName`) |
| `domainName` | string | No | Domain name (case-insensitive match) |

**Returns**: Domain object with `linkedColumns` array of `{ tableName, columnName, columnId }`.

---

### add_domain

Add a new column domain (reusable column template).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `name` | string | Yes | Domain name |
| `type` | enum | Yes | Column type (same options as `add_column`) |
| `length` | number | No | Column length |
| `scale` | number | No | Decimal scale |
| `nullable` | boolean | No | Allow NULL (default: false) |
| `primaryKey` | boolean | No | Primary key (default: false) |
| `unique` | boolean | No | Unique constraint (default: false) |
| `autoIncrement` | boolean | No | Auto increment (default: false) |
| `defaultValue` | string | No | Default value expression |
| `check` | string | No | CHECK constraint expression |
| `enumValues` | string[] | No | ENUM values |
| `comment` | string | No | Domain comment |
| `group` | string | No | Domain group name |

**Returns**: `{ domainId, name }`

---

### update_domain

Update domain properties and propagate changes to all linked columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `domainId` | string | Yes | Domain ID |
| `name` | string | No | New domain name |
| `type` | enum | No | New column type |
| `length` | number | No | New length |
| `scale` | number | No | New decimal scale |
| `nullable` | boolean | No | Allow NULL |
| `primaryKey` | boolean | No | Primary key |
| `unique` | boolean | No | Unique |
| `autoIncrement` | boolean | No | Auto increment |
| `defaultValue` | string | No | Default value expression |
| `check` | string | No | CHECK constraint expression |
| `enumValues` | string[] | No | ENUM values |
| `comment` | string | No | Domain comment |
| `group` | string | No | Domain group name |

---

### delete_domain

Delete a domain and unlink all columns that reference it.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `domainId` | string | Yes | Domain ID to delete |

---

### suggest_domains

Analyze unlinked columns and suggest potential domain candidates based on type/name similarity. Only suggests groups with 2+ matching columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Returns**: Array of suggestions:
```json
{
  "suggestedName": "email",
  "type": "VARCHAR",
  "length": 255,
  "columns": [
    { "tableName": "users", "columnName": "email" },
    { "tableName": "contacts", "columnName": "email" }
  ]
}
```

---

## Collab Integration

All write tools automatically notify connected WebSocket clients via `notifyCollabSchemaChange()`. When an AI tool modifies the schema through MCP, users viewing the project in the browser see changes in real-time — no page refresh needed.
