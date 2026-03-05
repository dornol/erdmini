import type { Table } from '$lib/types/erd';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';

// ── Types ──────────────────────────────────────────────────────────

export type GroupData = { name: string; label: string; tables: Table[] };

export type VirtualRow =
  | { type: 'table'; table: Table; grouped: boolean; groupName: string; height: number; key: string }
  | { type: 'group-header'; group: GroupData; height: number; key: string }
  | { type: 'color-picker'; groupName: string; height: number; key: string }
  | { type: 'new-group'; height: number; key: string }
  | { type: 'empty-hint'; searching: boolean; height: number; key: string };

// ── Height constants ───────────────────────────────────────────────

export const ROW_H_TABLE = 34;
export const ROW_H_TABLE_COMMENT = 48; // 34 + 14 for comment line
export const ROW_H_GROUP_HEADER = 28;
export const ROW_H_NEW_GROUP = 36;
export const ROW_H_EMPTY = 60;

const COLOR_PICKER_DOT = 18;
const COLOR_PICKER_GAP = 4;
const COLOR_PICKER_PAD_X = 28 + 14; // left + right padding
const COLOR_PICKER_PAD_Y = 6 + 6;   // top + bottom padding
const COLOR_PICKER_ITEMS = 1 + TABLE_COLOR_IDS.length; // none + colors

export function colorPickerHeight(width: number): number {
  const usable = width - COLOR_PICKER_PAD_X;
  const cols = Math.max(1, Math.floor((usable + COLOR_PICKER_GAP) / (COLOR_PICKER_DOT + COLOR_PICKER_GAP)));
  const rowCount = Math.ceil(COLOR_PICKER_ITEMS / cols);
  return rowCount * COLOR_PICKER_DOT + (rowCount - 1) * COLOR_PICKER_GAP + COLOR_PICKER_PAD_Y;
}

// ── Builder ────────────────────────────────────────────────────────

export interface BuildRowsParams {
  viewMode: 'flat' | 'group';
  filteredTables: Table[];
  groupedTables: GroupData[];
  searchQuery: string;
  collapsedGroups: Set<string>;
  groupColorPicker: string | null;
  sidebarWidth: number;
  isReadOnly: boolean;
}

export function buildVirtualRows(params: BuildRowsParams): VirtualRow[] {
  const {
    viewMode, filteredTables, groupedTables, searchQuery,
    collapsedGroups, groupColorPicker, sidebarWidth, isReadOnly,
  } = params;

  const rows: VirtualRow[] = [];

  if (viewMode === 'flat') {
    if (filteredTables.length === 0) {
      rows.push({ type: 'empty-hint', searching: !!searchQuery.trim(), height: ROW_H_EMPTY, key: '__empty__' });
    } else {
      for (const table of filteredTables) {
        rows.push({
          type: 'table',
          table,
          grouped: false,
          groupName: '',
          height: table.comment ? ROW_H_TABLE_COMMENT : ROW_H_TABLE,
          key: table.id,
        });
      }
    }
  } else {
    // Group view
    if (!isReadOnly) {
      rows.push({ type: 'new-group', height: ROW_H_NEW_GROUP, key: '__new_group__' });
    }
    if (groupedTables.length === 0) {
      rows.push({ type: 'empty-hint', searching: !!searchQuery.trim(), height: ROW_H_EMPTY, key: '__empty__' });
    } else {
      for (const group of groupedTables) {
        rows.push({
          type: 'group-header',
          group,
          height: ROW_H_GROUP_HEADER,
          key: `__gh_${group.name}`,
        });
        if (groupColorPicker === group.name) {
          rows.push({
            type: 'color-picker',
            groupName: group.name,
            height: colorPickerHeight(sidebarWidth),
            key: `__cp_${group.name}`,
          });
        }
        if (!collapsedGroups.has(group.name)) {
          for (const table of group.tables) {
            rows.push({
              type: 'table',
              table,
              grouped: true,
              groupName: group.name,
              height: table.comment ? ROW_H_TABLE_COMMENT : ROW_H_TABLE,
              key: table.id,
            });
          }
        }
      }
    }
  }

  return rows;
}
