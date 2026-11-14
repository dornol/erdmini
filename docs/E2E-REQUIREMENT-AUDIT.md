> Full validation completed 2026-11-14: **4,351 passed** (3,491 unit + 860 E2E). See [full results](E2E-FULL-RESULTS.md). Earlier pending/no-full-suite notes are historical.

# Requirement completion audit

Source: `docs/prd/PLAN.md`, implementation progress Phases 1–15. User scope:
write thorough E2E scenarios, and run only changed functionality. This audit
separates executable feature checks from architecture/deployment descriptions;
a tool-name count or download signature is not full behavioral evidence.

## Latest writing-first state

User requested writing first; tests, typecheck, browser/server startup and Docker
runs are deferred during this phase. Historical results below remain dated
evidence, not results for newly edited assertions. Source-defined inventory is
374 local / 477 server / 5 startup / 4 Docker, still uncollected. Writing-first
additions: 135 cases, plus strengthened existing assertions. The 96-row plan
matrix has a concrete scenario/source reference for every item; writing/review
status is distinct from verified completion.

Open source findings for later changed-only verification:
- Legacy startup: setupAdmin updates singleton index user_id but GET index reads
  user_<id>; no inspected startup code renames the index ID. The new legacy
  startup scenario deliberately expects usable migrated ownership and may fail.
- Palette navigation: selecting a hidden namespace target does not explicitly
  switch activeSchema in the inspected navigation code.
- Locked alignment: alignment includes locked selection while layout filters it.
- Runtime performance/render counts and production MCP behavior require evidence
  beyond source structure or development-mode functional cases.

## Current evidence and open checks

| Requirement | Actual inspected evidence | Assessment / next action |
| --- | --- | --- |
| Phase 1: persistence after closing a tab | `e2e/local-durability.spec.ts`: sole-tab close/reopen, complete Chromium shutdown/restart using the same isolated disk profile; multiple projects, IDs, metadata, snapshots and viewport | Focused pass recorded in E2E-COVERAGE.md |
| Phase 7: storage warning and emergency JSON | `e2e/storage-recovery.spec.ts`: scoped IndexedDB schema-write quota failure; exact persisted record unchanged; downloaded unsaved schema/metadata; viewport action cannot clear warning; dismissal; writes restored, later edit saves and reloads | 2/2 passed in `/tmp/erdmini-storage-recovery-verified.log` (8.5s). Initial failures were fixture polling/second-edit locator mistakes, corrected without changing product code |
| Phase 4: up to 200 undo steps | `e2e/tools-history.spec.ts` verifies order, past/future jumps and abandoned branches, but contains no 200-step cap assertion | Resolved by 205 real edits, exact 200-entry cap, oldest state accounts_5, every redo state accounts_6 through accounts_205, retained metadata and reload; `/tmp/erdmini-history-cap.log`: 1/1 passed (18.5s) |
| Phase 15: SVG/PNG/PDF exports include memos | `e2e/app.spec.ts` image-export tests create only a table; SVG checks table name, PNG/PDF check signatures | Resolved with `e2e/memo-export.spec.ts`: SVG contains free/attached content; PDF contains plain free text and UTF-16BE attached text; PNG verifies expected free-memo background and text pixels in its calculated image region. Each preserves stored schema/world style and reload. SVG baseline passes; PNG/PDF 2/2 pass in `/tmp/erdmini-memo-export-fixed.log` (5.9s) |
| Phase 14: 89 MCP tools | `docs/E2E-MCP-COVERAGE.md` maps source registrations and real HTTP cases; all names exercised. Added mixed import FK, namespaced object and category-move regressions | Name coverage verified; original read assertions now have whole-schema/project-metadata verification; focused evidence recorded below |
| Phases 1–13 and 15: other runtime behaviors | Detailed assertion inventory and focused results in `docs/E2E-COVERAGE.md`; local/server source tests | Inventory is a locator for evidence, not automatic proof that every requirement is complete. Continue reviewing actual assertions against each remaining explicit item |
| Docker/static/server architecture, implementation factories, CSS variables, memoization/throttling and file layout | Implementation/packaging details in PLAN.md | These require code/build/performance evidence as appropriate; a browser test cannot prove internal architecture. Do not infer completion from passing UI tests |

No whole-suite command was run for this audit. Current definition count is
258 local / 467 server scenarios (not a current all-green whole-suite claim).
The goal remains active: the image/history boundaries are now verified, but the
remaining requirement review must be finished before completion can be claimed.

History/image follow-up did not change product implementation. Export baseline
issues were test-fixture assumptions (PNG menu contains a localized prefix;
attached PDF text uses UTF-16BE because its label includes a pin glyph). Corrected
assertions still verify actual content. The PNG case proves the free memo's
rendered region, while SVG/PDF additionally prove the attached memo's label.

Theme/interaction review: four new real-pointer E2Es verify all four canvas
themes, theme persistence, independent dark panel colors, light restoration,
reload and exact unchanged stored schemas. They exposed three real pointer
obstructions: zoom controls over the Theme button, overflow clipping the menu,
and minimap stacking above menu items. Zoom controls now sit at canvas top-right;
the bar allows menu overflow while open and stacks above minimap controls.
`/tmp/erdmini-theme-matrix-passed.log`: 4/4 passed (9.2s).
`/tmp/erdmini-theme-zoom-regression.log`: three related reset/fit/minimap/keyboard
navigation cases passed (5.7s). Type check zero errors/warnings in
`/tmp/erdmini-theme-matrix-check.log`. Earlier interrupted intermediate runs
(exit 130) were deliberately stopped after confirming shared pointer blockers;
they are not passing evidence. Dark mode deliberately styles app panels while
the selected canvas theme remains independent.

