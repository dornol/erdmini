import type { ThemeId } from '$lib/store/theme.svelte';

export type TableColorId = 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'lime' | 'cyan' | 'indigo' | 'rose' | 'slate' | 'brown';

export const TABLE_COLOR_IDS: TableColorId[] = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink', 'lime', 'cyan', 'indigo', 'rose', 'slate', 'brown'];

interface ColorMapping {
  headerBg: string;
  headerText: string;
}

export const TABLE_COLORS: Record<TableColorId, { dot: string; themes: Record<ThemeId, ColorMapping> }> = {
  red: {
    dot: '#ef4444',
    themes: {
      modern:    { headerBg: '#dc2626', headerText: '#ffffff' },
      classic:   { headerBg: '#8b2020', headerText: '#fef2f2' },
      blueprint: { headerBg: '#7f1d1d', headerText: '#fca5a5' },
      minimal:   { headerBg: '#fecaca', headerText: '#991b1b' },
    },
  },
  orange: {
    dot: '#f97316',
    themes: {
      modern:    { headerBg: '#ea580c', headerText: '#ffffff' },
      classic:   { headerBg: '#7c3a10', headerText: '#fff7ed' },
      blueprint: { headerBg: '#7c2d12', headerText: '#fdba74' },
      minimal:   { headerBg: '#fed7aa', headerText: '#9a3412' },
    },
  },
  amber: {
    dot: '#f59e0b',
    themes: {
      modern:    { headerBg: '#d97706', headerText: '#ffffff' },
      classic:   { headerBg: '#78350f', headerText: '#fffbeb' },
      blueprint: { headerBg: '#78350f', headerText: '#fcd34d' },
      minimal:   { headerBg: '#fde68a', headerText: '#92400e' },
    },
  },
  green: {
    dot: '#22c55e',
    themes: {
      modern:    { headerBg: '#16a34a', headerText: '#ffffff' },
      classic:   { headerBg: '#2d5a27', headerText: '#f0fdf4' },
      blueprint: { headerBg: '#14532d', headerText: '#86efac' },
      minimal:   { headerBg: '#bbf7d0', headerText: '#166534' },
    },
  },
  teal: {
    dot: '#14b8a6',
    themes: {
      modern:    { headerBg: '#0d9488', headerText: '#ffffff' },
      classic:   { headerBg: '#1a4a44', headerText: '#f0fdfa' },
      blueprint: { headerBg: '#134e4a', headerText: '#5eead4' },
      minimal:   { headerBg: '#99f6e4', headerText: '#115e59' },
    },
  },
  blue: {
    dot: '#3b82f6',
    themes: {
      modern:    { headerBg: '#2563eb', headerText: '#ffffff' },
      classic:   { headerBg: '#1e3a5f', headerText: '#eff6ff' },
      blueprint: { headerBg: '#1e3a8a', headerText: '#93c5fd' },
      minimal:   { headerBg: '#bfdbfe', headerText: '#1e40af' },
    },
  },
  purple: {
    dot: '#a855f7',
    themes: {
      modern:    { headerBg: '#9333ea', headerText: '#ffffff' },
      classic:   { headerBg: '#4a1d6e', headerText: '#faf5ff' },
      blueprint: { headerBg: '#581c87', headerText: '#d8b4fe' },
      minimal:   { headerBg: '#e9d5ff', headerText: '#6b21a8' },
    },
  },
  pink: {
    dot: '#ec4899',
    themes: {
      modern:    { headerBg: '#db2777', headerText: '#ffffff' },
      classic:   { headerBg: '#6e1d45', headerText: '#fdf2f8' },
      blueprint: { headerBg: '#831843', headerText: '#f9a8d4' },
      minimal:   { headerBg: '#fbcfe8', headerText: '#9d174d' },
    },
  },
  lime: {
    dot: '#84cc16',
    themes: {
      modern:    { headerBg: '#65a30d', headerText: '#ffffff' },
      classic:   { headerBg: '#3f5e15', headerText: '#f7fee7' },
      blueprint: { headerBg: '#365314', headerText: '#bef264' },
      minimal:   { headerBg: '#d9f99d', headerText: '#3f6212' },
    },
  },
  cyan: {
    dot: '#06b6d4',
    themes: {
      modern:    { headerBg: '#0891b2', headerText: '#ffffff' },
      classic:   { headerBg: '#164e63', headerText: '#ecfeff' },
      blueprint: { headerBg: '#164e63', headerText: '#67e8f9' },
      minimal:   { headerBg: '#a5f3fc', headerText: '#155e75' },
    },
  },
  indigo: {
    dot: '#6366f1',
    themes: {
      modern:    { headerBg: '#4f46e5', headerText: '#ffffff' },
      classic:   { headerBg: '#312e81', headerText: '#eef2ff' },
      blueprint: { headerBg: '#312e81', headerText: '#a5b4fc' },
      minimal:   { headerBg: '#c7d2fe', headerText: '#3730a3' },
    },
  },
  rose: {
    dot: '#f43f5e',
    themes: {
      modern:    { headerBg: '#e11d48', headerText: '#ffffff' },
      classic:   { headerBg: '#6e1a35', headerText: '#fff1f2' },
      blueprint: { headerBg: '#881337', headerText: '#fda4af' },
      minimal:   { headerBg: '#fecdd3', headerText: '#9f1239' },
    },
  },
  slate: {
    dot: '#64748b',
    themes: {
      modern:    { headerBg: '#475569', headerText: '#ffffff' },
      classic:   { headerBg: '#334155', headerText: '#f1f5f9' },
      blueprint: { headerBg: '#1e293b', headerText: '#94a3b8' },
      minimal:   { headerBg: '#cbd5e1', headerText: '#1e293b' },
    },
  },
  brown: {
    dot: '#a3764f',
    themes: {
      modern:    { headerBg: '#8b5e3c', headerText: '#ffffff' },
      classic:   { headerBg: '#5c3d23', headerText: '#fef3e2' },
      blueprint: { headerBg: '#4a2f1a', headerText: '#d4a574' },
      minimal:   { headerBg: '#e8d5c0', headerText: '#5c3d23' },
    },
  },
};
