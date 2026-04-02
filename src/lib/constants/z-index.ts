/**
 * Centralized z-index scale for the entire app.
 * Always import from here — never hardcode z-index values in components.
 *
 * Layers (low → high):
 *   Canvas elements → UI controls → Panels → Dropdowns → Modals → Overlays
 */
export const Z = {
  // ── Canvas layers ──
  RELATION_LINES: 0,
  CANVAS_BASE: 1,
  CANVAS_SELECTED: 10,
  CANVAS_HOVERED: 20,
  CANVAS_SELECTION_BOX: 50,

  // ── UI controls (on canvas) ──
  FULLSCREEN_ZONE: 99,
  CANVAS_CONTROLS: 100,    // zoom, bottom bar, minimap, history, sidebar toolbar

  // ── Side panels ──
  PANEL: 150,               // history, snapshots, lint, naming rules

  // ── Dropdowns & popups ──
  DROPDOWN: 200,            // toolbar dropdowns, collab indicator, table footer
  COLUMN_POPUP: 800,        // column edit popup (above dropdowns)

  // ── Modals ──
  MODAL: 1000,              // standard modals (FK, constraint, bulk edit, share, DDL, etc.)
  MODAL_DROPDOWN: 1001,     // dropdowns inside modals (schema selector, tools)
  COMMAND_PALETTE: 1500,    // Ctrl+K command palette

  // ── Top-level overlays ──
  TOOLTIP: 9000,            // sidebar rich tooltip, searchable select
  MODAL_PRIORITY: 9500,     // high-priority modals (embed, change password, SQL playground)
  TOAST: 10000,             // toast notifications
  DIALOG: 50000,            // confirm/alert dialog (always on top)
} as const;