Next concrete missing assertion: PLAN.md Phase 3 specifies nullable FK dashed
lines versus non-null FK solid lines. Current E2Es check relationship existence,
editing and persistence but no stroke-dasharray assertions. Add live toggling,
undo/redo and reloaded rendering before closing that requirement.

FK stroke follow-up: three new E2Es in `e2e/foreign-key-edit.spec.ts` check
Orthogonal/Bezier/Rounded with real style-menu selection. Both composite pairs
initially render solid. Changing only the first source column to nullable makes
only its SVG stroke dashed (`6 3`), with nonempty paths and exactly two hit targets.
Undo restores solid, redo restores the one dashed pair; saved table/column/FK
metadata matches the original except nullable. Reload retains that state and
renders the correct dashed/solid pair (line style itself is a transient canvas
setting and resets on reload). `/tmp/erdmini-fk-nullability.log`: 3/3 passed
(9.3s). No implementation change or whole-suite run. The concrete nullable-line
assertion gap is resolved; remaining requirement review is still open.

Memo-color/minimap review: six new cases in `e2e/memo-lifecycle.spec.ts` cover
every specified memo color. Each compares the card header and minimap computed
colors, confirms a measurable miniature, verifies undo/redo, exact saved memo
metadata, unrelated table preservation and reloaded colors. Initial failures
were polling an empty pre-save memo array; optional element access corrects the
fixture without product changes. `/tmp/erdmini-memo-colors-fixed.log`: 6/6 passed
(13.8s). Only added cases ran. Phase 15 color/minimap assertions now have focused
evidence beyond the earlier single blue-color smoke case. Final requirement
review (including original MCP read assertions) remains open.

Original MCP read review: get_schema now has a full rich-fixture exact JSON
contract with scope/input rejection and browser export/reload, rather than just
a table-count assertion. list_projects verifies metadata and excluded IDs and
retains immediate scope changes/project-access revocation checks. Both pass in
`/tmp/erdmini-mcp-read-audit.log` (2/2, 5.3s). One new server case; the other is
an existing strengthened case. No implementation change or full suite run.
The initial four MCP calls have now been reviewed/expanded; broader PLAN.md
requirement mapping still needs a final consolidated evidence review.

Phase 2 line-deletion review: existing tests deleted FK records via table editors,
not the line popover. Two new tests in `e2e/foreign-key-edit.spec.ts` open the
actual composite line by a real transformed SVG point click or focus+Enter,
cancel deletion, confirm whole-FK deletion, undo/redo and reload. Both preserve
all unrelated table/column metadata. Keyboard passes in `/tmp/erdmini-fk-popover.log`;
mouse passes in `/tmp/erdmini-fk-popover-fixed.log` (1/1, 6.5s). Mouse baseline
was a DOMPoint serialization fixture error, corrected to a plain x/y object.
No product change or full suite run.

Additional permission branch requiring direct evidence: `popoverDeleteFk` waits
for confirmation and then deletes without checking the current isReadOnly prop.
The existing pending-confirmation matrix does not include this line popover.
Add viewer downgrade/revocation during the pending dialog and verify exact live
and stored data before closing the final authorization audit.

FK pending-confirmation authorization follow-up: two server cases extend the
existing exact-data confirmation matrix to the FK line popover, for viewer
downgrade and complete project revocation. Both baseline cases reproduced local
FK removal despite rejected server writes. `RelationLines.svelte` now rechecks
current isReadOnly after awaiting confirmation. Both pass in
`/tmp/erdmini-fk-confirmation-fixed.log` (2/2, 9.0s), proving exact retained live
export and stored schema, HTTP write denial, regrant, cancellation, successful
retry and reload. Type check zero errors/warnings in
`/tmp/erdmini-fk-confirmation-check.log`. The concrete permission branch above is
resolved. No full suite run; final consolidated requirement mapping remains.

Sidebar review (Phase 4/8): two new cases in `e2e/sidebar-navigation.spec.ts`
verify creation/name order with exact rendered rows, group member counts,
collapsed-group persistence across reload, re-expansion, case-insensitive column
name and column-comment matching, selected table/editor identity, no-result state,
clear-search restoration and exact unchanged saved schema. Existing smoke tests
covered name search and Group activation but did not prove these outcomes.
`/tmp/erdmini-sidebar-navigation.log`: 2/2 passed (6.4s). No product change or
whole-suite run. Full requirement mapping still remains to be consolidated.

Consolidated requirement inventory: `E2E-PLAN-MATRIX.md` retains all 96 checked
PLAN.md progress items with stable phase/item IDs. Nineteen have reviewed focused
assertion/evidence references; 77 remain explicit review tasks with candidate
locations. Pending review is not a claim that tests are absent, nor that those
requirements are achieved. This replaces vague “final review remains” with a
finite auditable inventory. Direct searches do not establish existing E2E
coverage for Ctrl+drag additive marquee, Space+drag panning or sidebar-width
restoration; inspect implementation and add user-path cases as needed. No tests
were executed for this documentation-only inventory step.

