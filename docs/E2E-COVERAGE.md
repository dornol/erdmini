> Full validation completed 2026-11-14: **4,351 passed** (3,491 unit + 860 E2E). See [full results](E2E-FULL-RESULTS.md). Earlier pending/no-full-suite notes are historical.

> Latest: changed writing-first scope is verified; see [validation results](E2E-VALIDATION-RESULTS.md). Historical unverified statements below describe the writing phase.

# E2E coverage audit

Run the suites sequentially: both Vite modes generate files under `.svelte-kit`
and `src/lib/paraglide`, and Playwright writes to the same artifact directory.
Run `pnpm check` before starting E2E, too: its SvelteKit sync can trigger Vite
reloads during a test.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:server
```

Each local test starts in a fresh browser context. Server tests share the isolated
SQLite database selected by `playwright.server.config.ts`; shared admin settings
and cached sessions mean the server suite must retain its single worker.
`security.spec.ts` creates separate accounts and browser sessions, cleans up its
resources, and retries login setup only for HTTP 429 while respecting the real
login rate limit. LDAP policy/StartTLS tests use a separate helper that also waits only on HTTP 429 from the independent LDAP limiter. Its longer timeout allows the rate-limit window to expire.
Embed password POSTs also share the real per-IP limit (10 per 15 minutes),
including successful/invalid-token attempts; keep their suite-wide total below
that boundary rather than resetting or bypassing the limiter.

## Current scenario inventory

Goal completion audit update (2026-11-13): earlier “no unwritten scenarios”
statements applied only to the five enumerated gaps, and do not prove the whole
objective. A fresh comparison with `docs/prd/PLAN.md` found uncovered pending
confirmation permissions, actual browser shutdown durability and MCP business
operations. New focused coverage/results are recorded at the end; the broad
goal remains active with the missing MCP paths tracked in
[E2E-MCP-COVERAGE.md](E2E-MCP-COVERAGE.md).

Earlier verification (2026-11-13): the five identified writing gaps now have
**40 additional E2Es**, all passing in focused reruns (6 local + 34 server).
The new cases cover additional temporal/ENUM conversions, transport/non-JSON
provider-form errors, real external login after historical DB restore, additional
open-work permission changes, and collaborative optional-field clearing.
Type checking reports zero errors/warnings; the prior unit/integration run passed
111 files / 3,479 tests.

Defined inventory: **258 local / 467 server** E2Es after the goal audit additions. This is not a current full-suite
passing claim. The earlier 205/285 full green reports predate this batch. A new
full local run was explicitly cancelled at the user's request (exit 130); no new
full server run was started. Per user instruction, subsequent verification must
target changed functionality only, while keeping local/server runs sequential.

The historical notes below retain earlier baseline failures. Their latest fixes
and focused results supersede those baselines. Restore copy-failure tests are
handler integration tests and are not counted as browser E2Es.

| Area | Existing executable coverage | Remaining audit / scenarios |
| --- | --- | --- |
| Projects | Create, switch, duplicate, rename/reload, delete, backup/restore; cancel deletion; pending-edit save, schema/selection/history isolation between projects; active-project deletion fallback, schema/canvas/snapshot cleanup, pending-save/delete ordering and final-project protection | Listed project lifecycle scenarios implemented |
| Tables / columns | Create, rename, edit flags/defaults, delete, duplicate, bulk edit, lock; drag column reorder/reload; delete source/target composite-FK columns with cancellation, dependent UK/index/FK cleanup, undo/redo and reload; table deletion detaches memos and cleans incoming FKs with undo/redo/reload; viewer table/header controls natively disabled and movement/keyboard edits blocked; DECIMAL/NUMERIC popup scale zero versus blank, invalid integer/range inputs, unchanged domain links/history on rejection, valid per-column unlink, sibling/domain/constraint preservation, undo/redo and reload | Listed viewer controls implemented; live permission revocation remains in collaboration audit |
| Constraints | Composite UK, unique index, FK create/edit/delete, composite/self FK, drag FK; incoming self-reference deletion from row and popup with cancellation/reload; composite FK pair/action/label editing with cancel, undo/redo and reload; target-table change resets stale references, same-target reselection preserves pairs | Listed FK editor flows implemented |
| Constraint boundaries | New FK incomplete-pair validation/removal and cancelled draft reset; empty/incomplete selection disabled, duplicate choice excluded, cancel clears draft, remove selected modal row, create/delete persistence, undo/redo deletion | Listed boundaries implemented; retain these checks for future constraint changes |
| Canvas | Zoom, pan, fit, marquee, minimap, touch, layout/alignment, display settings; adjacent table selection through overlapping column tooltip; locked drag protection and mixed locked/unlocked group movement; table/memo half-cell snap boundaries and no-op history protection; viewer table/memo movement blocked; pan/zoom-only save/reload, default new-project view and project/namespace viewport restoration; server navigation writes canvas without rewriting schemas | Listed navigation scenarios implemented; readonly variants remain in the permission audit |
| Memos | Create, edit, Escape cancellation, delete by button/keyboard with cancellation and undo/redo/reload; color, resize, attach/detach; attached movement with single/group table drag and persistence; single/group memo movement saved as one undoable gesture; locked edit/resize/move protection; viewer content/delete/color/resize/move controls blocked | Listed memo lifecycle and viewer controls implemented; concurrent attachment/detachment versus single/group table deletion and live cross-browser controls implemented |
| Namespaces / objects | Create/switch/filter scoped tables/memos/FKs; rename/cancel/duplicate/blank validation; delete/cancel/unassign with undo/redo/reload; namespace drag reorder; object SQL/category/comment/export editing and cancel deletion; rapid SQL edits and close/project navigation persistence; category rename validation/cancel and membership propagation, delete/cancel/undo/redo, reorder/search/collapse with reload; empty namespace selection reset and scoped table/memo creation with reload; viewer category/object edit controls disabled and SQL focus keeps diagram shortcuts isolated | Listed object/category controls implemented; live permission revocation remains in collaboration audit |
| Domains | Create/link/unlink/delete, XLSX import/export/template; linked-column impact cancel/confirm and propagation/reload; used-domain deletion cancellation and metadata-preserving unlink; coverage, unused filter and metadata search; corrupt XLSX preserves schema, same-input retry, upsert propagation and blank-name skip; a delayed workbook after project navigation changes neither project, and a newer upload supersedes an older pending read with persistence/reload; editor downgrade during a pending file read discards the import, and permission recovery allows same-file retry with server persistence/reload; multi-row collaborative import propagates every update/addition with linked-column changes, identical exported client schemas, server persistence, whole-import undo/redo and both reloads; numeric zero/boolean false defaults and documentation, zero scale, mixed flag encodings and trimmed lists survive XLSX import/export/reimport with stable IDs and reload; XLSX/legacy XLS duplicate trimmed names apply the final row without duplicate IDs, preserve linked/unlinked columns and unrelated domains, ignore other sheets, reimport without a redundant undo step, and support whole-import undo/redo/reload; empty/header-only/missing-name-header sheets leave schema/history intact and allow same-input retry; XLSX/XLS dimensions omit invalid text, infinity, negatives, fractions, blank/boolean and oversized cells, retaining valid numeric strings, zero scale and maximum ranges without changing existing domains/columns across reload; DECIMAL/NUMERIC create/edit rejects invalid dimensions through Save/Enter/row switching, preserves cancelled drafts and unrelated data, saves corrected values and clears optional dimensions without nulls; existing hierarchical XLSX/XLS reimport retains IDs/parents/inherited lengths/explicit overrides, updates parent-linked columns, and supports whole-import undo/redo/reload; parent selector excludes self/descendants, inherited-column impact includes descendants, explicit child overrides remain unchanged, reparent preview/cancel/confirm and reload; middle/root deletion recalculates reparented subtrees, preserves direct-unlink metadata and supports cancel/undo/redo/reload; MCP bulk assignment by name/pattern/explicit references, unlink, invalid-domain/pattern/missing-selector/no-match atomic rejection and immediate viewer-key enforcement; duplicate/missing explicit references, empty-selector precedence, 1001-entry atomic rejection, 1000-match cap and 1000-entry unlink | Written: six native dimension-editing regressions pass after adding native Length inputs. Written: open domain-draft downgrade/regrant coverage passes; six editor surfaces audited below |
| Import/export | DDL dialects, DBML, Prisma, JSON, merge duplicates, malformed files, image/text exports, backups; full JSON download/reimport metadata/ID preservation; DDL round trips for all seven DBMS dialects plus DBML/Prisma (columns, PK/identity and resolved FK actions); invalid DBML/Prisma retry without data loss; cancelled JSON replacement and duplicate merge; composite PK/UK, unique/non-unique ordered indexes and composite FK actions survive export/import/reload across all seven SQL dialects; DBML/Prisma composite PK/UK/unique-index/normal-index/FK semantics with ordered columns and actions survive export/import/reload; all seven dialects preserve space-containing/Unicode/reserved names, referenced column identities, precision/zero scale and numeric/escaped-string defaults through export/import/reload; native doubled delimiters in table/column names preserve identities and FK targets across all seven dialects and both reloads | Written: fifteen native ENUM/time/binary boundary scenarios pass after native type/precision preservation fixes. Written: Oracle/SQLite/H2 binary conversions added; six additional Oracle/SQLite/H2 temporal and unsupported-ENUM fallback scenarios pass |
| Tools | Palette, SQL success/error, snapshot restore/delete, diff/migration; lint navigation reveals a hidden namespace, live PK correction and reload; history jump/ordered intermediate redo, abandoned-future discard and branch persistence; naming modes inherit/override/off change lint and persist across reload/project switches; admin locks override project values, disabled site rules stay inactive, viewers inspect without schema writes; all four affix warnings clear on table/column edits and case checks exclude configured affixes; dictionary validation fetches page two, strips affixes, follows selected dictionary and table/column/both targets, and persists through reload; stale first/second-page responses cannot replace newer dictionary choices; first/second-page HTTP, network and invalid-JSON failures show incomplete validation, publish no partial words and recover via Retry/reload; project switching ignores stale dictionary successes/failures and preserves each project’s selection through switch-back/reload; error/warning/info ordering and exact offending-column highlight across hidden namespaces, live correction and reload; future history-row jumps replay intermediate steps, retain remaining redo entries and persist a selected past state | Listed lint column/severity ordering and history UI jump boundaries implemented |
| Preferences / responsive | Theme, sidebar, presentation, mobile notice; four-language switching/reload without losing edits; input/textarea/SQL native undo/redo, select/delete/copy/paste and diagram shortcut isolation; viewer locale switching without writes; in-flight and failed locale-save handling with retry | Listed preference flows implemented; responsive notice covered by existing mobile flow |
| Authentication | Login success/failure, redirects, logout; password validation/cancel/change, cookie rotation and other-session revocation; admin password reset; pending login denial and revocation surviving reapproval; browser OIDC discovery/HTTPS/S256 PKCE/RS256-JWKS code exchange, registration/session/relogin identity reuse and state replay rejection; expired database state and missing authorization code reject callbacks/replay without token exchange, followed by successful fresh-state login/reload; browser-bound state rejects callbacks in another browser while preserving both valid pending logins; discovery 503/malformed JSON/wrong issuer returns to login with a visible error and no user/session/state cookie; fresh discovery after repair authenticates and reloads; missing authorization/token/JWKS endpoints fail before login state creation, and JWKS 503/empty-key failures reject sessions and recover after cache invalidation; consent denial, invalid-grant responses, token endpoint 503 and missing ID tokens; failed callback replay cannot retry token exchange; invalid signatures, expired/not-yet-valid tokens, wrong issuer/audience, pending approval and provider disabled during consent cannot create sessions; fresh approved/reenabled login recovers; allowed-group filtering, case-insensitive admin mapping, custom scalar claims and empty-claim removal, manual membership preservation, privilege removal in another existing session and group-shared project access revocation; group-name collisions cannot auto-enroll users into manual or another provider’s group, preserving its membership and denied project access after relogin/reload; LDAPS browser login with service/user bind, incorrect-password rejection, identity reuse and session/reload; directory group removal revokes synchronized membership and mapped admin/project privileges; allowed-group DN matching preserves embedded commas, multiline admin edits survive reload, and group-search errors/lost membership deny login; clearing optional group search/admin/allowlist settings persists through reload and keeps stored bind credentials usable; registration disabled blocks new accounts but accepts existing identities, inactive providers deny before bind, unknown/pending users cannot get sessions and reapproval recovers; StartTLS encrypts both binds, rejected upgrades never send plaintext credentials; service-bind rejection, user-search error and mid-search disconnect create no identity/session or user bind, then recover after repair with browser reload; LDAPS and StartTLS reject untrusted and trusted-but-hostname-mismatched certificates with zero bind/search requests, then recover on the same listener after certificate replacement and retain the session on reload; stalled service/user binds and user/group searches fail within a bounded request without creating accounts/sessions, then recover; admin connection-check timeout/recovery; LDAPS and approved StartTLS handshakes stall before binds and time out for login/admin checks, then recover on the same listener | Listed LDAP/OIDC failure boundaries implemented |
| Authorization | Viewer UI, viewer write/delete denied, editor write allowed/delete denied, revoked read/write denied, admin denied to user; group membership/share revocation, direct/group maximum permission and deduplication; MCP key read/write/project scopes, live scope changes and key/project access revocation; personal-key malformed/ungrantable/duplicate scope requests rejected without mutation; ownership handover, former-owner demotion/revocation and last-owner protection; admin-key malformed metadata/body/scopes and duplicate scopes rejected without partial creation/edit, valid multi-field update and restriction reset | Listed key/ownership scenarios implemented; live collaboration permission revocation remains |
| Collaboration | Two-tab join/table propagation; independent owner/editor browser contexts, edit/ordered undo/redo/delete/restore and reload rejoin; forced WebSocket outage, missed-change sync and editing after automatic reconnect; revoked sockets denied sync requests and broadcasts; editor-to-viewer downgrade blocks writes while retaining read updates; logout/deactivation invalidates open sockets, global admin demotion uses current role without dropping permitted viewer updates | Open editor permission downgrade/restore on window focus and 10-second visible-window refresh; HTTP/network/no-access results stay readonly and valid retries recover; stale permission responses cannot overwrite a newer downgrade. Revoked-project reload prunes inaccessible index entries, selects a surviving editable project or empty welcome state, and persists the fallback without modifying revoked data. Concurrent independent-field edits and delete-versus-rename converge in both peer delivery orders with server persistence and both-browser reload. Same-field table/column names and rapid local commits converge to the last server-accepted overwrite in both delivery orders, with stored state and both reloads verified. Single/group table movement with attached memos converges in both delivery orders, with both exported client schemas, stored positions and both reloads verified. Single/group memo movement also converges in both delivery orders, retaining group offsets and stored/reloaded positions. Concurrent column reorder converges to the accepted full ID order in both peer orders, preserving column data/PK/UK/index/FK identities and both reloads. Namespace/category order conflicts converge in both peer orders without altering memberships or object data. DB-object/category creation, metadata/SQL edits, category reassignment/rename, cancellation/deletion, undo/redo and both reloads propagate; target DBMS updates and clearing persist without schema loss. Column reorder against concurrent column addition/deletion converges in both delivery orders, retaining new column properties, surviving IDs/UKs and deleting affected indexes/self FKs; live peers, storage and both reloads agree. Composite FK creation versus source/target column/table deletion and UK/index creation versus member-column deletion converge in both delivery orders, without dangling references, lost surviving metadata or partial constraints; both live UIs, both JSON exports, storage and both reloaded browsers agree. Valid FK/UK/index creation propagates in both directions with labels, ordered pairs and referential actions retained. FK retarget versus source/target column/table or FK-record deletion converges in both orders, retains unrelated constraints, and cannot resurrect a deleted FK; valid composite self-retarget preserves IDs/actions/labels and both reloads. Memo attach/detach/reattach/new-create operations versus single/group table deletion converge in both delivery orders, preserving contents, final world positions and surviving links; four live controls verify valid operations without deletion. Memo movement versus detachment and attachment-versus-attachment/detachment converge in both delivery orders with live UIs, both client exports, storage and reload verified. Written: all four domain unlink/parent deletion conflicts pass in both orders after explicit field clearing and derived-state reconciliation |
| Sharing / embed | Share hash readonly, password validation, token revocation; unknown/expired plain and protected tokens denied through API and browser; anonymous token cannot authorize storage or embed writes; public view shortcuts preserve data; password body validation and successful view creates no session; anonymous revocation/reload | Listed embed access boundaries implemented; retain rate-limit checks when adding password attempts |
| Administration | Users/groups/providers/API keys/settings/dictionary/backup/audit; restore cancellation, malformed upload/file and missing project_index rejection without DB replacement; valid downloaded-backup round trip restores schema/index and captured admin session; cached site settings and naming rules reload from the restored DB; connected collaborators automatically reconnect, synchronize restored schema, edit and reload persisted changes; checksum mismatch and failed migration restore rollbacks preserve newer live edits, sessions and collaboration; newer-version backups are rejected before swapping databases, preserving live edits/sessions and continued collaborator edits/reload; V17→V18 migrates dictionary words/share tokens with browser verification; audit API offset boundaries and browser load-more/detail/search reset, delayed older filters cannot overwrite current results; duplicate/invalid user creation preserves accounts, failed form and original password; malformed JSON/group fields and trimmed duplicate names cannot partially create/edit groups, change membership or shared access; duplicate create/edit forms retain drafts and corrected edits persist through reload; OIDC admin rename/blank-secret edits preserve credentials, direct empty-secret updates keep the stored value, rotated secrets apply on next login; DB restore invalidates warm OIDC credentials and restores successful login with the captured identity | Written: genuine V2/V4/V8/V12/V16 core-data restores, rename-failure rollback, pending-user filter and API-key owner search (all pass). Written: populated V11/V12/V16 credentials/identities/group/scoped-key restores pass; copy-failure rollback has two passing handler integration tests (not E2E); 36 provider API validation scenarios (all pass after atomic input validation and duplicate-URL checks) and four browser draft/retry scenarios (all pass after OIDC save-error handling fix) |

The inventory describes implemented assertions, not a claim that every feature is
fully covered. A panel-opening assertion proves navigation only. Complete each
remaining scenario with user-visible outcomes and relevant persistence/permission
checks before declaring the all-scenarios goal complete.

## Latest verified runs (2026-11-12–13)

- `pnpm check`: zero errors and warnings.
- `pnpm test`: 105 files, 3,435 tests passed after the memo detach-position fix.
- `pnpm test:e2e`: all 174 Chromium tests passed in 302.0 seconds (5.0 minutes).
- `pnpm test:e2e:server`: all 196 Chromium server-mode tests passed in 839.8 seconds (14.0 minutes).
- Both full-run JSON reports confirm zero unexpected failures, flaky results or skipped tests.
- Local report start: `2026-11-12T13:17:31.301Z`; server report start: `2026-11-12T22:38:46.443Z`.

Both full suites ran after the operation-queue and no-op history fixes. Every
local operation in a Svelte batch is captured at emission time and drained in
order, with no mutable payload aliasing or old-project queue replay. Multi-row
domain import verifies updates/additions, linked-column propagation, identical
client JSON exports, stored data, whole-import undo/redo and both reloads. Four
unit regressions cover ordering, snapshots, project isolation and remote
suppression.

The full server run passes 50 controlled-delivery concurrency cases for field
edits, movement, column and namespace/category ordering, and column reorder
against concurrent addition/deletion. Assertions cover live convergence, surviving
column properties and constraints, affected constraint removal, storage and both
reloads. DB-object/category lifecycle, DBMS selection/clearing, authentication
failures, permission revocation, backup restore/rollback/migration and reconnect
also pass. Real local/LDAP login limits remain enabled throughout.

TLS coverage uses untrusted certificates, a trusted-chain leaf valid only for
wrong.example.test, and stalled LDAPS/approved StartTLS handshakes. Certificates
are rejected before bind/search/account/session creation, and replacing the
certificate on the same listener restores login/reload. Stalled TLS reproduced
ldapts not applying its connection limit to the StartTLS upgrade. The shared TLS
connector now bounds handshake establishment at 10 seconds while retaining
certificate verification; all four login/admin-check timeout/recovery scenarios
pass in the full server run.

All 15 domain lifecycle tests pass in the full local run. XLSX and legacy XLS
duplicate rows retain identities and final-row values, propagate structural
fields while preserving column comments, ignore unrelated tabs, and undo/redo as
one import. Reimporting identical content advances the timestamp without adding
an undo step. Empty/header-only/missing-name-header sheets preserve schema/history
and permit retry. The local suite also covers editing, hierarchy, constraints,
imports/exports, history, namespace/object lifecycle, keyboard behavior, navigation
and persistence.

These results verify the executable suite at the stated scope. Remaining scenarios
in the inventory still need implementation and verification before declaring the
all-scenarios objective complete.

Fourteen further dialect identifier/type/default round trips pass in the latest
full local run above. They reproduced MSSQL removing necessary identifier quotes and
failing to resolve spaced ALTER FK names, SQLite exporting unquoted names by
default, and SQLite type normalization rewriting a quoted FK column. These paths
are fixed; SQLite defaults to double quotes, with explicit no-quote still honored.
Doubled native delimiters in table/column names also round-trip across all seven
DBMS dialects. Export now escapes the closing delimiter, while import protects
these identifiers from parser limitations and restores names after FK resolution.
Six lexical regressions verify alias reuse, SQL/name restoration, collision
avoidance and preservation of literals/comments/dollar strings. All 3,417 unit
tests and type checking pass. The complete import/export file passes all 36 E2Es
in 1.5 minutes, including previous dialect/composite/DBML/Prisma/JSON regressions.
The fresh full 174-case local run includes all identifier/parser/export and
numeric-dimension additions. The fresh 196-case server run also includes the current parser/export and
inbound-reference code.

Two XLSX/legacy XLS numeric-dimension E2Es reproduced Infinity persisting in
IndexedDB (and therefore risking null on JSON serialization), negative/fractional
values and whitespace becoming zero scale. Import now accepts finite integers
within the editor-declared ranges (length 1–65535, scale 0–30), ignoring invalid
cells while preserving the remaining row. Both formats verify valid string/zero/
maximum values, unchanged existing domains/linked columns, and browser reload.
All 15 domain lifecycle E2Es pass, including the latest full 174-case local run.
Six further domain scenarios pass after that full run: four DECIMAL/NUMERIC
create/edit draft checks and two hierarchical XLSX/XLS reimports. These reproduced
missing numeric validation and NUMERIC dimension controls in the domain editor,
and Svelte's null value for an emptied number input. A shared lightweight parser
now provides the same integer bounds to import and editing; invalid drafts cannot
save through buttons, Enter or row-switch auto-save, while empty optional fields
persist as omitted values. NUMERIC exposes precision/scale like DECIMAL. Existing
hierarchy reimports retain IDs/parent links and explicit descendant overrides,
propagate parent changes, and undo/redo/reload as one import. All 26 domain E2Es
pass across both files. Local coverage now defines 180 tests; the last full local
run above contains 174 and predates these six cases and editor fixes.

Four DECIMAL/NUMERIC popup dimension scenarios reproduced zero becoming an empty
scale and invalid negative/fractional/oversized dimensions being committed while
unlinking the domain. Numeric inputs now honor native validity before emitting
an operation and distinguish blank from zero using valueAsNumber. Invalid edits
reopen with the original value, linkage and undo history; a valid edit unlinks
only the edited column, retaining sibling links, domain metadata and all
constraints. Zero and blank both survive undo/redo and reload. All four targeted
E2Es pass, together with all 36 column/domain/hierarchy E2Es in 1.7 minutes.
Type checking and all 3,417 unit tests also pass. Local coverage now defines 184 cases;
the full 174-case result above predates the six domain and four popup additions and their editor fixes.

Thirteen constraint collaboration E2Es pass in 1.3 minutes: twelve controlled
creation/deletion conflicts plus a live bidirectional creation control. The
initial run reproduced ten dangling-constraint/divergence failures; deletion of
the FK-owning table already passed in both orders. Inbound FK/UK/index creation
now checks the current source/target columns before applying the operation,
retaining valid single/composite constraints and existing unrelated IDs/metadata.
The positive control verifies editor-created FK/index and owner-created UK, FK
label updates in the same operation batch, paired-column order, actions, live
counts, both client exports, storage and both reloads. Sixteen new unit cases
cover live/self/composite references, missing endpoints, duplicate/malformed
column lists and pair-count mismatches. Type checking and all 105 files / 3,433
unit tests pass. These thirteen cases and the inbound-reference fix are included in the latest
full 196-case server run.

On 2026-11-13, ten FK retarget/deletion scenarios pass together with the previous
thirteen creation/control cases: all 23 E2Es passed in 2.3 minutes. After fixing
an initial test fixture count, the unmodified update path reproduced six
divergence failures when retargeted source/reference columns or the new target
table were deleted; owning-table/FK-record deletion already passed in both
orders. An invalid incoming update now removes only its edited FK, rather than
retaining an obsolete or dangling relationship. Missing FK records remain
missing, including after operation acknowledgements. Both live UIs, both JSON
exports, storage, both reloads and unrelated FK/UK/index identities are verified.
The live control also retargets a composite FK to its own table with new actions
and label, retaining its ID across both browsers and reloads. Type checking and
all 3,433 unit tests pass. All 23 constraint scenarios and the inbound-reference fixes are included in the
fresh full 196-case server run above, including 50 controlled concurrency cases.

The full 196-case server report was reverified after completion: start
2026-11-12T22:38:46.443Z (2026-11-13 KST), duration 839751.618 ms, expected 196,
unexpected/flaky/skipped all zero. Twenty memo attachment/detachment and single/group table-deletion cases were
added after this run, including four live controls without deletion. All twenty
pass separately in 2.1 minutes; they are not part of the verified full-run total.

The memo baseline passed sixteen cases and reproduced four position mismatches
when detachment raced single/group table deletion in either order: the receiver
kept (360,420) instead of the sender's detached (80,38) because the table was
already absent. Detach messages now include an optional final world position,
captured at emission time; receivers use finite supplied coordinates and retain
the previous calculation path for legacy messages without them. The twenty E2Es
verify live UIs, both client JSON exports, stored tables/memos, stable attachments
and both reloads for existing/new memos and valid attachment/reattachment. Two
unit cases verify emitted positions with present/missing tables and immutable
position snapshots after later movement. Type checking and all 3,435 unit tests
pass. Server coverage now defines 216 cases, including 66 controlled concurrency
cases; the last full 196-case server result predates these twenty scenarios and
the detach-position fix.


On 2026-11-13, all 28 memo collaboration E2Es passed together in 2.5 minutes,
including eight new single/group movement-versus-detachment and attachment-state
conflicts. Baselines reproduced incorrect final positions and attachment links.
Acknowledgements now track accepted attachment and position fields independently,
filter superseded local writes and apply field state without replaying attachment
positioning actions. Missing attachment targets clear stale links. Thirteen added
unit cases cover snapshots, independent field supersession and state application;
all 106 files / 3,448 unit tests pass and type checking reports zero errors/warnings.
The full 196-case server report above predates these changes.

Unwritten-scenario expansion (2026-11-13): five genuine historical DB fixtures
(V2, V4, V8, V12 and V16) are built by executing their migration SQL, retaining
compatible account/session/project rows and real migration checksums. All five
restore through the production upload endpoint and verify current migration
version, preserved schemas/owner permissions, browser session, edits and reload.
V2 also verifies missing owner permissions are backfilled. Fixture-only errors
in the initial runs (missing applied_at default and permissions response wrapper)
were corrected before evaluating these results.

The admin pending-user filter E2E reproduced an empty list after approving the
last pending user, when the filter checkbox disappeared but stayed active. The
filter now applies only while pending users exist; approval, toggling, complete
list restoration, API state and reload pass. A real filesystem rename failure is
induced with a directory at the isolated test DB safety-file destination. Its E2E
passes: the endpoint returns 500, newer live data and authenticated sessions are
preserved, collaborators reconnect, continue editing and both reload correctly.
The server config shares its isolated DB path with workers so this fixture targets
only the current run. These seven cases are verified separately; API-key
owner search/selection/creation subsequently passed (see latest verification below).
Server coverage now defines 236 cases (78 controlled concurrency cases).

Twelve native SQL boundary E2Es are newly written: MySQL/MariaDB/PostgreSQL/H2
ENUM ordering with escaped apostrophe, comma, Unicode and empty values; plus
MySQL/MariaDB/PostgreSQL/MSSQL TIME zero/six precision and binary dimensions,
including MSSQL DATETIMEOFFSET zero precision and PostgreSQL BYTEA normalization.
They assert exported SQL, imported semantic fields and reload; corrected results
are recorded below. Six native domain dimension-editing E2Es are also written;
their baseline failures are recorded below. Local coverage now defines 202 cases; the last full local 174-case
report predates these and the earlier ten domain/popup additions.


Latest verification for the unwritten-scenario expansion: the API-key owner
combobox test passes after using the counted tab label and actual Create Key
button. It verifies case-insensitive username/display-name/email filtering,
no-match recovery, clearing/reselecting owners, created-key ownership and reload.
The native SQL fixtures now explicitly confirm replacing the existing project and
wait safely for asynchronous persistence; initial fixture-only replacement and
polling errors are not counted as product failures. The corrected twelve-case
run passed three binary round trips (MySQL, MariaDB and MSSQL) and reproduced nine
product failures: all four ENUM cases lose their values (PostgreSQL also loses the
native enum type), all four TIME zero-precision exports omit (0), and PostgreSQL
BYTEA imports as VARCHAR instead of BLOB. Six native domain cases independently
reproduce missing Length inputs before metadata edits can be verified. These are
executable failing regressions, not completed feature verification.

Four additional controlled domain collaboration scenarios are written. Both
parent-deletion versus child-reparent cases pass (10.1 seconds), retaining the
surviving alternate parent, inherited length, stable column metadata, identical
client exports/storage and both reloads. The root has no directly linked column,
so its deletion correctly has no confirmation dialog; the initial fixture was
corrected accordingly. Both unlink-versus-parent-update cases reproduce different
live client column lengths for the accepted operation order (80 versus 160).
They remain failing regressions requiring a field-state/protocol fix. Across
this expansion, 24 new cases were added (12 local and 12 server), in addition to
the six previously drafted native domain cases. No full-suite pass is claimed.

After these additions and the pending-filter fix, type checking reports zero
errors/warnings, all 106 files / 3,448 unit tests pass, and git diff --check is clean.


Missing-scenario writing expansion (2026-11-13): 36 independent LDAP/OIDC
provider API scenarios cover create/update with malformed JSON, null/array bodies,
blank/numeric names, object-valued optional fields, nonboolean flags and blank
required connection fields, plus duplicate connection URL create/update. They
compare complete public-list snapshots to detect partial writes, verify secrets
are omitted, retry a corrected edit and clean erroneous creations. The targeted
run finished in 2.3 minutes: 6 passed and 30 failed. Failures are endpoint behavior
(500/200/201 instead of rejection, changed records, and accepted duplicate URL
updates), not missing fixtures. These regressions remain enabled; implementation
fixes are deferred while writing gaps take priority. Logs:
`/tmp/erdmini-provider-boundary-e2e.log`. Type check: zero errors/warnings;
106 unit files / 3,448 tests pass.

Three further binary round trips extend the existing native boundary matrix to
Oracle RAW (1/2000, canonical VARBINARY), SQLite BLOB (dimension loss expected),
and H2 BINARY/VARBINARY (1/8000). All inspect exported SQL, imported nullable/type/
length fields and persisted reload. Results are recorded below.

The three added binary cases finished in 21.4 seconds: SQLite passes; Oracle
imports RAW columns as TEXT without lengths, and H2 rejects its exported
BINARY/VARBINARY declarations as a parse failure. Both are retained product
regressions. Log: `/tmp/erdmini-extra-binary-e2e.log`. Across this writing batch,
39 cases were added, 7 passed and 32 reproduced failures. No full suite was rerun.


Remaining-scenario writing batch (2026-11-13):

- Three populated V11/V12/V16 restores build genuine old schemas and copy every
  compatible historical column, including provider secrets, group membership and
  sharing, sessions, password hashes, API keys and scopes. Explicit LDAP/OIDC
  identity rows are included. Each verifies retained and fresh password sessions,
  allowed/denied project access, viewer-only MCP read scope, denied MCP writes,
  non-disclosure of secrets, actual restored credentials/identity rows, manual
  group source defaults, foreign-key integrity and browser reload. All three pass.
  Providers remain disabled: these test data preservation, not a fresh external
  LDAP/OIDC authentication exchange (which is covered by existing peer tests).
- Four provider browser scenarios independently exercise real duplicate-create
  409 responses and a deterministic intercepted PUT 503, then draft retention,
  corrected retry and reload for LDAP/OIDC. Duplicate-create cases and corrected LDAP edit fixture pass; OIDC edit failure
  still discards the draft after an HTTP error (see results below). The initial edit fixture selected by
  static card text that disappears in edit mode; it now retains the card index.
  Initial locator timeouts are not product-failure evidence.
- Six permission scenarios cover drafts already open during editor→viewer:
  FK, unique key, index, column popup, domain draft and DB-object editor. Checks
  include local exported state where applicable, stored state, denied HTTP writes,
  regrant, valid retry and reload. Existing tests separately cover table editing,
  focus/periodic/stale/failed permission refresh, revoked-project fallback and
  pending domain workbook reads.
- Two handler integration tests inject copy failure before any output and after
  a partial destination file. The production restore handler performs real file
  renames and SQLite checks; only the copy syscall, DB adapter and external side
  effects are controlled. Both verify live edits/sessions, intact SQLite, absence
  of leftover safety backups, collaboration resume and a successful retry. These
  are explicitly not browser E2Es, and do not claim actual WebSocket reconnection.
  All 107 files / 3,450 unit and integration tests pass.

Logs: `/tmp/erdmini-remaining-writing-unit.log` and
`/tmp/erdmini-remaining-writing-e2e.log`. No full suite has been rerun for this batch.

Initial corrected new-E2E baseline, before implementation fixes: 8 passed / 5 failed in 1.4 minutes. The 3 populated
historical restores, 3 provider browser scenarios (LDAP create/edit, OIDC create),
and column-popup/domain-draft permission checks pass. OIDC closes the edit form
after a 503 and loses the draft. FK/unique/index open drafts still change the
client-exported schema after downgrade; stored schemas remain unchanged and
regrant/reload recovery assertions run (the local-state checks use soft assertions).
DB-object metadata controls disable, but SQL editor read-only configuration does
not update after downgrade. A behavior-based rerun confirms actual keyboard input
changes SQL despite read-only permission, so this is not merely an attribute check.
These five product regressions remain enabled; implementation fixes and subsequent verification are recorded below.
Authoritative corrected log: `/tmp/erdmini-remaining-writing-verified.log`; SQL
behavior logs: `/tmp/erdmini-object-permission-verified.log` and
`/tmp/erdmini-object-permission-confirmed.log`. Earlier edit-card locator timeouts
are superseded. Type check reports zero errors/warnings. Current Playwright list
contains 205 local / 285 server scenarios; the last full green suite counts remain
174 local / 196 server.

The final SQL behavior rerun uses a soft local-document assertion so it also
reaches server-state checks, denied HTTP writes, viewer reload, regrant and
metadata edit/reload. All those checks pass; only the local SQL keyboard change
fails. This writing batch adds 13 E2Es and 2 handler integration tests. No
production behavior was changed in this batch. The listed missing scenarios now
have executable coverage at these stated scopes; broader native SQL combinations
and any additional screen paths still require inventory review before declaring
the overall coverage goal complete.


Implementation fixes for the five recent regressions (2026-11-13):

- OIDC provider Save now checks HTTP success and catches network failure, retaining
  the edit form/draft and showing an error. Corrected retry succeeds and reload
  retains the update.
- FK and shared unique-key/index modal submit buttons react to read-only state;
  submit handlers independently check permission before mutating the local model.
  Existing open-draft tests now retain identical live exports and stored data,
  reject viewer HTTP writes and allow valid writes after regrant/reload.
- SQL editor uses a CodeMirror compartment to update editable/read-only facets
  when permissions change, preserving the existing editor instance. Read-only
  state also blocks custom key commands and change callbacks. The DB-object E2E
  now additionally types a new SQL statement after regrant and verifies server
  persistence/reload, alongside the blocked-keyboard check during downgrade.

Sequential verification: type check zero errors/warnings; 107 unit/integration
files / 3,450 tests pass; related local constraint/FK/object/history E2Es 15/15 pass
(41.3 seconds); populated historical/provider-form/open-editor server E2Es 13/13
pass (1.2 minutes). The real login limiter remains enabled (one fixture waited
for its window). No skipped tests or relaxed failure assertions. Logs:
`/tmp/erdmini-five-fixes-check.log`, `/tmp/erdmini-five-fixes-unit.log`,
`/tmp/erdmini-five-fixes-local.log`, `/tmp/erdmini-five-fixes-server.log`.
`git diff --check` passes. No full 205/285-case run was performed; other known
regressions are not claimed fixed by these focused results.


Remaining-49 implementation fixes (2026-11-13): provider POST/PUT endpoints
validate complete JSON bodies, required/optional string fields and boolean flags
before mutation; malformed JSON is 400, duplicate edited URLs are 409 without
partial writes, and numeric 0/1 admin checkbox compatibility is retained. Blank
update secrets preserve stored credentials. Native domain Length controls cover
NVARCHAR/NCHAR/BINARY/VARBINARY/TIME/DATETIMEOFFSET. SQL import preserves inline
ENUM values and named PostgreSQL ENUM declarations, normalizes BYTEA to BLOB,
and adapts Oracle RAW/H2 binary dimensions without rewriting quoted SQL or
comments. Explicit zero temporal precision is exported, and MSSQL TIME(N) is no
longer stripped by preprocessing. Two old unit assertions which codified lossy
RAW/zero-precision behavior (plus TIME stripping) now assert preservation.

Column collaboration operations carry explicit unset fields, because JSON drops
undefined patch values. Domain unlink snapshots and pending operation tracking
reconcile derived column values in accepted server order: an unlink accepted
before a pending domain update retains its prior values; an earlier domain
update affects a still-pending unlink. Tracking resets on join/disconnect and
clears on acknowledgement. Pure unit tests and both controlled delivery-order
E2Es compare live clients, stored schemas and reloaded browsers.

Focused verification: local native/domain group 20/21 initially passed; MSSQL
TIME precision stripping was then fixed and its failed case passed. Server group
40/40 passed (36 provider API + 4 domain conflicts). Final type check: zero
errors/warnings; 110 unit/integration files / 3,470 tests pass, including 20 new
validation/native-SQL/order regression cases. Full local 205/205 passed in
406,127ms, with skipped/unexpected/flaky all zero. JSON result:
`/tmp/erdmini-local-full-205-result.json`. The subsequent full server result is recorded below.
Logs: `/tmp/erdmini-remaining49-check-final.log`,
`/tmp/erdmini-remaining49-unit-final.log`,
`/tmp/erdmini-remaining49-local-targeted.log`,
`/tmp/erdmini-remaining49-mssql-verified.log`,
`/tmp/erdmini-remaining49-server-targeted.log`,
`/tmp/erdmini-local-full-205.log`.


Final full-suite verification (2026-11-13): **205 local + 285 server E2Es pass**.
Local start: `2026-11-13T03:35:45.378Z`, duration 406,127ms, expected 205.
Server start: `2026-11-13T03:42:54.974Z`, duration 1,131,828ms, expected 285.
Both reports have skipped/unexpected/flaky all zero; both commands exited 0.
The final server run includes all provider API validation scenarios, both domain
unlink/update delivery orders, historical DB restores, real LDAP/OIDC failure
boundaries, all controlled memo/constraint conflicts, and the previously fixed
open-editor permission cases. Real login/LDAP rate limits remain enabled.

Authoritative reports: `/tmp/erdmini-local-full-205-result.json` and
`/tmp/erdmini-server-full-285-result.json`; full logs:
`/tmp/erdmini-local-full-205.log`, `/tmp/erdmini-server-full-285.log`.
Final type checking and all 3,470 unit/integration tests pass. `git diff --check`
is clean. All 49 previously identified failing scenarios are resolved; broader
scenario-writing audits described above remain separate from this verified fix
scope. No tests were skipped or assertions weakened to achieve these results.


Five-gap writing expansion (2026-11-13): **40 new executable scenarios**.

| Identified gap | Added cases | Verified scope |
| --- | ---: | --- |
| Additional SQL type conversions | 6 | Oracle/SQLite/H2 temporal precision and timezone semantics; Oracle/SQLite/MSSQL unsupported ENUM canonical fallbacks; imported fields and reload |
| Provider-form transport/non-JSON errors | 8 | LDAP/OIDC create/edit, network abort and HTML 503, retained draft/secrets, unchanged records, corrected retry and reload |
| Historical restore followed by external login | 6 | Genuine V11/V12/V16 schemas × LDAP/OIDC, fresh browser protocol login, registration disabled, identity reuse, manual-group viewer access, denied unrelated access/writes, reload, actual bind/token exchanges |
| Additional open-work permission changes | 8 | Memo draft, bulk edit, namespace/category rename × viewer downgrade/full revoke; unchanged live exports and storage, denied writes, regrant and valid retry/reload |
| Collaborative optional-field clearing | 12 | Length/scale/default × same/independent field conflict × both server delivery orders; explicit wire unsets, live peer exports, exact canonical storage and both reloads |

Initial runs reproduced 14 product-failing cases: six missing provider error
paths, six memo/namespace/category commit permission paths, and two lossy temporal
conversions. The first LDAP browser fixture clicked before hydration; it now waits
for network idle and the LDAP mode label. Namespace permission checks now inspect
the always-visible DBMS control because namespace switching clears table
selection. Those fixture issues are excluded from product-failure counts.

Fixes: provider forms share a request helper that returns recoverable errors for
network, non-JSON and structured-error responses without discarding form state;
commit callbacks recheck current permission; memo textarea becomes read-only;
Oracle/H2 time precision and timestamp-with-time-zone semantics are retained.
Nine additional unit cases cover request errors and timezone parsing.

Authoritative focused results: `/tmp/erdmini-final-gaps-local-fixed.log` —
6/6 passed (19.4s); `/tmp/erdmini-final-gaps-server-fixed.log` — 34/34 passed
(2.2m). Type check: `/tmp/erdmini-final-gaps-check-fixed.log`; prior full unit run:
`/tmp/erdmini-final-gaps-unit-fixed.log` — 111 files / 3,479 passed.
`git diff --check` passes. All five requested gaps have executable coverage at the
scopes in this table; there are no known failing cases in these focused results.
The cancelled `/tmp/erdmini-local-full-211.log` is not a passing validation report.
No full-suite rerun is required by this task after the user's changed-only test
instruction, and it must not be restarted without a subsequent request.


Completion-audit additions (2026-11-13):

- 28 pending-confirmation permission E2Es: table/memo/column deletion (both
  editor and popup), namespace/category/object/domain deletion, domain propagation,
  sidebar bulk delete and four keyboard deletion paths; each in viewer downgrade
  and full-revocation modes. They verify exact unchanged live/stored project
  data while denied, rejected HTTP writes, regrant/cancel, valid retry, complete
  retained metadata and stored/reloaded results. Representative baselines
  reproduced local deletion/propagation after permission changes. Commit
  callbacks now recheck permission after awaiting confirmation. Keyboard context
  reads live permission via a getter; cancelling/revocation also stops later
  mixed-selection prompts. Six new deferred-confirmation unit cases cover all
  dispatch branches and revocation during a second mixed-selection prompt.
- One disk-profile durability E2E closes the sole browser tab, reopens it, shuts
  down Chromium completely, reopens the same isolated profile, edits again and
  performs another actual browser restart. Both projects, native fields/IDs/FK
  targets, snapshots, active project and viewport survive; the second project's
  data stays unchanged. Temporary profiles are always removed.
- One MCP discovery contract E2E checks all 89 tool names, unique registration,
  descriptions/input schemas, JSON-RPC IDs, no secret exposure and no schema writes.
- Five real MCP read-contract E2Es cover get_schema_summary/list_tables/
  list_schemas/get_table/list_groups, meaningful results/filters/missing selectors,
  oversized/invalid inputs, viewer scope denial, unchanged data and browser reload.

Focused results: confirmation group initially 20 passed / 8 fixture failures;
hovering the actual delete-button rows and clearing selections before recreating
keyboard groups corrected those fixtures. The eight affected cases pass in
`/tmp/erdmini-confirmation-fixtures-fixed.log` (26.3s). Additional selection
assertions for single-keyboard paths are verified separately below. No permission
assertion was weakened. Keyboard unit file: 47/47 pass in
`/tmp/erdmini-confirmation-unit-fixed.log`; type check zero errors/warnings in
`/tmp/erdmini-confirmation-check-fixed.log`; durability 1/1 in
`/tmp/erdmini-durability-fixed.log` (8.1s); discovery 1/1 in
`/tmp/erdmini-mcp-catalog.log`; read contracts 5/5 in
`/tmp/erdmini-mcp-read-contract.log` (8.4s). The initial durability locator matched
a referenced table's name too; the corrected locator uses the table-name element.

The overall objective is not complete: the source registry has 89 tools;
all 89 names now have HTTP business-path E2Es, but branch coverage still has
concrete gaps tracked in E2E-MCP-COVERAGE.md. Unit test coverage or a passing discovery
list cannot substitute for those end-to-end paths. Only changed scopes were run;
no full-suite command was started during this goal audit.

Final confirmation-fixture verification: four single-keyboard cases pass with
explicit selection-count assertions in
`/tmp/erdmini-confirmation-keyboard-selection.log` (14.9s). Together with the
20 passing unaffected cases and the eight corrected fixture cases, all 28 pending
confirmation scenarios are verified. This audit turn adds 35 E2Es total (28
confirmations + 1 browser durability + 1 MCP discovery + 5 MCP read contracts).
All new scenarios have passing focused evidence; no full-suite result is claimed.

Latest MCP business verification (2026-11-13): 25 additional E2Es cover 24 tool
names across tables/groups, columns, unique keys/indexes, foreign keys and memos.
Every case checks project scope, invalid inputs and atomic rejection, meaningful
successful output, stored data, live browser export and reload. Mutations also
check viewer write denial; list_memos checks successful viewer access.

These cases exposed and fixed dangling memo attachments after table deletion,
duplicate table-delete counts, nonexistent/blank group rename acceptance,
fractional column dimensions and missing domain references, invalid constraint
and effective FK mappings, missing constraint/memo targets, missing attachment
metadata in memo listing and canonical clearing of a column's domain reference.
Composite foreign keys render one line per column pair; the browser assertion
uses that contract.

Authoritative result: `/tmp/erdmini-mcp-business-fixed.log` — 25/25 passed (2.2m).
`/tmp/erdmini-mcp-business-check.log` — zero errors/warnings;
`/tmp/erdmini-mcp-business-unit-fixed.log` — selected 3 files / 179 tests passed.
Only the changed scope was run. The registry now has no names without business-path cases, but branch gaps are
tracked in E2E-MCP-COVERAGE.md; the overall E2E objective remains incomplete.

Namespace follow-up: four new MCP E2Es cover add_schema, rename_schema,
delete_schema and bulk_update_table_schema. Baseline: three implementation
failures / one pass. Fixed blank-name acceptance, missing-source rename success
and duplicate-ID bulk counts at the HTTP boundary. Positive cases verify
namespace order, matching table/memo reassignment or clearing, full retained
metadata, unrelated objects, scope rejection, live export and reload. Bulk
clearing checks both null and empty-string inputs.
`/tmp/erdmini-mcp-namespace-fixed.log`: 4/4 passed (7.6s);
`/tmp/erdmini-mcp-namespace-check.log`: zero errors/warnings. No full suite run.
MCP business coverage now includes 36/89 tool names; 53 remain explicitly Missing.

DB-object follow-up: nine new MCP business E2Es cover all tools in
`db-object-tools.ts`: three viewer reads and six editor mutations. Tests verify
scope/argument denial without writes, filters, exact object metadata, default
creation, explicit clearing/false fields, category rename and cascading deletion,
unchanged unrelated tables/memos/domains, live JSON export and reload. Four
baseline failures exposed blank-category acceptance. Category mutations now
normalize whitespace and reject blank values at the HTTP boundary.
`/tmp/erdmini-mcp-objects-fixed.log`: 9/9 passed (11.5s);
`/tmp/erdmini-mcp-objects-check.log`: zero errors/warnings. Only this changed
E2E scope was run. Current MCP business coverage: 45/89 names; 44 remain Missing.

Analysis follow-up: eight E2Es cover four auto_layout algorithms (each with and
without group clustering), get_table_by_name, search_columns, find_orphan_tables
and lint_schema. Assertions cover meaningful results and filter combinations,
exact/partial case-insensitive matching, no-result contracts, isolated versus
connected tables, missing primary keys, permission/input denial without writes,
layout metadata preservation, live export and reload.
`/tmp/erdmini-mcp-analysis.log`: 8/8 passed (11.3s);
`/tmp/erdmini-mcp-analysis-check.log`: zero errors/warnings. Only the added E2E
scope was executed. MCP coverage is now 50/89 names, with 39 Missing.

Export follow-up: 11 new MCP E2Es cover all seven SQL dialects, Prisma, DBML,
Mermaid and PlantUML. Tests assert useful format content and false/disabled
options, viewer access, invalid options, scope denial, exact unchanged storage,
live browser export and reload. No implementation change was needed.
`/tmp/erdmini-mcp-export.log`: 11/11 passed (1.1m, including real login-limit
waiting); `/tmp/erdmini-mcp-export-check.log`: zero errors/warnings. Only the
added E2E scope ran. MCP business coverage: 54/89 names; 35 remain Missing.

Snapshot follow-up: 12 E2Es cover list/create/restore/delete/compare snapshots and
migration SQL across seven dialects. They verify cross-project snapshot denial,
no partial snapshot writes, full stored metadata, restored browser data,
column-level diffs, no-difference responses and snapshot capacity/retry at 50.
Baseline: 10 passed / 2 failed. Fixed missing snapshot deletion returning success;
corrected SQLite expectation to TEXT and transactional table rebuild. Changed
three cases pass in `/tmp/erdmini-mcp-snapshot-fixed.log` (6.9s); the nine
unaffected baseline cases retain passing evidence in
`/tmp/erdmini-mcp-snapshot-baseline.log`. Type check zero errors/warnings in
`/tmp/erdmini-mcp-snapshot-check.log`. No full-suite run.
MCP business coverage: 60/89 names, with 29 still Missing.

Bulk follow-up: four E2Es cover bulk_add_tables, bulk_add_columns,
bulk_update_tables and bulk_update_columns. Baseline: three implementation
validation failures / one pass. Fixed integer/bounded dimension validation and
preflight validation of all domain references. Invalid later entries leave the
entire schema unchanged. Positive assertions cover default PKs, explicit PK
non-nullability, DECIMAL scale zero, Unicode ENUMs, partial missing targets,
empty-field clearing and domain unlink, exact retained metadata, live export
and reload. `/tmp/erdmini-mcp-bulk-fixed.log`: 4/4 passed (7.6s);
`/tmp/erdmini-mcp-bulk-check.log`: zero errors/warnings. No full suite run.
Current MCP business coverage: 64/89 names; 25 remain Missing.

Import follow-up: nine E2Es cover seven DDL dialects, Prisma and DBML. Each
checks merge, repeated merge without duplicate tables, replacement, real PK/FK
references, input/scope rejection without writes, retained non-table metadata,
live browser export and reload. All nine baseline failures exposed lost DB
objects in the shared replacement path. Replacement now preserves existing
non-table fields and detaches memos whose table IDs are removed. Empty inputs
were already rejected; no empty-input implementation change was needed.
`/tmp/erdmini-mcp-import-fixed.log`: 9/9 passed (14.9s);
`/tmp/erdmini-mcp-import-check.log`: zero errors/warnings. No full suite run.
MCP business coverage is 67/89 names; 22 remain Missing.

Domain follow-up: nine E2Es cover all eight domain tools, including two dictionary
export formats. They verify domain usage, lookup/child inheritance, metadata,
linked-column propagation, delete/unlink/reparent, suggestions, exact coverage
statistics, scope/input rejection and live export/reload. Added HTTP validation
for integer bounded dimensions, nonblank names, missing parents and cycles.
Seven unaffected baseline cases pass in `/tmp/erdmini-mcp-domain-baseline.log`;
add passes in `/tmp/erdmini-mcp-domain-fixed.log`; update passes in
`/tmp/erdmini-mcp-domain-update-fixed.log`. The update fixture now preserves
column comments according to DOMAIN_FIELDS while asserting inherited length
propagation. Type check zero errors/warnings in
`/tmp/erdmini-mcp-domain-check.log`. No full suite run.
MCP business coverage: 75/89 names; 14 remain Missing.

Project-settings/search follow-up: four E2Es cover project dictionary set/clear,
project naming-rule set/get and project name lookup under explicit key scopes.
They verify locked-rule rejection without partial writes, per-project disabling,
clearing to inheritance, global rules read, viewer/write scope checks, live
export/reload and unchanged schemas on lookup. Baseline had two passes and two
fixture mismatches: the browser intentionally normalizes absent namingRules to
{}. Corrected only that representation; both affected cases pass in
`/tmp/erdmini-mcp-project-settings-fixed.log` (6.0s). Other two pass in
`/tmp/erdmini-mcp-project-settings.log`. Type check zero errors/warnings in
`/tmp/erdmini-mcp-project-settings-check.log`. No implementation change or full
suite run. MCP business coverage: 79/89 names; 10 remain Missing.

Word-dictionary follow-up: six E2Es cover list/add/update/delete/import/export
words, role/status visibility, pending ownership, search/category/pagination,
case-insensitive import/duplicates, status+content atomicity and browser dictionary
UI/reload. Baseline four passed / two failures. Fixed blank words/meanings,
missing update targets and transaction rollback of combined status/content
updates. Add/update/import now pass in `/tmp/erdmini-mcp-words-fixed.log`
(3/3, 4.1s); other three retain baseline passing evidence. Selected unit tests:
16/16 in `/tmp/erdmini-mcp-words-unit.log`; type check zero errors/warnings in
`/tmp/erdmini-mcp-words-check.log`. No full suite run. Current MCP business
coverage: 85/89 names; four dictionary-management names remain Missing.

Dictionary-management follow-up: four E2Es cover list/create/update/delete
word dictionaries with admin/regular differences, cloned word statuses and new
IDs, blank/duplicate validation, single-default switching, nullable descriptions,
deletion guards for defaults/words/share tokens/project use, valid deletion after
dependency cleanup, and browser dictionary options/reload. All mutable global
and fixture state is restored in finally. `/tmp/erdmini-mcp-dictionaries.log`:
4/4 passed (5.4s); `/tmp/erdmini-mcp-dictionaries-check.log`: zero errors/warnings.
No full suite run. All 89 MCP names have HTTP business-path cases, but this does
not prove every scenario. Source-to-test review found three concrete remaining
branch gaps (merge FK remapping, namespace-bound DB objects and DB-object moves
to new categories), now tracked in E2E-MCP-COVERAGE.md. The goal remains active.

Branch-regression follow-up: three E2Es reproduce and fix namespace rename/delete
omitting namespace-bound DB objects and object category moves omitting the new
category registry entry. Namespace assertions preserve object SQL/name/category;
category move opens the same object from the actual sidebar before and after
reload. All three baseline regressions pass after shared schema-ops fixes:
`/tmp/erdmini-mcp-branches-fixed.log` (3/3, 7.2s). Selected schema-ops unit file:
129/129 in `/tmp/erdmini-mcp-branches-unit.log`; type check zero errors/warnings
in `/tmp/erdmini-mcp-branches-check.log`. No full suite run. Import merge FK
remapping and the final requirement audit remain open; goal remains active.

Import-merge branch follow-up: three new E2Es cover DDL/Prisma/DBML importing a
child with a composite FK into an existing case-insensitively matched parent.
The shared merge path remaps target table/column IDs, preserves order and all
retained data, and rejects unmappable target columns before writes. New cases:
3/3 pass in `/tmp/erdmini-mcp-import-merge-fixed.log` (7.0s). Related existing
seven-dialect/Prisma/DBML merge/replace cases: 9/9 pass in
`/tmp/erdmini-mcp-import-merge-regression.log` (14.8s). Focused merge unit tests:
4/4 pass in `/tmp/erdmini-mcp-import-merge-unit.log`; type check zero errors and
warnings in `/tmp/erdmini-mcp-import-merge-check.log`. No full suite run.
All three specifically identified branch gaps are resolved. Final completion
still requires comparing actual tests and evidence to the full requirement set;
89 tool names and these passing subsets alone do not prove that audit complete.

Requirement-audit follow-up: compared PLAN.md feature claims against actual test
assertions. Added two local quota recovery E2Es: failed schema writes leave the
saved model exact, emergency JSON includes unsaved edits and metadata, viewport
navigation cannot clear the warning, dismissal is harmless, and restored writes
save/reload later edits. `/tmp/erdmini-storage-recovery-verified.log`: 2/2 passed
(8.5s). Initial fixture failures (polling an empty table array and reopening an
already-open editor) are corrected; no product implementation changed. No full
suite run. `E2E-REQUIREMENT-AUDIT.md` records the actual remaining gaps: memo
content/render evidence in SVG/PNG/PDF exports, 200-step history boundary and
final source-assertion review. The goal remains active.

History/image audit follow-up: one new 205-edit E2E proves exactly 200 retained
undo entries, oldest retained state, every redo state in order, original unrelated
metadata and reloaded final state (`/tmp/erdmini-history-cap.log`: 1/1, 18.5s).
Three new memo-export E2Es validate free/attached content in SVG/PDF and actual
background/text pixels in the PNG free-memo region, unchanged schema/world style
and reload. SVG passed in `/tmp/erdmini-memo-export.log`; corrected PNG menu and
PDF UTF-16BE fixture assumptions pass in `/tmp/erdmini-memo-export-fixed.log`
(2/2, 5.9s). No product implementation changes or full-suite run. These two
explicit missing requirements are resolved; final requirement review remains.

Theme follow-up: four theme/dark-mode E2Es expose and fix overlapping zoom controls,
clipped bottom-bar dropdowns and minimap interception. Tests now use real clicks
for every theme, verify independent canvas/panel colors, reload persistence and
unchanged schema data. `/tmp/erdmini-theme-matrix-passed.log`: 4/4 (9.2s).
Related zoom/reset/fit/minimap/keyboard regressions: 3/3 in
`/tmp/erdmini-theme-zoom-regression.log` (5.7s). Type check zero errors/warnings
in `/tmp/erdmini-theme-matrix-check.log`. No full suite run. Nullable/required FK
line rendering is the next concrete requirement gap in the ongoing audit.

FK nullability audit follow-up: three new Orthogonal/Bezier/Rounded cases verify
actual SVG solid/dashed rendering for each composite FK pair, live nullable edit,
undo/redo, retained unrelated column/constraint metadata and stored/reloaded
state. `/tmp/erdmini-fk-nullability.log`: 3/3 passed (9.3s). No product code change
or full-suite run. Reload checks nullability under the default transient line
style; each selected style is verified before reload. The explicit Phase 3 line
rendering gap is resolved; requirement review continues.

Memo colors/minimap audit follow-up: six E2Es verify every supported color on
both the canvas card and minimap, positive miniature dimensions, undo/redo,
metadata-preserving persistence and reload. `/tmp/erdmini-memo-colors-fixed.log`:
6/6 passed (13.8s). Baseline was a fixture polling error while the saved memo
array was still empty; fixed optional element access. No product change or full
suite run. Remaining source/assertion requirement review continues.

Original MCP read audit: one rich get_schema E2E added and the existing scoped
key/list_projects scenario strengthened. Exact full schema, project metadata,
invalid/missing/oversized inputs, viewer access, denied project isolation,
immediate scope changes, revocation, unchanged storage and browser export/reload
are covered. `/tmp/erdmini-mcp-read-audit.log`: 2/2 pass (5.3s). No implementation
change or full suite run. Initial four-tool coverage has been reviewed against
actual assertions; final consolidated requirement mapping remains.

FK line deletion audit follow-up: two real mouse/keyboard popover E2Es verify
cancel, composite relationship deletion, undo/redo, exact unrelated metadata and
reload. Keyboard baseline passed; mouse passes after serializing its transformed
SVG point as plain x/y in `/tmp/erdmini-fk-popover-fixed.log` (6.5s). No product
change or full suite run. A newly identified pending-dialog permission branch
for FK line deletion remains to be tested and fixed if reproduced.

FK pending-confirmation permission fix: two server E2Es reproduce local FK
removal after viewer downgrade or revocation during the line-popover confirmation.
The callback now checks current isReadOnly after the awaited dialog. Exact live
and stored schema preservation, rejected HTTP writes, regrant/cancel, successful
retry and reload pass in `/tmp/erdmini-fk-confirmation-fixed.log` (2/2, 9.0s).
Type check zero errors/warnings in `/tmp/erdmini-fk-confirmation-check.log`.
Only changed cases ran; the broader requirement audit remains active.

Sidebar audit follow-up: two new E2Es validate actual sort order, group counts,
collapse/reload/re-expand, column-name and comment search, matching table
selection, empty result and search clearing with exact stored schema preservation.
`/tmp/erdmini-sidebar-navigation.log`: 2/2 passed (6.4s). No implementation change
or full suite run; requirement-by-requirement review continues.

Plan inventory consolidation: all 96 checked PLAN.md items now appear in
`E2E-PLAN-MATRIX.md`. Nineteen have reviewed focused evidence; 77 have explicit
pending review status and candidate test/source locations. This is not 77 known
missing tests: actual assertions must be inspected before updating each row.
Ctrl+drag additive selection, Space+drag panning and sidebar-width restore are
specific next review targets. No full or selected suite was run for the matrix.

Navigation-boundary audit: two local E2Es verify Space+left panning persistence
without data/selection changes and sidebar width clamps/restoration without
schema changes. Space passes in `/tmp/erdmini-navigation-boundaries.log`; width
passes after using the visible resize-grip region in
`/tmp/erdmini-sidebar-width-fixed.log` (5.2s). No implementation change or full
suite run. Plan matrix review advanced to 21/96 items; 75 remain review tasks.

Additive-selection audit: two real Control/Meta marquee E2Es verify retained
selection plus added table/memo, ordinary replacement selection, unchanged
stored schema and selection clearing on reload. `/tmp/erdmini-additive-selection.log`:
2/2 passed (6.8s). No implementation change or full suite run. Requirement matrix
now has 23 reviewed items / 73 pending review, not 73 confirmed missing tests.

Cursor-centered zoom audit: added one real wheel in/out E2E verifying the actual
browser-event world anchor, saved/reloaded viewport and exact unchanged schema.
`/tmp/erdmini-cursor-zoom-fixed.log`: 1/1 passed (5.2s). Initial fixture assumed
unrounded fractional browser event coordinates; it now reads the actual event.
No product change or full suite run. Existing single/group drag and column-reorder
assertions were inspected and linked; plan matrix is 27 reviewed / 69 pending.

Column flag audit: four new PK/NN/UQ/AI popup E2Es verify enable/clear,
PK-derived NN, exact retained metadata/constraints, undo/redo and two reloads.
`/tmp/erdmini-column-flags.log`: 4/4 passed (17.3s). No product change or full
suite run. Requirement review: 28 reviewed / 68 pending (not 68 known omissions).

Basic column lifecycle audit: one new E2E covers add/name/type/default/comment,
reloaded values, direct independent deletion, metadata-complete undo/redo and
final reload. `/tmp/erdmini-column-basic-lifecycle-fixed.log`: 1/1 passed (7.0s).
Initial fixture expected confirmation for a column with no FK; corrected to the
actual immediate-delete contract. No product change or full suite run. Combined
column requirement now reviewed; matrix 29 reviewed / 67 pending.

Table duplication audit: two Control/Meta E2Es reproduce and fix lost schema
namespace in duplicateTableOp. They prove scoped copy visibility, fresh IDs,
column metadata/flags/domain links, cleared constraints, unrelated original/memo
preservation, independent rename and reload. `/tmp/erdmini-table-duplication-verified.log`:
2/2 passed (7.7s); selected table-ops unit tests 44/44; type check zero errors and
warnings. No full suite run. Requirement matrix: 31 reviewed / 65 pending review.

DDL qualified-name/comment audit: two explicit MySQL/PostgreSQL import E2Es
verify namespace/name separation, inline and COMMENT ON metadata, ALTER TABLE
FK identity/actions, live relationship rendering and exact tables after reload.
`/tmp/erdmini-ddl-qualified-comments.log`: 2/2 passed (7.5s). No implementation
change or full suite run. Requirement review: 33/96 reviewed, 63 pending review.

Layout lifecycle audit: five new real-click algorithm E2Es verify position-only
changes, retained metadata/relationships, undo/redo and reload. Four baseline
passes in `/tmp/erdmini-layout-lifecycle.log`; corrected Smart menu label passes
in `/tmp/erdmini-layout-smart-verified.log` (6.0s). No implementation change or
full suite run. Requirement matrix: 34 reviewed / 62 pending; import auto-layout
remains under separate review.

Import auto-layout audit: four independent/related x Skip/Overwrite cases prove
real auto-layout beyond parser positions, existing view metadata retention,
correct FK identities, undo/redo and exact reload. `/tmp/erdmini-import-layout-fixed.log`:
4/4 passed (17.6s). Initial fixture now explicitly approves JSON Replace before
starting DDL import. No implementation change or full suite run. Requirement
review: 35/96 reviewed; 61 still pending review.

Writing-first batch (unverified): three rich share/backup cases added to
import-export-roundtrip.spec.ts. Fresh readonly URL preserves full schema/source;
all-project restore/cancel compares two projects, newer edits, IDs and rich
metadata through reload/project reopening. Per latest user instruction, no tests
or typecheck were run. Source-defined inventory: 261 local / 467 server pending
later collection. Existing green reports do not validate these new cases.

Writing-first batch 2: eight unexecuted display/alignment E2Es added in
`e2e/display-alignment.spec.ts`. Covers two restricted column modes, all four
alignment directions, both distribution axes, attached memo movement and exact
metadata/history/persistence checks. No test/typecheck execution. Writing-first
new cases total 11; source-defined inventory 269 local / 467 server, unverified.

Writing-first batch 3: 12 unexecuted cases add locked-member spatial-operation
boundaries and namespace/attachment-aware minimap behavior. Under-three-movable
member distribution expects no change. No test/typecheck or product changes.
Writing-first additions total 23; source-defined inventory 281 local / 467 server,
pending collection/execution. Potential lock handling gaps remain to be verified.

Writing-first batch 4: twelve unexecuted file-diff/migration/palette scenarios.
Seven-dialect migration downloads match preview SQL; invalid/retry/no-difference
files preserve storage; Control/Meta palette cases test keyboard boundaries and
hidden namespace navigation. No tests/typecheck/product fixes. Writing-first
additions total 35; source-defined inventory 293 local / 467 server, unverified.

Writing-first batch 5: three unexecuted server presence/session-cookie scenarios;
existing auth/permission/collaboration requirements linked to actual test groups.
No execution/product changes. Writing-first additions total 38; source-defined
inventory 293 local / 470 server, pending later collection and verification.

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

Writing-first batch 38 (unverified): one all-table deletion boundary asserts
zero tables/FKs, preserved detached memo and sidebar preview, complete graph and
attachment restored by one undo, redo and reload with namespaces/domains intact.
No tests/typecheck/collection executed. Additions total 135; inventory 374 local /
477 server / 5 startup / 4 Docker.
