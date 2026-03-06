# MCP Tools Reference

66 tools available. Read tools require `viewer` permission, write tools require `editor`.

---

## Schema Read Tools

| Tool | Description |
|---|---|
| `list_projects` | List all accessible ERD projects |
| `get_schema` | Get full ERD schema JSON for a project |
| `get_schema_summary` | Get high-level summary (table/column/FK counts, groups, domains) |
| `list_tables` | List tables with summary info (no full column data) |
| `get_table` | Get full table details (by ID or name) |
| `list_groups` | List groups with table counts |
| `list_schemas` | List schema namespaces |
| `get_project_by_name` | Find project by name |
| `get_table_by_name` | Find table by name (case-insensitive) |
| `search_columns` | Search columns across tables by name/type |
| `find_orphan_tables` | Find tables with no FK relationships |

## Export Tools

| Tool | Description |
|---|---|
| `export_ddl` | Export DDL SQL (7 dialects: mysql/postgresql/mariadb/mssql/sqlite/oracle/h2) |
| `export_diagram` | Export as Mermaid or PlantUML diagram |
| `export_prisma` | Export as Prisma schema |
| `export_dbml` | Export as DBML |
| `lint_schema` | Run schema lint validation (9 rules) |

## Import Tools

| Tool | Description |
|---|---|
| `import_ddl` | Import DDL SQL to create/update tables |
| `import_prisma` | Import Prisma schema |
| `import_dbml` | Import DBML |

## Table Tools

| Tool | Description |
|---|---|
| `add_table` | Add a new table (auto-PK option) |
| `update_table` | Update table properties (name, comment, color, group, schema) |
| `delete_table` | Delete a table and clean up FK references |
| `delete_tables` | Bulk delete multiple tables |
| `duplicate_table` | Duplicate a table with new IDs |
| `bulk_add_tables` | Bulk add multiple tables at once |
| `list_table_templates` | List available table templates |
| `create_table_from_template` | Create a table from a template (users, audit_log, settings, files, tags) |

## Column Tools

| Tool | Description |
|---|---|
| `add_column` | Add a column to a table |
| `update_column` | Update column properties |
| `delete_column` | Delete a column and clean up FK/UQ references |
| `move_column` | Move a column to a different position (reorder) |
| `bulk_add_columns` | Bulk add multiple columns to a table |

## Foreign Key Tools

| Tool | Description |
|---|---|
| `add_foreign_key` | Add a FK relationship (supports composite FKs) |
| `update_foreign_key` | Update FK properties (referenced table/columns, actions, label) |
| `delete_foreign_key` | Delete a FK |

## Unique Key & Index Tools

| Tool | Description |
|---|---|
| `add_unique_key` | Add a composite unique key |
| `delete_unique_key` | Delete a unique key |
| `add_index` | Add an index |
| `delete_index` | Delete an index |

## Domain Tools

| Tool | Description |
|---|---|
| `list_domains` | List all domains with usage counts |
| `get_domain` | Get domain details (by ID or name) with linked columns |
| `add_domain` | Add a new domain (reusable column template) |
| `update_domain` | Update domain and propagate to linked columns |
| `delete_domain` | Delete domain and unlink columns |
| `suggest_domains` | Analyze unlinked columns and suggest domain candidates |
| `domain_coverage` | Get domain coverage statistics |
| `export_domain_dictionary` | Export domain dictionary (markdown or HTML) |

## Memo Tools

| Tool | Description |
|---|---|
| `list_memos` | List all memos with summary info |
| `add_memo` | Add a sticky memo to the canvas |
| `update_memo` | Update memo properties |
| `delete_memo` | Delete a memo |
| `attach_memo` | Attach a memo to a table (moves with table) |
| `detach_memo` | Detach a memo from a table |

## Schema Namespace Tools

| Tool | Description |
|---|---|
| `add_schema` | Add a schema namespace |
| `delete_schema` | Delete a schema namespace |
| `rename_schema` | Rename a schema namespace |
| `bulk_update_table_schema` | Move multiple tables to a schema |

## Group Tools

| Tool | Description |
|---|---|
| `update_group_color` | Set or clear the color of a table group |
| `rename_group` | Rename a group across all tables |

## Layout Tools

| Tool | Description |
|---|---|
| `auto_layout` | Apply auto-layout (grid/hierarchical/radial, optional group-by) |

## Snapshot Tools

| Tool | Description |
|---|---|
| `list_snapshots` | List schema snapshots |
| `create_snapshot` | Create a named snapshot |
| `restore_snapshot` | Restore a snapshot |
| `delete_snapshot` | Delete a snapshot |
| `compare_snapshots` | Compare two snapshots (diff) |
| `export_migration_sql` | Generate ALTER TABLE DDL from snapshot diff |

---

## Common Parameters

Most tools require a `projectId` parameter. Some tools accept alternative lookup parameters:

- `get_table`: `tableId` or `tableName`
- `get_domain`: `domainId` or `domainName`
- `get_project_by_name`: `name`

## Permission Model

| Permission | Read tools | Write tools |
|---|---|---|
| **viewer** | All read/export tools | Denied |
| **editor** | All read/export tools | All write tools |
| **owner** | All | All |
| **admin** | All | All |

Scoped API keys further restrict access to specific projects.

## Collab Integration

All write tools automatically notify connected WebSocket clients via `notifyCollabSchemaChange()`. When an AI tool modifies the schema through MCP, users viewing the project in the browser see changes in real-time — no page refresh needed.