Navigation-boundary follow-up: P07.04 and P08.10 now have reviewed evidence.
Space+left drag uses real keys/mouse, verifies exact viewport delta, unchanged
scale/selection/schema, released cursor, saved viewport and reload; passes in
`/tmp/erdmini-navigation-boundaries.log`. Sidebar resize verifies min/max clamps,
final localStorage width/reload and exact unchanged schema; passes in
`/tmp/erdmini-sidebar-width-fixed.log` (1/1, 5.2s). Its first fixture clicked the
clipped half of the handle; corrected to the visible inner region. No product
change or full suite run. Matrix now has 21 reviewed rows / 75 pending review.

Additive-selection follow-up: two new Control/Meta real-key/mouse cases in
`e2e/additive-selection.spec.ts` prove additive table+memo marquee preserves the
first selected table, ordinary marquee replaces both table and memo selections,
exact stored schema stays unchanged and reload clears transient selection.
`/tmp/erdmini-additive-selection.log`: 2/2 passed (6.8s). P07.01 and P07.02 now
have reviewed focused evidence. Matrix: 23 reviewed / 73 pending review. No
product change or full suite run.

Basic interaction review: P01.05 adds a real wheel cursor-anchor test. Browser
wheel events round delivered coordinates, so the fixture captures the actual
event point rather than assuming fractional layout coordinates are delivered
unchanged. Zoom in/out preserves that world point, saves/reloads viewport and
keeps the schema exact. `/tmp/erdmini-cursor-zoom-fixed.log`: 1/1 passed (5.2s).
No product change. P01.04/P07.03/P04.07 now reference inspected existing table
drag/group drag/column reorder assertions with exact offsets/IDs and reload.
Those unchanged cases were not rerun; historical focused/full evidence remains
recorded in E2E-COVERAGE.md. Matrix: 27 reviewed / 69 pending review. No full run.

Column flag/popup review: four new real-double-click popup cases test PK, NN, UQ
and AI enable/clear, automatic NN on PK enable, exact table/column/FK/UK/index
metadata, undo/redo and reloaded enabled/cleared states. Default/CHECK/comment
fields stay intact. `/tmp/erdmini-column-flags.log`: 4/4 passed (17.3s). No product
change or whole-suite run. P03.05 now has reviewed popup evidence; P01.03 flags
are verified but its combined add/delete/name/type requirement remains under
review. Matrix: 28 reviewed / 68 pending review.

P01.03 combined column-edit requirement review: added a new-column lifecycle
case for real add/name/type/default/comment edits, exact untouched existing
columns/constraints, reload form values, direct independent-column deletion,
metadata-complete undo/redo and final reload. A column without FK dependencies
intentionally deletes without a confirmation dialog; the initial fixture
incorrectly expected one. Corrected case passes in
`/tmp/erdmini-column-basic-lifecycle-fixed.log` (1/1, 7.0s). Together with four
flag cases and inspected dependency deletion cases, P01.03 has reviewed evidence.
No product change or whole-suite run. Matrix: 29 reviewed / 67 pending review.

Table duplication review: two new Control/Meta cases reproduce dropped schema
namespace on UI duplication. `duplicateTableOp` now copies src.schema. The cases
verify scoped visibility, fresh IDs, complete retained column metadata, deliberately
empty FK/UK/index collections, original table/memo/domain preservation, independent
copy rename and reload. `/tmp/erdmini-table-duplication-verified.log`: 2/2 passed
(7.7s). Intermediate timeout was an unnecessary overlapping-card click; the test
now verifies the already-selected copy editor before editing. Selected table-ops
unit file: 44/44 passed; type check zero errors/warnings. P04.06 and P08.02 now
have reviewed evidence (Ctrl+A selection also inspected in app.spec.ts). Matrix:
31 reviewed / 65 pending. No full suite run.

DDL comment/prefix/ALTER review: two new MySQL/PostgreSQL cases import explicit
schema-qualified CREATE statements with inline or COMMENT ON table/column
comments plus a separate ALTER TABLE FK. Assertions verify stripped names,
retained app namespace, exact comment/type/length data, resolved FK column/table
IDs and CASCADE/RESTRICT actions, live relationship UI and exact reloaded tables.
`/tmp/erdmini-ddl-qualified-comments.log`: 2/2 passed (7.5s). No product change or
whole-suite run. P02.05/P03.02 now reviewed; matrix 33 reviewed / 63 pending.

Layout lifecycle review: five new UI algorithm cases verify actual finite/distinct
position changes, unchanged full table/column/FK/UK/index metadata, preserved
relationships, exact undo/redo and saved/reloaded positions. Four pass in
`/tmp/erdmini-layout-lifecycle.log`; Smart passes after matching its actual
Smart (beta) label in `/tmp/erdmini-layout-smart-verified.log` (1/1, 6.0s). The
intermediate anchored grep selected no tests and is not passing evidence. No
product change or full suite run. P03.03 reviewed; matrix 34 reviewed / 62 pending.
P08.07 (layout only new imports, retaining existing placement) remains separate.

