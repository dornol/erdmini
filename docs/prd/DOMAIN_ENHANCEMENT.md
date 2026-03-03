# Domain Feature Enhancement Plan

## Current State

The domain system provides reusable column templates (`ColumnDomain`) that propagate properties (type, length, nullable, PK, UQ, AI, defaultValue) to linked columns. It supports grouping, Excel import/export, and real-time collaboration.

### Current ColumnDomain fields
| Field | Description |
|---|---|
| id, name | Identifier |
| type, length | Data type (no `scale`) |
| nullable, primaryKey, unique, autoIncrement | Constraints |
| defaultValue | Default expression |
| comment | Single-line description |
| group | Flat grouping string |

### Current Gaps
- No `scale` (DECIMAL precision/scale), `check`, `enumValues` — these exist on Column but not on Domain
- No structured documentation fields (business rules, valid values, etc.)
- No DDL export integration (domains are invisible in SQL output)
- No MCP tools for domain CRUD
- No domain-focused report/document generation
- No usage impact analysis UI
- No domain-level statistics

---

## Enhancement Proposals

### Phase A: Data Model Completion (Small)

Complete the domain model by adding fields that already exist on `Column` but are missing from `ColumnDomain`.

**Changes to `ColumnDomain`:**
```typescript
export interface ColumnDomain {
  // existing fields ...
  scale?: number;        // DECIMAL scale (Column has it, Domain doesn't)
  check?: string;        // CHECK constraint
  enumValues?: string[]; // ENUM value list
}
```

**Propagation:** Add `scale`, `check`, `enumValues` to `DOMAIN_FIELDS`.

**Effort:** Small — type change + propagation logic + DomainModal UI fields.

---

### Phase B: Documentation Fields (Medium)

Add structured documentation fields to make domains useful as a **data dictionary**.

**New fields on `ColumnDomain`:**
```typescript
export interface ColumnDomain {
  // existing fields ...
  description?: string;     // Multi-line business description (markdown)
  alias?: string;           // Alternative name / display name (e.g., "Customer ID")
  dataStandard?: string;    // Reference to external standard (e.g., "ISO 8601", "KS X 6924")
  example?: string;         // Example values (e.g., "2025-01-01, 2025-12-31")
  validRange?: string;      // Valid value range (e.g., "1~99999", "A-Z only")
  owner?: string;           // Data steward / responsible team
  tags?: string[];          // Searchable tags (e.g., ["PII", "required", "legacy"])
}
```

**UI additions:**
- DomainModal: expandable detail panel per row (click row → expand below)
- Markdown preview for `description`
- Tag chips with autocomplete from existing tags

**Effort:** Medium — schema change + DomainModal UI expansion + Excel column additions.

---

### Phase C: Domain Dictionary Export (Medium)

Generate a **data dictionary document** from domains — a common enterprise deliverable.

**Export formats:**
| Format | Description |
|---|---|
| **Excel (.xlsx)** | Enhanced version of current export: add description, alias, tags, usage columns, one sheet per group |
| **HTML** | Standalone HTML page with table-of-contents, group sections, linked column references |
| **Markdown** | `.md` file for Git-based documentation workflows |

**Content structure:**
```
1. Overview (total domains, groups, coverage stats)
2. Per group:
   - Domain name, alias, type, constraints
   - Description, valid range, example, data standard
   - Linked columns (table.column list)
   - Owner, tags
3. Appendix: Unlinked columns (columns without a domain)
```

**Effort:** Medium — new export utility + UI button in DomainModal.

---

### Phase D: Domain Coverage & Impact Analysis (Medium)

Help teams track domain adoption and understand change impact.

**Coverage dashboard (DomainModal top bar or separate panel):**
- Total columns vs. domain-linked columns (percentage bar)
- Per-group coverage breakdown
- "Unlinked columns" list with suggested domain matches (by type + name similarity)

**Impact analysis (on domain edit):**
- Before saving domain changes, show a preview: "This change affects N columns in M tables"
- List affected table.column pairs with before/after values
- Confirmation dialog with diff view

**Effort:** Medium — derived stats + confirmation dialog + suggestion algorithm.

---

