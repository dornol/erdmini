# MCP HTTP E2E coverage audit

The implementation plan names 89 tools. The current registry contains 89 literal
`server.tool` registrations. The initial audit found only four tool names exercised through
`tools/call`; 85 had no literal tool call and no dynamic catalog-call
loop in E2E sources. Subsequent focused read/mutation batches are recorded below.
Together with existing calls, 89 tool names have HTTP business-path coverage;
no tool names remain without an HTTP business-path case. This is a
name-level inventory, not proof that every branch or invariant is covered. Unit tests are separate evidence and do not prove the HTTP
authentication/transport/persistence/browser path for those tools.

This is an open requirement inventory, not a completion claim. The catalog
contract E2E verifies discovery for all names, but does not substitute for their
successful, rejected, persisted and browser-visible behavior tests.

| Tool | Definition | HTTP business-path E2E |
| --- | --- | --- |
| `add_column` | `src/lib/server/mcp/tools/column-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `add_db_object` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `add_db_object_category` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `add_dictionary_word` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `add_domain` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `add_foreign_key` | `src/lib/server/mcp/tools/fk-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `add_index` | `src/lib/server/mcp/tools/constraint-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `add_memo` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `add_schema` | `src/lib/server/mcp/tools/schema-ns-tools.ts` | Passed: scope/input rejection, metadata preservation, live browser export and reload |
| `add_table` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `add_unique_key` | `src/lib/server/mcp/tools/constraint-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `attach_memo` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `auto_layout` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, live export and reload |
| `bulk_add_columns` | `src/lib/server/mcp/tools/bulk-tools.ts` | Passed: scope/input atomicity, defaults/metadata, partial matches, live export and reload |
| `bulk_add_tables` | `src/lib/server/mcp/tools/bulk-tools.ts` | Passed: scope/input atomicity, defaults/metadata, partial matches, live export and reload |
| `bulk_assign_domain` | `src/lib/server/mcp/tools/bulk-tools.ts` | Passed: existing scoped HTTP behavior; detailed evidence below |
| `bulk_update_columns` | `src/lib/server/mcp/tools/bulk-tools.ts` | Passed: scope/input atomicity, defaults/metadata, partial matches, live export and reload |
| `bulk_update_table_schema` | `src/lib/server/mcp/tools/schema-ns-tools.ts` | Passed: scope/input rejection, metadata preservation, live browser export and reload |
| `bulk_update_tables` | `src/lib/server/mcp/tools/bulk-tools.ts` | Passed: scope/input atomicity, defaults/metadata, partial matches, live export and reload |
| `compare_snapshots` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `create_dictionary` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: admin/regular roles, usage/default guards, metadata and dictionary UI reload |
| `create_snapshot` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `delete_column` | `src/lib/server/mcp/tools/column-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_db_object` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `delete_db_object_category` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `delete_dictionary` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: admin/regular roles, usage/default guards, metadata and dictionary UI reload |
| `delete_dictionary_word` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `delete_domain` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `delete_foreign_key` | `src/lib/server/mcp/tools/fk-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_index` | `src/lib/server/mcp/tools/constraint-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_memo` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_schema` | `src/lib/server/mcp/tools/schema-ns-tools.ts` | Passed: scope/input rejection, metadata preservation, live browser export and reload |
| `delete_snapshot` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `delete_table` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_tables` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `delete_unique_key` | `src/lib/server/mcp/tools/constraint-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `detach_memo` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `domain_coverage` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `duplicate_table` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `export_dbml` | `src/lib/server/mcp/tools/export-tools.ts` | Passed: viewer access, scope/input rejection, format/options, unchanged data and reload |
| `export_ddl` | `src/lib/server/mcp/tools/export-tools.ts` | Passed: viewer access, scope/input rejection, format/options, unchanged data and reload |
| `export_diagram` | `src/lib/server/mcp/tools/export-tools.ts` | Passed: viewer access, scope/input rejection, format/options, unchanged data and reload |
| `export_dictionary_words` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `export_domain_dictionary` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `export_migration_sql` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `export_prisma` | `src/lib/server/mcp/tools/export-tools.ts` | Passed: viewer access, scope/input rejection, format/options, unchanged data and reload |
| `find_orphan_tables` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, live export and reload |
| `get_db_object` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `get_domain` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `get_naming_rules` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: scope/input rejection, meaningful results, storage and browser reload |
| `get_project_by_name` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, storage and browser reload |
| `get_schema` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: existing scoped HTTP behavior; detailed evidence below |
| `get_schema_summary` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: read results, selectors, scope denial, persistence and viewer reload |
| `get_table` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: read results, selectors, scope denial, persistence and viewer reload |
| `get_table_by_name` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, live export and reload |
| `import_dbml` | `src/lib/server/mcp/tools/import-tools.ts` | Passed: input/scope rejection, merge/repeat/replace, FK integrity, metadata and browser reload |
| `import_ddl` | `src/lib/server/mcp/tools/import-tools.ts` | Passed: input/scope rejection, merge/repeat/replace, FK integrity, metadata and browser reload |
| `import_dictionary_words` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `import_prisma` | `src/lib/server/mcp/tools/import-tools.ts` | Passed: input/scope rejection, merge/repeat/replace, FK integrity, metadata and browser reload |
| `lint_schema` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, live export and reload |
| `list_db_object_categories` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `list_db_objects` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `list_dictionaries` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: admin/regular roles, usage/default guards, metadata and dictionary UI reload |
| `list_dictionary_words` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `list_domains` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `list_groups` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: read results, selectors, scope denial, persistence and viewer reload |
| `list_memos` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `list_projects` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: existing scoped HTTP behavior; detailed evidence below |
| `list_schemas` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: read results, selectors, scope denial, persistence and viewer reload |
| `list_snapshots` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `list_tables` | `src/lib/server/mcp/tools/read-tools.ts` | Passed: read results, selectors, scope denial, persistence and viewer reload |
| `move_column` | `src/lib/server/mcp/tools/column-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `rename_db_object_category` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `rename_group` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `rename_schema` | `src/lib/server/mcp/tools/schema-ns-tools.ts` | Passed: scope/input rejection, metadata preservation, live browser export and reload |
| `restore_snapshot` | `src/lib/server/mcp/tools/snapshot-tools.ts` | Passed: scope/foreign-ID rejection, snapshot state, diff/migration, export and reload |
| `search_columns` | `src/lib/server/mcp/tools/analysis-tools.ts` | Passed: scope/input rejection, meaningful results, live export and reload |
| `set_project_dictionary` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: scope/input rejection, meaningful results, storage and browser reload |
| `set_project_naming_rules` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: scope/input rejection, meaningful results, storage and browser reload |
| `suggest_domains` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `update_column` | `src/lib/server/mcp/tools/column-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `update_db_object` | `src/lib/server/mcp/tools/db-object-tools.ts` | Passed: scope/input rejection, exact results, live export and reload |
| `update_dictionary` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: admin/regular roles, usage/default guards, metadata and dictionary UI reload |
| `update_dictionary_word` | `src/lib/server/mcp/tools/dictionary-tools.ts` | Passed: role/status visibility, validation atomicity, persistence and dictionary UI reload |
| `update_domain` | `src/lib/server/mcp/tools/domain-tools.ts` | Passed: scope/input rejection, hierarchy/results, storage and live export/reload |
| `update_foreign_key` | `src/lib/server/mcp/tools/fk-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `update_group_color` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `update_memo` | `src/lib/server/mcp/tools/memo-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |
| `update_table` | `src/lib/server/mcp/tools/table-tools.ts` | Passed: scope/input rejection, atomicity, results, live browser export and reload |

Discovery contract: `/tmp/erdmini-mcp-catalog.log` (1 passed). New read contracts:
`/tmp/erdmini-mcp-read-contract.log` (5 passed, 8.4s). Discovery of a name is not
evidence that its business operation is covered. The remaining Missing rows
require successful calls, meaningful negative cases, persistence and applicable
browser/collaboration checks before the broad E2E goal is complete.

Business verification: `/tmp/erdmini-mcp-business-fixed.log` — 25/25 passed
(2.2m), covering 24 names including the previously exercised add_table.
The two delete_tables cases cover partial matches and duplicate IDs.
Selected unit verification: 3 files / 179 passed; type check: zero errors/warnings.

Namespace verification: `/tmp/erdmini-mcp-namespace-fixed.log` — 4/4 passed
(7.6s). Add/rename reject blank names, rename rejects missing source namespaces,
and bulk assignment counts unique matching table IDs. Delete/rename preserve
columns, constraints, memo content and unrelated objects; bulk clearing checks
both null and empty string. Type check: zero errors/warnings.

DB-object verification: `/tmp/erdmini-mcp-objects-fixed.log` — 9/9 passed
(11.5s). Covers three viewer read tools and six editor mutations, filtering,
missing targets, duplicate/blank categories, SQL size/type rejection, Unicode,
default object fields, explicit empty SQL/comment/schema and false DDL flag,
category rename/cascade deletion, preservation of unrelated schema data, browser
export and reload. Baseline reproduced four blank-category validation failures;
HTTP schemas now trim and reject blank category names. Type check reports zero
errors/warnings in `/tmp/erdmini-mcp-objects-check.log`.

Analysis verification: `/tmp/erdmini-mcp-analysis.log` — 8/8 passed (11.3s).
Four layout algorithms each check grouped and ungrouped calls, finite distinct
positions, actual movement and retained table metadata. Viewer reads verify
case-insensitive partial/exact table matching and missing selectors, combined
column/domain filters and empty matches, an actual isolated table, and missing-PK
lint findings without false missing-FK-target findings. Every case checks scope,
invalid input, stored data and browser export/reload. Type check: zero errors and
warnings in `/tmp/erdmini-mcp-analysis-check.log`.

Export verification: `/tmp/erdmini-mcp-export.log` — 11/11 passed (1.1m,
including real login rate-limit waiting). Seven SQL dialects validate tables,
FKs, unique keys and indexes, plus explicit disabling of comments/FKs/indexes/
domains and lowercase keywords. Prisma/DBML check relations, indexes and comment
options; Mermaid/PlantUML check format markers, table names and required-FK
cardinality. Viewer keys succeed; invalid options and out-of-scope calls reject
without writes. Stored schemas remain exactly unchanged; browser export/reload
also preserves them. Type check: zero errors/warnings in
`/tmp/erdmini-mcp-export-check.log`.

Snapshot verification: 12 scenarios cover six tools, including seven migration
SQL dialects. `/tmp/erdmini-mcp-snapshot-baseline.log`: 10 passed / 2 failed.
One implementation defect (missing snapshot deletion returned success) is fixed;
one SQLite assertion now expects canonical TEXT and transactional table rebuild
rather than unsupported VARCHAR length. Changed cases and the strengthened
50-snapshot cap/retry test pass in `/tmp/erdmini-mcp-snapshot-fixed.log` (3/3,
6.9s). The nine unaffected baseline passes plus these three passes provide
focused evidence for all 12. Tests check cross-project snapshot IDs, exact
unchanged snapshot rows on denial, full snapshot data/metadata, real restore,
column-level diff, no-difference outputs and live export/reload. Type check:
zero errors/warnings in `/tmp/erdmini-mcp-snapshot-check.log`.

Bulk verification: `/tmp/erdmini-mcp-bulk-fixed.log` — 4/4 passed (7.6s).
Baseline reproduced three validation failures. Bulk add/update now require
integer bounded dimensions and validate all supplied domain links before any
mutation. Tests include a valid earlier item followed by an invalid later item,
exact unchanged data on rejection, defaults versus explicit PK creation, DECIMAL
scale zero, Unicode ENUM values, partial missing-target reporting, empty-field
clearing/domain unlink, retained metadata and live export/reload. Type check:
zero errors/warnings in `/tmp/erdmini-mcp-bulk-check.log`.

Import verification: `/tmp/erdmini-mcp-import-fixed.log` — 9/9 passed (14.9s),
covering seven SQL dialects plus Prisma and DBML. Each imports linked parent/child
tables, verifies PK/FK IDs, preserves existing tables on merge, repeats merge
without duplicate tables, then replaces tables and verifies live export/reload.
Blank/non-schema/malformed input and viewer/out-of-scope calls reject without
writes. Baseline failures all showed lost DB objects during replace; replace
now preserves existing non-table metadata and detaches memos from removed table
IDs. Type check: zero errors/warnings in `/tmp/erdmini-mcp-import-check.log`.

Domain verification: nine scenarios cover eight tools, including Markdown/HTML
dictionary exports. `/tmp/erdmini-mcp-domain-baseline.log`: seven passed and two
validation failures. Added integer/bounded dimensions, nonblank names, missing
parent and hierarchy-cycle rejection. Add passes in
`/tmp/erdmini-mcp-domain-fixed.log`; update passes in
`/tmp/erdmini-mcp-domain-update-fixed.log` after correcting its fixture to retain
column comments (DOMAIN_FIELDS deliberately excludes comment). Tests verify
case-insensitive lookup, child inheritance and linked-column length propagation,
delete/unlink/reparent, suggestions, exact group coverage percentages, metadata,
viewer scope and browser export/reload. Type check zero errors/warnings in
`/tmp/erdmini-mcp-domain-check.log`. All nine have passing focused evidence.

Project-settings/search verification: four new E2Es. Dictionary set/clear (null
and omitted ID) and case-insensitive partial/exact-name project lookup pass in
`/tmp/erdmini-mcp-project-settings.log`. Search proves an otherwise authorized
project is hidden when outside the API key scope. Naming set/get pass in
`/tmp/erdmini-mcp-project-settings-fixed.log` (2/2, 6.0s), including locked-rule
atomic rejection, per-project disable, clear-to-inheritance and global read.
Browser normalization maps absent namingRules to {}; comparisons preserve all
actual rule values and canonicalize only that empty representation. Site rules
are restored in finally. Type check zero errors/warnings in
`/tmp/erdmini-mcp-project-settings-check.log`.

Word-dictionary verification: six E2Es. Baseline four passed / two implementation
failures in `/tmp/erdmini-mcp-words-baseline.log`. Fixed whitespace-only words/
meanings, missing update targets, and transactional status+content updates.
Changed add/update/import paths pass in `/tmp/erdmini-mcp-words-fixed.log`
(3/3, 4.1s); existing dictionary-tool unit tests 16/16 pass in
`/tmp/erdmini-mcp-words-unit.log`. Type check zero errors/warnings. Tests cover
regular suggestions forced pending, approved-only reads/exports, admin pending
reads, count-only/pagination/search/category filters, own-versus-other suggestion
deletion, admin-only mutations, case-insensitive duplicate/import behavior,
rollback on status+duplicate-name failure, exact no-write rejection and real
regular-user dictionary UI/reload. Cleanup removes words in every status.

Dictionary-management verification: `/tmp/erdmini-mcp-dictionaries.log` — 4/4
passed (5.4s). Lists distinguish admin usage/project references from regular
metadata. Creation checks blank/duplicate/missing clone rejection and cloning
approved/pending words with new IDs and retained metadata. Update checks admin
restriction, missing/blank targets, nullable description, default switching and
single-default invariant. Delete rejects regular users, missing/default/word/
share-token/project-used dictionaries, then succeeds after dependencies clear.
Browser dictionary options survive reload. Defaults, project links, tokens,
words in all statuses, new dictionaries and keys are restored/removed in finally.
Type check zero errors/warnings in `/tmp/erdmini-mcp-dictionaries-check.log`.

## Branch audit still open

All 89 names now have an HTTP business-path case, but full scenario completion
remains unproven. Source review identifies these concrete follow-ups:

- Resolved: mixed existing/new imports remap FK targets to retained table and
  column identities by case-insensitive names, preserving composite order.
  Missing retained columns reject the entire import before persistence.
- Resolved: namespace rename/delete now updates assigned DB objects. Added
  assigned-object regressions preserve all other object metadata and verify
  live export/reload.
- Resolved: moving a DB object to a new category registers that category. The
  regression finds the retained object in the actual sidebar, opens its editor
  and repeats after reload.

These are test/source gaps requiring focused regression evidence, not passing
claims. Existing four-name calls marked “expand boundaries” above also require
review against their actual assertions during the final requirement audit.

Branch follow-up verification: `/tmp/erdmini-mcp-branches-baseline.log` reproduced
all three regressions (two namespace operations and one category move).
`/tmp/erdmini-mcp-branches-fixed.log`: 3/3 passed (7.2s);
`/tmp/erdmini-mcp-branches-unit.log`: selected schema-ops file 129/129 passed;
`/tmp/erdmini-mcp-branches-check.log`: zero errors/warnings. Only changed scopes
ran. Import merge FK remapping and the final requirement audit remain open.

Import-merge branch verification: three format-specific E2Es reproduced invalid
FK acceptance, then passed after shared mergeImportTables mapping/validation:
`/tmp/erdmini-mcp-import-merge-fixed.log` (3/3, 7.0s). They retain the original
three tables exactly, import a child referencing existing USERS by composite
columns, verify exact IDs, refuse unmappable columns without writes, repeat
without duplicates and verify live browser export/reload. Existing seven DDL
plus Prisma/DBML merge/replace cases also pass against the changed path in
`/tmp/erdmini-mcp-import-merge-regression.log` (9/9, 14.8s). Four focused unit
cases prove case/order mapping, immutability, missing-target rejection and links
between new tables. Type check zero errors/warnings. The three concrete branch
gaps above are resolved; the broader requirement-by-requirement completion audit
is still pending. No full suite run.

Original-read assertion audit: added a full get_schema contract case with exact
whole-schema JSON (tables, composite FK/UK/index IDs, domains, memo attachments,
namespaces, groups and DB objects), viewer success, missing/invalid/oversized
project arguments, out-of-scope denial, unchanged storage, live browser export
and reload. Existing list_projects scope-change/revocation test now verifies
returned name/timestamp metadata and absence of the other project, and compares
the complete initial get_schema result. Both pass in
`/tmp/erdmini-mcp-read-audit.log` (2/2, 5.3s). Add_table has expanded business
coverage and bulk_assign_domain has explicit name/pattern/list/unlink/limits
cases documented in E2E-COVERAGE.md; the initial four-name inventory is now
reviewed beyond transport success.