P08.07 import-layout review: four new cases combine independent/FK-related
imports with Skip/Overwrite. They verify newly added positions differ from the
raw parser grid (so bypassing auto-layout would fail), finite distinct placements,
retained original/overwritten position/color/group/lock/ID, unchanged other table,
FK remapping to existing IDs, exact undo/redo and reload. Initial preparation
failed to approve JSON replacement over the beforeEach schema; explicit Replace
fixes the fixture. `/tmp/erdmini-import-layout-fixed.log`: 4/4 passed (17.6s).
No product change or full suite run. Matrix: 35 reviewed / 61 pending review.

Writing-first instruction (latest user steering): prioritize completing scenario
code before execution. Added three unexecuted scenarios to
`e2e/import-export-roundtrip.spec.ts`: rich schema shared URL in a fresh readonly
browser with source preservation/reload, two-project rich backup restoration,
and backup cancellation preserving newer edits. Tests compare table/column/FK/
UK/index/domain/memo/object metadata and stable IDs, then reopen both projects.
P04.11/P08.09 are marked Written; new cases unverified. No passing evidence is
claimed and no test/typecheck command ran. Only git diff --check was used.
Defined source count increases by three to 261 local / 467 server; this is an
unverified definition count pending later collection/execution.

Writing-first batch 2 (unverified): `e2e/display-alignment.spec.ts` adds eight
scenarios: PK/FK-only and names-only display, four edge alignments and two axis
distributions. Display assertions cover exact names/type visibility, intact FK
rendering, no schema/history mutation and restoring All. Spatial assertions
cover actual rectangle edges/equal coordinate intervals, fixed distribution
endpoints, attached memo delta, full metadata preservation, undo/redo/reload.
P08.05/P13.06 marked Written; new cases unverified. No tests or typecheck ran;
only git diff --check. Source-defined count becomes 269 local / 467 server,
pending collection and execution. Written-first batches now contain 11 cases.

Writing-first batch 3 (unverified): 12 more scenarios. Eleven locked-member
layout/alignment/distribution cases assert exact locked table preservation,
unchanged movable metadata, attached memo offset and persistence/history. The
three-selected/one-locked distribution boundary deliberately expects no mutation
because fewer than three movable tables remain. One minimap case covers namespace
colors/counts, attached memo exclusion, detach/undo/redo and reload without
changing unrelated memo/table metadata. Source inspection suggests alignment uses
all selected tables while auto-layout filters locked members; this is a candidate
regression for later execution, not a verified defect or an implementation fix.
No test/typecheck ran. Writing-first cases total 23; source-defined inventory
281 local / 467 server remains uncollected/unverified for new cases.

Writing-first batch 4 (unverified): 12 cases added. File diff coverage includes
seven migration dialects with exact added/removed/modified UI classification,
expanded/collapsed details, meaningful SQL and exact downloaded SQL, unchanged
storage/reload; malformed/missing-table JSON rejection and corrected retry; and
identical-file no-change state. Two Control/Meta palette cases cover no results,
Enter no-op, Escape, keyboard wrap, case-insensitive column search and revealing
its hidden namespace with no stored schema edits. The current navigation code
selects/centers a table without explicitly changing activeSchema, so hidden-target
visibility is a candidate failure for later verification. No product fixes,
tests or typecheck executed. New writing-first cases: 35 total. Source-defined
inventory: 293 local / 467 server, pending collection and execution of additions.

Writing-first batch 5 (unverified): three new server cases cover viewer/editor
presence cursor transforms, remote selection clearing, leave/rejoin and no schema
writes; and HttpOnly/Strict session cookie, 30-day default expiry, document.cookie
isolation and reload. Twelve server requirement rows now link actual existing
scenario groups or these new cases as Written; evidence review pending. Existing
OIDC/auth/ownership/sharing/LWW/reconnect/memo collaboration work is retained,
not duplicated or claimed newly verified. No tests or typecheck ran. Writing-first
new cases total 38; source-defined inventory 293 local / 470 server, pending
collection/execution for additions.

Writing-first batch 6 (unverified): 19 local scenarios in
`e2e/color-sidebar-lifecycle.spec.ts`. Fourteen palette cases cover selected state,
rendered header color, individual override of inherited group color, clearing,
undo/redo/reload and intact unrelated data. One group membership lifecycle covers
trimmed names, inherited color changes, clearing and undo/reload. Four sidebar
memo cases cover first-line preview, 30-character Unicode truncation, empty first
line and empty content placeholders, color dot, selection without writes,
delete/undo/reload with exact memo/table preservation. P04.10/P15.05 marked
Written; new cases unverified. No tests, typecheck or collection executed.
Writing-first additions total 57; source-defined inventory 312 local / 470 server,
pending collection and execution of additions. This is not a completeness claim.

Writing-first batch 7 (unverified): four local diagram export scenarios in
`e2e/diagram-export-lifecycle.spec.ts` cover Mermaid/PlantUML × nullable/required
composite foreign keys. Assertions inspect one relationship per composite FK,
cardinality, PK/FK/UK/AI where supported, VARCHAR length, document boundaries,
exact downloaded text/extension and unchanged saved schema through reload.
P08.12 marked Written; new cases unverified. No tests/typecheck/collection ran.
Writing-first additions total 61; source-defined inventory 316 local / 470 server,
pending collection/execution. Remaining requirement review is still open.

