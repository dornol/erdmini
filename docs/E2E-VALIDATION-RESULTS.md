> Full validation completed 2026-11-14: **4,351 passed** (3,491 unit + 860 E2E). See [full results](E2E-FULL-RESULTS.md). Earlier pending/no-full-suite notes are historical.

# Changed-scope validation results

Requested scope: validate all writing-first additions and strengthened cases,
fix failures, and run only changed functionality rather than the entire suite.

**All 135 newly written E2Es have passing evidence.** Three strengthened existing
FK cases and five related layout regressions also passed: **143 distinct E2Es**.
Related unit tests: **54/54**. `pnpm check`: **0 errors, 0 warnings**.
`git diff --check` is clean. No unfiltered full-suite test command was run.

| Scope | Distinct passing cases |
| --- | ---: |
| Local writing-first additions + strengthened FK assertions | 119 |
| Existing layout regressions after implementation fix | 5 |
| New server presence/auth/naming/storage/key cases | 10 |
| Isolated initial-admin startup/restart/migration | 5 |
| Dockerfiles and Compose local/server lifecycle + production MCP | 4 |
| **Total** | **143** |

The deduplicated per-case evidence manifest is E2E-VALIDATION-PASSES.tsv. It names
the test file, case title and actual passing log. Partial/interrupted runs only
contribute completed passing cases; failed/interrupted cases are never counted
as passing unless a later focused rerun passed.

## Implementation fixes reproduced and verified

- Auto-layout now moves attached memo coordinates with their table, using the
  same move operation as manual movement. Five ordinary layout regressions and
  the locked-member layout cases pass, including metadata/undo/redo/reload.
- Align/distribute excludes locked tables. Locked members remain fixed and two
  remaining movable tables cannot trigger distribution.
- Memo resize sends transient dimension updates and commits one history step on
  release. Growth/minimum size at 100% and 161% zoom passes undo/redo/reload.
- Command palette navigation opens a hidden target's schema. Both Control/Meta
  cases pass no-result, wrap, Escape and visible selected target assertions.
- Initial-admin legacy migration renames the singleton project index to
  user_<adminId> while assigning ownership. The seeded V001 project is visible
  with exact saved content through login and reload.

## Test corrections

Relative popup filters and selected color-dot titles fixed locator errors. Native
macOS Control-click is a context-menu gesture, so its ctrlKey application branch
is explicitly dispatched; Meta remains native. Local hash sharing creates an
editable copy; server sharing permissions remain separately tested. Zoom grows
multiplicatively. CSS matrix serialization uses a sub-millipixel tolerance.
Presence waits for initial normalization save and compares schema content across
rejoin; load timestamps may change. Revoked MCP keys return 403 by contract.

Container tests separate internal PORT=3000 from the selected host port, preserve
the same browser origin across restart, and wait for durable storage before
restart. Both production server cases verify all 89 MCP tool names, a business
read, unchanged schema and revoked-key rejection. Test containers/volumes/images
were removed; no test Vite/Playwright processes remained at final inspection.
Docker Desktop was started for these tests and remains running.

These results prove this changed scenario scope. Source-only performance claims
are not timing benchmarks, and the historical full-suite inventory is not a claim
of a fresh whole-suite pass.