### Phase E: Domain MCP Tools (Small)

Add dedicated CRUD tools for AI-assisted domain management.

**New MCP tools:**
| Tool | Permission | Description |
|---|---|---|
| `list_domains` | viewer | List all domains with usage counts |
| `get_domain` | viewer | Get domain detail by ID or name |
| `add_domain` | editor | Create a new domain |
| `update_domain` | editor | Update domain properties (propagates to linked columns) |
| `delete_domain` | editor | Delete domain (unlinks columns) |
| `suggest_domains` | viewer | Analyze unlinked columns and suggest domain candidates |

**Use case:** AI assistant can analyze a schema and suggest standardized domains, then create them and link columns — automating data governance.

**Effort:** Small — follows existing MCP tool patterns.

---

### Phase F: DDL Integration (Small)

Make domains visible in DDL output.

**Option 1 — SQL Comments (non-breaking):**
```sql
-- Domain: user_id (BIGINT, NOT NULL, AI) — User primary key
CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT,  -- domain: user_id
  ...
);
```

**Option 2 — PostgreSQL CREATE DOMAIN (dialect-specific):**
```sql
CREATE DOMAIN user_id AS BIGINT NOT NULL;

CREATE TABLE users (
  id user_id,
  ...
);
```

**Recommended:** Option 1 as default (all dialects), Option 2 as opt-in for PostgreSQL.

**DDL import:** Parse `-- domain:` comments to auto-link or create domains on import.

**Effort:** Small — DDL export option flag + comment generation.

---

### Phase G: Domain Hierarchy (Large)

Allow parent-child domain relationships for enterprise-scale organization.

```typescript
export interface ColumnDomain {
  // existing fields ...
  parentId?: string;  // Inherit from parent domain
}
```

**Behavior:**
- Child inherits all unset fields from parent
- Changing parent propagates to children → then to linked columns
- DomainModal shows tree view with expand/collapse

**Example:**
```
identifier (BIGINT, NOT NULL, AI)
├── user_id (inherits all, comment: "User PK")
├── order_id (inherits all, comment: "Order PK")
└── product_id (inherits all, comment: "Product PK")
```

**Effort:** Large — inheritance resolution + tree UI + cascading propagation.

---

## Implementation Status

| Priority | Phase | Effort | Value | Status |
|---|---|---|---|---|
| 1 | **A: Data Model Completion** | Small | Fixes inconsistency (scale, check, enum missing) | ✅ Done |
| 2 | **E: MCP Tools** | Small | Enables AI-assisted domain management | ✅ Done |
| 3 | **F: DDL Integration** | Small | Makes domains visible in SQL output | ✅ Done (Option 1: SQL comments) |
| 4 | **B: Documentation Fields** | Medium | Core value for data dictionary use case | ⬜ Not started |
| 5 | **C: Dictionary Export** | Medium | Enterprise deliverable generation | ⬜ Not started |
| 6 | **D: Coverage & Impact** | Medium | Data governance tooling | ⬜ Not started |
| 7 | **G: Hierarchy** | Large | Enterprise-scale organization | ⬜ Not started |

### Completed
- **Phase A**: Added `scale`, `check`, `enumValues` to `ColumnDomain` type. Propagation via `DOMAIN_FIELDS`. DomainModal UI fields, domain-xlsx import/export, erdStore propagation all updated.
- **Phase E**: 6 MCP tools added (`list_domains`, `get_domain`, `add_domain`, `update_domain`, `delete_domain`, `suggest_domains`). Documentation in `docs/mcp/TOOLS.md` (22 → 28 tools).
- **Phase F**: `includeDomains` DDL export option with inline `-- domain: name` comments per column. DdlModal checkbox, i18n (4 languages), 6 tests added. Option 2 (PostgreSQL CREATE DOMAIN) not yet implemented.

### Remaining
Phases B + C together deliver the full "data dictionary" capability.
Phase G is optional and only needed for very large schemas.

---

## Not Planned
- **Domain versioning/history** — Covered by existing undo/redo and schema diff features
- **Domain approval workflow** — Out of scope for a diagramming tool
- **External DB reverse-engineering of domains** — Would require live DB connection (future roadmap)