Writing-first batch 8 (unverified): four minimap navigation scenarios appended to
`e2e/project-viewport.spec.ts`, crossing two click locations with 100%/150% zoom.
Expected world coordinates use the rendered table/map ratio rather than copying
bounds calculations; actual click coordinates account for browser rounding.
Assertions cover exact viewport centering, unchanged scale, marker center,
canvas persistence/reload and no schema writes. P04.04 marked Written; new cases
unverified. No tests/typecheck/collection executed. Writing-first additions total
65; source-defined inventory 320 local / 470 server, pending collection/execution.

Writing-first batch 9 (unverified): ten local bulk lifecycle scenarios in
`e2e/bulk-edit-lifecycle.spec.ts`: color/group/comment/schema set and clear (eight),
all-field cancellation, and lock/unlock. Assertions cover disabled initial submit,
selected-only changes, trimmed groups, preserving constraints/columns/attached
memos and unselected table, single undo/redo, and reload. P13.03 marked Written;
new cases unverified. No tests/typecheck/collection executed. Writing-first
additions total 75; source-defined inventory 330 local / 470 server, pending
collection/execution. Requirement review and further missing cases remain open.

Writing-first batch 10 (unverified): two ENUM popup cases appended to
`e2e/column-lifecycle.spec.ts` cover whitespace/empty-token normalization with
Unicode values and clearing optional values. Exact column metadata, other tables,
constraints, undo/redo and reopened input after reload are asserted. Existing
DECIMAL/NUMERIC dimension boundary and dialect ENUM roundtrip cases linked to
P08.08 without duplicating them or claiming new passing evidence. No tests,
typecheck or collection executed. Writing-first additions total 77; source-defined
inventory 332 local / 470 server, pending collection/execution.

Writing-first batch 11 (unverified): six local memo scenarios appended to
`e2e/memo-lifecycle.spec.ts`. Four resize cases cross 100%/150% zoom with growth
and minimum 120×80 clamping; two inline edit cases cover multiline Unicode and
empty-content draft/blur commit. Exact memo metadata, table preservation,
undo/redo and reload are asserted. P15.01/P15.03/P15.04 now link concrete scenario
groups; existing cases are not claimed newly verified. No tests/typecheck or
collection executed. Writing-first additions total 83; source-defined inventory
338 local / 470 server, pending collection/execution.

Writing-first audit batch 12: inspected actual assertions in foreign-key-edit,
constraints, domain-lifecycle, import-export-roundtrip and project-viewport rather
than relying on filenames. Nine requirement rows now link specific existing
scenario groups (P02.01/P02.04/P03.01/P03.04/P03.07/P04.02/P04.08/P08.01/P08.04),
marked Written; evidence review pending. No duplicate cases added and no new
passing evidence claimed. The inspected tests cover composite FK draft/action
lifecycle, JSON preservation/cancel/merge, domain linked-only propagation,
seven-dialect semantic roundtrip, UK/index lifecycle and viewport/snap boundaries.
Relationship crow-foot geometry, full lint rule UI coverage and DDL option output
semantics still require closer review; basic existing smoke assertions alone do
not close those requirements. No tests/typecheck/collection executed. New unrun
cases remain 83; source-defined inventory remains 338 local / 470 server.

Writing-first batch 13 (unverified): eight DDL option scenarios in
`e2e/ddl-options-lifecycle.spec.ts`: three indentation modes, four identifier quote
styles with lowercase keywords, and independent comment/index/FK/domain toggles.
Assertions inspect actual output and preference persistence/reload without schema
writes. P13.04 marked Written; new cases unverified. No tests/typecheck/collection
executed. Writing-first additions total 91; source-defined inventory 346 local /
470 server, pending collection/execution. Full writing audit remains open.

Writing-first batch 14 (unverified): strengthened three existing relationship
style cases in `e2e/foreign-key-edit.spec.ts` rather than duplicating their setup.
Assertions now inspect optional participation circles, two 1:N labels and actual
crow-foot SVG geometry (aligned prong ends, off-axis vertex and midpoint) in
addition to nullable dash changes across undo/redo/reload. P02.02 marked Written;
new assertions unverified. No tests/typecheck/collection executed. The number of
new cases remains 91; three previously verified cases now also contain unexecuted
assertions. Source-defined inventory remains 346 local / 470 server.

Writing-first batch 15 (unverified): 13 local invalid-fixture lint UI cases in
`e2e/lint-rule-lifecycle.spec.ts` cover core rule labels, exact details and severity,
including separate missing table/column paths, case-insensitive duplicates,
cycle, empty table, nullable PK, pair count, non-unique reference and type mismatch.
Saved schema must remain unchanged through panel use/reload. Import normalization
may reject or repair malformed fixtures; those are explicitly unverified inputs
for later targeted execution, not claimed UI defects. Domain/dialect/naming rule
coverage still needs audit. No tests/typecheck/collection executed. Writing-first
additions total 104; source-defined inventory 359 local / 470 server.

