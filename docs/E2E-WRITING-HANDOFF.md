> Full validation completed 2026-11-14: **4,351 passed** (3,491 unit + 860 E2E). See [full results](E2E-FULL-RESULTS.md). Earlier pending/no-full-suite notes are historical.

> Latest: changed writing-first scope is verified; see [validation results](E2E-VALIDATION-RESULTS.md). Historical unverified statements below describe the writing phase.

# Writing-first handoff

This is a review map, not a passing test report. User requested writing first and,
when execution resumes, only changed functionality should be tested. Do not use
an unfiltered whole-suite command as the next step.

## New and strengthened areas

| Area | Scenario files | Assertions awaiting execution |
| --- | --- | --- |
| Transfer and migration | import-export-roundtrip, diff-file-lifecycle | Rich share/backup data; cancel/restore; seven migration dialects; invalid/identical file |
| Canvas | display-alignment, project-viewport, preferences-keyboard | Display modes; six align/distribute operations; locked layouts; minimap centering; palette navigation; column-input shortcuts |
| Tables and columns | color-sidebar-lifecycle, bulk-edit-lifecycle, column-lifecycle | Fourteen palette choices; group inheritance; field set/clear; lock/unlock; selected deletion; ENUM; comments/CHECK |
| Relationships | foreign-key-edit | Optional markers, crow-foot geometry, pan/zoom world geometry stability |
| Memos | memo-lifecycle, color-sidebar-lifecycle | Namespace minimap filtering; resize/minimum at two zooms; draft/blur commit; sidebar boundaries/delete/undo |
| Export and lint | diagram-export-lifecycle, ddl-options-lifecycle, lint-rule-lifecycle | Cardinality/constraints/download text; actual option output; invalid fixture labels/severity; normalization |
| Server | server/security | Presence/cursor/rejoin; session cookies; naming branches; WAL; configured admin |
| Startup | startup/admin-bootstrap | Empty DB, configured/generated password, restart identity, legacy singleton ownership |
| Containers | docker/deployment, docker/compose; helpers/production-mcp | Both images/services, restart persistence, fresh session, production MCP discovery/read/revocation |

Names above refer to `.spec.ts` files under `e2e` unless a helper is named.
Detailed numbered writing batches are retained in E2E-REQUIREMENT-AUDIT.md.
The plan matrix maps all 96 checked plan items to specific evidence locations.
That mapping alone does not prove exhaustive scenario coverage or completion.

## Known source findings

- Hidden namespace palette navigation selects/centers without an explicit
  activeSchema switch in inspected code. Preserve the desired visible-target
  assertion; reproduce before changing implementation.
- Alignment receives all selected tables while layout excludes locked members.
  Preserve locked-table immobility assertions; reproduce before fixing.
- Legacy admin setup updates singleton index user_id, but the read route expects
  user_<id>. The startup case expects the migrated project to remain accessible.
- Nullable PK is normalized by JSON import. Its UI case checks normalization;
  the lint branch itself is covered directly in schema-lint.test.ts.
- Internal render batching/timing is not established by stable SVG geometry.

## Separate execution configurations

| Scope | Config | How to keep verification focused |
| --- | --- | --- |
| Local browser | playwright.config.ts | Name changed spec files and use `--grep` for changed cases in larger files |
| Server browser | playwright.server.config.ts | Run changed security cases by descriptive `--grep`; isolated DB is configured |
| Fresh startup | playwright.startup.config.ts | Name admin-bootstrap.spec.ts; five dedicated lifecycle cases |
| Container deployment | playwright.docker.config.ts | Choose deployment.spec.ts or compose.spec.ts; requires Docker |

Run configurations sequentially: startup/local/server development servers share
Vite-generated files. Container builds are separate expensive checks. Do not run
all configs simultaneously. Test helpers must clean up their own process groups,
contexts and uniquely named resources; verify cleanup in the first focused runs.

No execution, collection, typecheck or Docker startup was performed during this
writing phase. Historical focused passes apply only to their documented old
assertions. New cases and changed assertions remain unverified. Source-derived
inventory estimates must be confirmed by later collection before treating counts
as authoritative. Current estimate: 374 local, 477 server, 5 startup, 4 Docker;
135 newly written cases plus strengthened existing assertions.

## CI execution policy

Routine CI (main pushes, PRs and reusable release/deployment checks) runs type
checking and unit tests only. E2E suites are validated locally by default.
For an explicit runner check, use Actions → Manual E2E → Run workflow and select
local, server, startup or docker. This workflow has only workflow_dispatch;
no push, PR, tag or reusable-workflow trigger starts it automatically. Automatic
CI no longer installs Playwright browsers or uploads Playwright artifacts.