Writing-first batch 16 (unverified): three more lint fixtures cover a self-parent
domain, two-domain cycle, and UUID incompatible with MySQL. Same exact UI label,
severity/detail, no-write and reload assertions apply. Existing server naming
cases were inspected: table case/prefix inheritance, override/off, admin locks,
project isolation and dictionary pagination/error/retry already have UI evidence;
this does not prove every column/suffix naming branch is written. Those remaining
branches stay open for subsequent audit. No tests/typecheck/collection executed.
Writing-first additions total 107; source-defined inventory 362 local / 470 server.

Writing-first batch 17 (unverified): four server naming lint cases appended to
`e2e/server/security.spec.ts` cover column case/prefix/suffix and table suffix.
Each sets an admin-locked rule, asserts warning target/value and table/column
navigation, reload persistence, no browser schema PUT, then saves a compliant
rename through the admin API and asserts the warning clears with exact stored
schema. Global rules restore in finally. No tests/typecheck/collection executed.
Writing-first additions total 111; source-defined inventory 362 local / 474 server.

Writing-first batch 18 (unverified): one server WAL scenario checks the isolated
SQLite file through a separate read-only connection, observes initial and changed
schema JSON committed through HTTP, and compares the HTTP read. P09.01–P09.03
linked to concrete local/server storage scenarios/configs; source/startup audits
remain pending. Docker deployment and initial admin bootstrap still require
specific coverage and are not closed by generic authentication tests. No tests,
typecheck or collection executed. Writing-first additions total 112;
source-defined inventory 362 local / 475 server.

Writing-first batch 19 (unverified): one configured initial-admin scenario checks
one e2e-admin identity with admin role and Argon2 hash, authenticates using the
configured password, accesses admin UI/API, reloads and logs out twice without
changing the identity/hash. This tests the already bootstrapped isolated server;
it does not yet prove empty-database startup, process restart, fallback generated
password or legacy project ownership migration. P10.05 remains partial rather
than complete. No tests/typecheck/collection executed. Writing-first additions
total 113; source-defined inventory 362 local / 476 server.

Writing-first batch 20 (unverified): separate `playwright.startup.config.ts`
and two startup tests in `e2e/startup/admin-bootstrap.spec.ts` launch isolated
servers with temporary SQLite files and free ports. Empty DB configured/generated
password paths assert one hashed admin, real UI login/admin API, then restart with
a different configured password and prove original identity/hash/password survive.
Generated credentials must only appear on first startup; configured passwords must
not appear in captured logs. Child process groups and temporary data clean up in
finally. Startup suite must run separately from other Vite suites. Local config
excludes startup files. No server/test/typecheck/collection was launched.
New unrun cases: 115 (113 local/server + two startup); source-defined
inventory 362 local / 476 server / 2 startup.
Legacy singleton ownership migration remains pending.

Writing-first batch 21 (unverified): legacy singleton ownership startup scenario
seeds the actual V001 SQLite structure with a project/index/schema and no users,
starts the isolated server, authenticates the generated admin identity using its
configured password and asserts project visibility, exact API index/schema,
user-owned index migration and reload. P10.05 startup branches are now written,
not verified. No tests/typecheck/servers/collection executed. Writing-first
additions total 116; inventory 362 local / 476 server / 3 startup.

Writing-first batch 22 (unverified): separate Docker config and two container
scenarios build actual local nginx/server Dockerfiles, use unique image/container
names and dynamic localhost ports, save through UI and retain data after restart.
Server uses an isolated volume and fresh browser login; local checks nginx deep
link SPA response. Cleanup removes only test-named resources. Docker suite is
excluded from local discovery and must run separately. No Docker/build/server,
test/typecheck/collection command executed. Writing-first additions total 118;
inventory 362 local / 476 server / 3 startup / 2 Docker. Compose orchestration
itself is still not covered by these Dockerfile cases.

Writing-first batch 23 (unverified): two Compose scenarios use the checked-in
service definitions/local profile, relocating build/env paths to a temporary
Compose file. Unique project names isolate generated resources; test-only env
avoids loading personal .env values, PORT=0 requests dynamic host ports. Tests
assert UI save/reload/restart and fresh server session persistence; finally downs
only that project and its volumes/images. P03.09/P09.04 now have Dockerfile and
Compose scenario code, all new cases unverified. No Docker/build/server/test,
typecheck or collection command executed. Writing-first additions total 120;
inventory 362 local / 476 server / 3 startup / 4 Docker.

Writing-first batch 24 (unverified): two column comment/CHECK set-clear cases
cover exact changed column, undo/redo, reopened input, constraints/other-table
preservation and reload. Twelve matrix rows now link concrete canvas/image/PDF,
column and MCP scenario/source evidence; internal implementation claims remain
explicitly source review or deployment pending, not inferred proven from UI.
No tests/typecheck/collection executed. Writing-first additions total 122;
inventory 364 local / 476 server / 3 startup / 4 Docker. Bulk deletion and
implementation-only performance/message-count claims remain to audit.

Writing-first batch 25 (unverified): four bulk deletion cases cross Control/Meta
selection with Delete/Backspace. Cancellation leaves exact storage unchanged;
confirmation removes only selected tables, detaches their memo without loss,
restores exact FK/column data and attachment in one undo, redoes and reloads with
unselected metadata intact. P03.06 marked Written; new cases unverified. No tests,
typecheck or collection executed. Writing-first additions total 126; inventory
368 local / 476 server / 3 startup / 4 Docker. Incoming references from surviving
tables are covered by prior single-table cleanup, not this new fixture.

Writing-first audit batch 26: final two generic Review pending rows now have
specific source evidence. All four locale files contain 926 message keys with
identical key sets (excluding $schema), superseding the historical ~270 count.
RelationLines uses $derived.by and Minimap gates rAF with rafPending; these source
facts do not prove runtime performance/render counts. Bulk fixture now gives the
surviving audit table an incoming reference to deleted users; all four deletion
cases additionally require exact surviving-table FK cleanup, no rendered FK
lines and exact restoration on undo. No tests/typecheck/collection executed.
New case count remains 126; the four bulk cases contain further unrun assertions.
No remaining generic Review pending label does not establish completeness:
written/evidence-pending and explicit performance/production gaps remain open.

Writing-first audit batch 27: source inspection found nullable primary keys are
normalized to NOT NULL by loadSchema/JSON import. Replaced the unreachable UI lint
warning fixture with an explicit import-normalization/no-warning/reload scenario.
The actual nullable-pk lint branch has direct cases in schema-lint.test.ts (not
executed in this writing phase). Other malformed fixture fields are not repaired
by normalizeSchema; their new UI cases still await execution. Case count remains
126 additions / 368 local / 476 server / 3 startup / 4 Docker. No tests/typecheck
or collection executed. This corrects earlier batch 15's nullable-PK UI coverage
claim; no product defect was demonstrated or fixed.

Writing-first batch 28 (unverified): one viewport-only relationship/minimap
scenario asserts immutable world path/dash geometry and miniature object styles
during repeated keyboard pan and zoom, while world transform/viewport marker
change and schema remains unchanged through reload. This is functional regression
coverage, not a render-count or timing benchmark; P08.13 performance remains
unverified. No tests/typecheck/collection executed. Writing-first additions total
127; inventory 369 local / 476 server / 3 startup / 4 Docker.

Writing-first audit batch 29: corrected bulk comment clear to expect undefined
(updateTableComment uses comment || undefined), and group-change lifecycle to
expect cleanup of unused Core color while retaining Other after undo. Source
inspection also found setupAdmin updates singleton user_id but not index id,
whereas GET index queries user_<id>; recorded as a candidate legacy-startup defect,
not reproduced and not fixed during writing-only work. Added current-state audit
header so historical counts/results are not mistaken for current verification.
No tests/typecheck/collection executed; counts unchanged (127 additions).

Writing-first batch 30 (unverified): production Dockerfile-server and Compose
server cases now invoke a shared HTTP MCP assertion helper. It creates a real
admin API key, checks the complete 89-tool contract through the built /mcp route,
reads saved tables through a business call without schema writes, revokes the key
and expects HTTP 401. This closes a writing gap for production route/factory
availability; build/execution evidence is still missing. No Docker/server/test,
typecheck or collection executed. Case counts unchanged (127 additions), with two
Docker cases now containing further unrun production assertions.

Writing-first batch 31 (unverified): extended existing text-edit shortcut matrix
with column-popup input (one additional case). Existing input/memo/SQL cases
already covered native undo/redo, select all, Backspace/Delete, duplicate, arrows,
zoom/fullscreen keystrokes without diagram mutation/navigation, so those were not
duplicated. Column popup now shares the same focused-input and diagram-state
assertions. No tests/typecheck/collection executed. Writing-first additions 128;
inventory 370 local / 476 server / 3 startup / 4 Docker.

Writing-first audit batch 32: fixed lint detail selection to an anchored,
case-sensitive escaped regex so duplicate table names parent/PARENT cannot match
the same locator. Added E2E-WRITING-HANDOFF.md with changed-file/behavior mapping,
known source findings and separate focused execution configurations. Corrected
wording that described deferred verification as an authorization restriction.
No tests/typecheck/collection executed; case count unchanged (128 additions).

Writing-first batch 33 (unverified): one API key storage scenario verifies erd_
format, exact SHA-256 DB hash, no raw key in stored row/list and no hash in API
list, stable hash on rename, scoped key authentication and row/scope cleanup plus
HTTP 401 on revocation. No tests/typecheck/collection executed. Additions total
129; inventory 370 local / 477 server / 3 startup / 4 Docker.

Writing-first audit batch 34: all four Docker/Compose cases now wait for durable
schema names in actual IndexedDB or server HTTP storage before reload/restart,
avoiding a false failure caused by stopping during autosave debounce. Added shared
`deployed-storage.ts` helper. This is test synchronization, not product behavior
change. No tests/typecheck/collection or containers executed. Counts unchanged:
129 additions, 370 local / 477 server / 3 startup / 4 Docker.

Writing-first batch 35 (unverified): two isolated startup cases cover existing
users suppressing environment-admin creation (real seeded Argon2 password and
unchanged identity/hash), and empty ADMIN_USERNAME defaulting to admin. Existing
login/admin access and configured credential non-disclosure are asserted. No
servers/tests/typecheck/collection executed. Additions total 131; inventory
370 local / 477 server / 5 startup / 4 Docker.

Writing-first audit batch 36: statically resolved 69 relative imports across E2E
and Playwright configs; none missing. Confirmed local config excludes server,
startup and Docker directories, which have separate testDir configs. Hardened
startup spawn-error handling/no-PID cleanup and bounded each startup/container
readiness fetch to five seconds so a hung HTTP request cannot defeat poll timeout.
No runtime/test/typecheck/collection executed. Counts unchanged (131 additions).

Writing-first batch 37: structural audit found 96 checked PLAN progress items and
96 unique matrix IDs, each with evidence. Status distribution at this point:
35 reviewed focused evidence, 40 written/evidence review pending, 18 new cases
unverified, one new assertions unverified, two source-only rows. This is mapping
integrity, not completion proof. PLAN section 6 also explicitly requires live FK
updates while dragging: three new style cases assert changed path while mouse is
still held, exact metadata, undo/redo/reload geometry. PLAN's historical 53-file /
2073-pass statement is not current verification; literal dash 5 3 and direct click
delete prose differ from current 6 3/popover UI and remain documented spec drift.
No tests/typecheck/collection executed. New cases 134; inventory 373 local /
477 server / 5 startup / 4 Docker.

Writing-first batch 38 (unverified): one all-table deletion boundary asserts
zero tables/FKs, preserved detached memo and sidebar preview, complete graph and
attachment restored by one undo, redo and reload with namespaces/domains intact.
No tests/typecheck/collection executed. Additions total 135; inventory 374 local /
477 server / 5 startup / 4 Docker.

Verification resumed at user request. First focused batch (five newly written
local files, 62 collected cases) was interrupted after a confirmed shared locator
failure: BulkEdit field-row has filter incorrectly nested the modal locator.
Changed it to a relative field-toggle locator. Isolated `bulk color set` then
passed 1/1 in 3.0s (`/tmp/erdmini-bulk-selector-recheck.log`). Restarted the same
five-file batch at `/tmp/erdmini-writing-validation-2.log`; results pending.
The interrupted run is not a passing result and no whole-suite command was used.

Focused verification follow-up: color clear also needed getByTitle because the
selected dot has accessible name ✓. Corrected bulk/palette selectors. The second
62-case attempt ended with one real locator timeout plus four connection-refused
failures after its reused dev server exited; 56 did not run. Re-ran all eight bulk
field set/clear cases with a dedicated CI web server: 8/8 passed in 24.5s,
`/tmp/erdmini-bulk-fields-verified.log`. No product changes in this batch.
Remaining new/strengthened cases are still pending focused verification.

Full changed-scope verification requested. Local batch A: 62 distinct cases now
have passing evidence across `/tmp/erdmini-validation-local-a.log` (44 passes
before deliberate interruption on shared lint menu locator failure) and
`/tmp/erdmini-validation-local-a-fixes.log` (18/18, 30.6s). Fixed lint menu count
suffix selector and macOS native Control-click fixture (explicit ctrlKey click
branch on macOS; Meta remains native). All palette/sidebar/bulk/DDL-options/
diagram-export/lint cases passed without product changes. Docker engine started
successfully (29.9.2). Local batch B is running separately; no whole-suite command.

Changed-scope verification batches B/C: file diff/display/ordinary alignment 18
passes (`/tmp/erdmini-validation-local-b.log`); reproduced auto-layout failing to
move attached memo coordinates. applyLayout now uses moveTableOp, and alignment
filters locked members. All 11 locked layout/alignment/distribution cases passed
(`/tmp/erdmini-validation-locked-layout.log`, 33.0s). Reproduced memo resize
creating intermediate undo states: added resizeMemo transient dimension updates
and commits updatedAt on release. Reproduced palette hidden namespace navigation:
navigateTo now opens the target schema. Corrected local share copy's editable
expectation and multiplicative zoom labels (five steps = 161%, not 150%). CSS
matrix/storage comparisons tolerate 0.001px serialization rounding.
Local C evidence: 14 baseline passes, six fixes, five subsequent passes (one
overlap), and four final minimap passes. Together all 28 distinct selected cases
passed; logs `/tmp/erdmini-validation-local-c*.log` and
`/tmp/erdmini-validation-layout-minimap.log` (9/9, includes five existing layout
regressions). Total local writing-first scope: 119 distinct new/strengthened cases
passed, plus five related existing layout regressions. Server/startup/Docker
verification remains in progress; no full suite executed.

Server writing-first scope: seven initial passes in
`/tmp/erdmini-validation-server-new.log` plus three fixed cases in
`/tmp/erdmini-validation-server-fixes.log` (3/3, 10.1s) establish all ten new cases.
Presence now waits for initial editable-page normalization save; final rejoin
comparison preserves all schema content except load timestamp. Revoked bearer
keys correctly expect API's documented implementation status 403, not missing-
header status 401; production helper corrected too. No server product changes.
Startup five-case isolated lifecycle suite now running.

Changed-scope validation complete: all 135 writing-first additions, three
strengthened FK cases and five existing layout regressions have passing evidence
(143 distinct E2Es). Server 10/10; startup five branches (legacy index rename fix
verified); Docker/Compose 4/4 in 2.0m after correcting host/internal port isolation
and stable host-port mapping. Related units 54/54; svelte-check 0 errors/warnings.
See E2E-VALIDATION-RESULTS.md and deduplicated E2E-VALIDATION-PASSES.tsv. No complete
suite was run. Source-only performance remains distinct from runtime benchmarks.
