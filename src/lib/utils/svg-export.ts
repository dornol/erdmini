import type { ERDSchema, Table, Memo } from '$lib/types/erd';
import { TABLE_W, TABLE_CARD_W, HEADER_H, ROW_H, COMMENT_H } from '$lib/constants/layout';
import { TABLE_COLORS } from '$lib/constants/table-colors';
import type { TableColorId } from '$lib/constants/table-colors';
import type { ThemeId } from '$lib/store/theme.svelte';
import { routeFKLines, computeOrthogonalLine, computeRoundedOrthogonalLine, computeSelfRefLoop, type AABB, type FKLineInput, type FKLineRoute } from '$lib/utils/fk-routing';
import type { LineType } from '$lib/store/erd.svelte';

const PAD = 40;

interface ThemeColors {
  canvasBg: string;
  cardBg: string;
  cardBorder: string;
  cardBorderWidth: string;
  cardRadius: string;
  headerBg: string;
  headerText: string;
  commentBg: string;
  commentText: string;
  commentBorder: string;
  colText: string;
  colType: string;
  colBorder: string;
  badgePkBg: string;
  badgePkBorder: string;
  badgePkText: string;
  badgeFkBg: string;
  badgeFkBorder: string;
  badgeFkText: string;
  badgeUqBg: string;
  badgeUqBorder: string;
  badgeUqText: string;
  badgeAiBg: string;
  badgeAiBorder: string;
  badgeAiText: string;
  badgeRadius: string;
  noColText: string;
  lineColor: string;
  lineBg: string;
}

const THEMES: Record<string, ThemeColors> = {
  modern: {
    canvasBg: '#f8fafc', cardBg: '#ffffff', cardBorder: '#e2e8f0',
    cardBorderWidth: '2', cardRadius: '8', headerBg: '#1e293b', headerText: '#ffffff',
    commentBg: '#f8fafc', commentText: '#64748b', commentBorder: '#e2e8f0',
    colText: '#1e293b', colType: '#64748b', colBorder: 'none',
    badgePkBg: '#fef3c7', badgePkBorder: '#f59e0b', badgePkText: '#92400e',
    badgeFkBg: '#dbeafe', badgeFkBorder: '#93c5fd', badgeFkText: '#1e40af',
    badgeUqBg: '#ede9fe', badgeUqBorder: '#c4b5fd', badgeUqText: '#6d28d9',
    badgeAiBg: '#d1fae5', badgeAiBorder: '#6ee7b7', badgeAiText: '#065f46',
    badgeRadius: '3', noColText: '#94a3b8', lineColor: '#94a3b8', lineBg: '#f8fafc',
  },
  classic: {
    canvasBg: '#f5f0e4', cardBg: '#fdfaf3', cardBorder: '#b8a080',
    cardBorderWidth: '1.5', cardRadius: '1', headerBg: '#5c4023', headerText: '#fef3c7',
    commentBg: '#f5efe3', commentText: '#8b7355', commentBorder: '#d4c4a8',
    colText: '#3e2c1a', colType: '#8b7355', colBorder: '#e8dcc8',
    badgePkBg: '#fef3c7', badgePkBorder: '#d4a017', badgePkText: '#7c5e10',
    badgeFkBg: '#e8dcc8', badgeFkBorder: '#b8a080', badgeFkText: '#5c4a30',
    badgeUqBg: '#f0e6f6', badgeUqBorder: '#c9a8d8', badgeUqText: '#6b3a80',
    badgeAiBg: '#dce8d0', badgeAiBorder: '#8faa70', badgeAiText: '#3a5020',
    badgeRadius: '1', noColText: '#b0a08a', lineColor: '#b0a08a', lineBg: '#f5f0e4',
  },
  blueprint: {
    canvasBg: '#0c1a30', cardBg: '#102442', cardBorder: '#2a5a8f',
    cardBorderWidth: '1', cardRadius: '0', headerBg: '#1a4070', headerText: '#93c5fd',
    commentBg: '#0f1e37', commentText: '#5a90c0', commentBorder: '#2a5a8f',
    colText: '#bfdbfe', colType: '#5a90c0', colBorder: '#1a3050',
    badgePkBg: '#1a1a08', badgePkBorder: '#ca8a04', badgePkText: '#facc15',
    badgeFkBg: '#0c1a30', badgeFkBorder: '#3b82f6', badgeFkText: '#93c5fd',
    badgeUqBg: '#1a0c30', badgeUqBorder: '#7c3aed', badgeUqText: '#c4b5fd',
    badgeAiBg: '#0c1a18', badgeAiBorder: '#059669', badgeAiText: '#6ee7b7',
    badgeRadius: '0', noColText: '#3a6a9a', lineColor: '#3a7ac0', lineBg: '#0c1a30',
  },
  minimal: {
    canvasBg: '#fafafa', cardBg: '#ffffff', cardBorder: '#e5e5e5',
    cardBorderWidth: '1', cardRadius: '4', headerBg: '#f5f5f5', headerText: '#262626',
    commentBg: '#fafafa', commentText: '#a3a3a3', commentBorder: '#e5e5e5',
    colText: '#262626', colType: '#a3a3a3', colBorder: 'none',
    badgePkBg: '#f5f5f5', badgePkBorder: '#d4d4d4', badgePkText: '#525252',
    badgeFkBg: '#f5f5f5', badgeFkBorder: '#d4d4d4', badgeFkText: '#525252',
    badgeUqBg: '#f5f5f5', badgeUqBorder: '#d4d4d4', badgeUqText: '#525252',
    badgeAiBg: '#f5f5f5', badgeAiBorder: '#d4d4d4', badgeAiText: '#525252',
    badgeRadius: '2', noColText: '#d4d4d4', lineColor: '#d4d4d4', lineBg: '#fafafa',
  },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cardHeight(t: Table): number {
  const colH = Math.max(t.columns.length, 1) * ROW_H;
  return HEADER_H + (t.comment ? COMMENT_H : 0) + colH + 8; // 8 = column-list padding
}

function getColIndex(table: Table, columnId: string): number {
  return table.columns.findIndex((c) => c.id === columnId);
}

function colY(table: Table, colIdx: number): number {
  const commentH = table.comment ? COMMENT_H : 0;
  return table.position.y + HEADER_H + commentH + colIdx * ROW_H + ROW_H / 2;
}


function renderBadge(
  x: number, y: number, text: string,
  bg: string, border: string, color: string, radius: string,
): string {
  const w = text.length * 6 + 6;
  const h = 14;
  return `<rect x="${x}" y="${y - h / 2}" width="${w}" height="${h}" rx="${radius}" fill="${bg}" stroke="${border}" stroke-width="0.8"/>` +
    `<text x="${x + w / 2}" y="${y + 3.5}" text-anchor="middle" fill="${color}" font-size="9" font-weight="700" font-family="system-ui,sans-serif">${text}</text>`;
}

function renderMemoChips(memos: Memo[], tableX: number, tableY: number): string {
  if (memos.length === 0) return '';
  const parts: string[] = [];
  const chipH = 20;
  const chipGap = 3;
  let cy = tableY - chipH - 4;
  for (const mm of memos) {
    const colors = MEMO_SVG_COLORS[mm.color ?? 'yellow'] ?? MEMO_SVG_COLORS.yellow;
    const maxChars = Math.floor((TABLE_CARD_W - 32) / 6.5);
    const label = (mm.content || '(empty)').replace(/\n/g, ' ').slice(0, maxChars);
    parts.push(`<rect x="${tableX}" y="${cy}" width="${TABLE_CARD_W}" height="${chipH}" rx="4" fill="${colors.header}" opacity="0.9"/>`);
    parts.push(`<text x="${tableX + 8}" y="${cy + chipH / 2 + 4}" fill="${colors.text}" font-size="10" font-family="system-ui,sans-serif">\u{1F4CC} ${esc(label)}</text>`);
    cy -= chipH + chipGap;
  }
  return parts.join('\n');
}

function renderTable(t: Table, theme: ThemeColors, offsetX: number, offsetY: number, themeId: ThemeId): string {
  const x = t.position.x - offsetX;
  const y = t.position.y - offsetY;
  const h = cardHeight(t);
  const r = theme.cardRadius;

  // Per-table header color override
  let hdrBg = theme.headerBg;
  let hdrText = theme.headerText;
  if (t.color) {
    const entry = TABLE_COLORS[t.color as TableColorId];
    if (entry) {
      const mapping = entry.themes[themeId];
      hdrBg = mapping.headerBg;
      hdrText = mapping.headerText;
    }
  }

  const parts: string[] = [];

  // Card background
  parts.push(`<rect x="${x}" y="${y}" width="${TABLE_CARD_W}" height="${h}" rx="${r}" fill="${theme.cardBg}" stroke="${theme.cardBorder}" stroke-width="${theme.cardBorderWidth}"/>`);

  // Header background (clip to top radius)
  parts.push(`<clipPath id="hdr-${esc(t.id)}"><rect x="${x}" y="${y}" width="${TABLE_CARD_W}" height="${HEADER_H}" rx="${r}"/></clipPath>`);
  parts.push(`<rect x="${x}" y="${y}" width="${TABLE_CARD_W}" height="${HEADER_H}" fill="${hdrBg}" clip-path="url(#hdr-${esc(t.id)})"/>`);
  // Header bottom border (to cover rounded corners at bottom of header)
  parts.push(`<rect x="${x}" y="${y + HEADER_H - 1}" width="${TABLE_CARD_W}" height="1" fill="${hdrBg}"/>`);

  // Table name
  const nameText = t.name.length > 24 ? t.name.slice(0, 23) + '\u2026' : t.name;
  parts.push(`<text x="${x + 10}" y="${y + HEADER_H / 2 + 5}" fill="${hdrText}" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${esc(nameText)}</text>`);

  let curY = y + HEADER_H;

  // Comment
  if (t.comment) {
    parts.push(`<rect x="${x}" y="${curY}" width="${TABLE_CARD_W}" height="${COMMENT_H}" fill="${theme.commentBg}"/>`);
    parts.push(`<line x1="${x}" y1="${curY + COMMENT_H}" x2="${x + TABLE_CARD_W}" y2="${curY + COMMENT_H}" stroke="${theme.commentBorder}" stroke-width="0.5"/>`);
    const commentText = t.comment.length > 28 ? t.comment.slice(0, 27) + '\u2026' : t.comment;
    parts.push(`<text x="${x + 10}" y="${curY + COMMENT_H / 2 + 4}" fill="${theme.commentText}" font-size="11" font-style="italic" font-family="system-ui,sans-serif">${esc(commentText)}</text>`);
    curY += COMMENT_H;
  }

  curY += 4; // column-list top padding

  const fkSourceIds = new Set(t.foreignKeys.flatMap((fk) => fk.columnIds));
  const uniqueKeyColIds = new Set((t.uniqueKeys ?? []).flatMap((uk) => uk.columnIds));

  if (t.columns.length === 0) {
    parts.push(`<text x="${x + TABLE_CARD_W / 2}" y="${curY + ROW_H / 2 + 4}" text-anchor="middle" fill="${theme.noColText}" font-size="12" font-style="italic" font-family="system-ui,sans-serif">No columns</text>`);
  }

  for (let i = 0; i < t.columns.length; i++) {
    const col = t.columns[i];
    const rowY = curY + i * ROW_H;
    const centerY = rowY + ROW_H / 2;

    // Row border (except last)
    if (i < t.columns.length - 1 && theme.colBorder !== 'none') {
      parts.push(`<line x1="${x + 1}" y1="${rowY + ROW_H}" x2="${x + TABLE_CARD_W - 1}" y2="${rowY + ROW_H}" stroke="${theme.colBorder}" stroke-width="0.5"/>`);
    }

    let textX = x + 8;

    // PK / FK badge
    if (col.primaryKey) {
      parts.push(renderBadge(textX, centerY, 'PK', theme.badgePkBg, theme.badgePkBorder, theme.badgePkText, theme.badgeRadius));
      textX += 26;
    } else if (fkSourceIds.has(col.id)) {
      parts.push(renderBadge(textX, centerY, 'FK', theme.badgeFkBg, theme.badgeFkBorder, theme.badgeFkText, theme.badgeRadius));
      textX += 26;
    } else {
      textX += 26;
    }

    // Column name
    const colName = col.name.length > 16 ? col.name.slice(0, 15) + '\u2026' : col.name;
    parts.push(`<text x="${textX}" y="${centerY + 4}" fill="${theme.colText}" font-size="12" font-family="system-ui,sans-serif">${esc(colName)}</text>`);

    // Type text (right-aligned area)
    const typeStr = `${col.type}${col.length ? `(${col.length})` : ''}${col.nullable ? '?' : ''}`;
    let typeX = x + TABLE_CARD_W - 8;

    // UQ / AI badges (rightmost)
    const showUq = ((col.unique || uniqueKeyColIds.has(col.id)) && !col.primaryKey);
    const showAi = col.autoIncrement;
    if (showAi) {
      typeX -= 22;
      parts.push(renderBadge(typeX, centerY, 'AI', theme.badgeAiBg, theme.badgeAiBorder, theme.badgeAiText, theme.badgeRadius));
      typeX -= 4;
    }
    if (showUq) {
      typeX -= 16;
      parts.push(renderBadge(typeX, centerY, 'U', theme.badgeUqBg, theme.badgeUqBorder, theme.badgeUqText, theme.badgeRadius));
      typeX -= 4;
    }

    parts.push(`<text x="${typeX}" y="${centerY + 4}" text-anchor="end" fill="${theme.colType}" font-size="11" font-family="system-ui,sans-serif">${esc(typeStr)}</text>`);
  }

  return parts.join('\n');
}

function renderLines(schema: ERDSchema, theme: ThemeColors, offsetX: number, offsetY: number, lineType: LineType = 'bezier'): string {
  const parts: string[] = [];
  const color = theme.lineColor;
  const bg = theme.lineBg;

  // Build AABBs (offset-adjusted) for obstacle avoidance
  const aabbs: AABB[] = schema.tables.map((t) => ({
    id: t.id,
    x: t.position.x - offsetX,
    y: t.position.y - offsetY,
    w: TABLE_W,
    h: cardHeight(t),
  }));

  // Collect all FK line inputs
  interface FKMeta { fromRight: boolean; toLeft: boolean; isUnique: boolean; isNullable: boolean; x1: number; y1: number; x2: number; y2: number; fkLabel: string }
  const inputs: FKLineInput[] = [];
  const metas: FKMeta[] = [];

  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = schema.tables.find((t) => t.id === fk.referencedTableId);
      if (!refTable) continue;

      for (let i = 0; i < fk.columnIds.length; i++) {
        const srcColIdx = getColIndex(table, fk.columnIds[i]);
        const refColIdx = getColIndex(refTable, fk.referencedColumnIds[i]);
        if (srcColIdx < 0 || refColIdx < 0) continue;

        const srcCenterX = table.position.x + TABLE_W / 2;
        const refCenterX = refTable.position.x + TABLE_W / 2;
        const overlapAmount = Math.min(table.position.x + TABLE_W, refTable.position.x + TABLE_W)
          - Math.max(table.position.x, refTable.position.x);
        const overlapsX = overlapAmount > TABLE_W * 0.3;

        let fromRight: boolean, toLeft: boolean;
        if (overlapsX) { fromRight = true; toLeft = false; }
        else { fromRight = srcCenterX <= refCenterX; toLeft = fromRight; }

        const x1 = (fromRight ? table.position.x + TABLE_W : table.position.x) - offsetX;
        const y1 = colY(table, srcColIdx) - offsetY;
        const x2 = (toLeft ? refTable.position.x : refTable.position.x + TABLE_W) - offsetX;
        const y2 = colY(refTable, refColIdx) - offsetY;

        const srcCol = table.columns[srcColIdx];
        const isUnique = srcCol?.unique ?? false;
        const isNullable = srcCol?.nullable ?? false;

        inputs.push({
          id: `${fk.id}:${i}`,
          sourceTableId: table.id,
          targetTableId: fk.referencedTableId,
          x1, y1, x2, y2,
          fromRight, toLeft,
        });
        metas.push({ fromRight, toLeft, isUnique, isNullable, x1, y1, x2, y2, fkLabel: fk.label ?? '' });
      }
    }
  }

  // Route all lines
  let routes: Map<string, FKLineRoute>;
  if (lineType === 'bezier') {
    routes = routeFKLines(inputs, aabbs);
  } else {
    routes = new Map();
    const selfRefGroups = new Map<string, typeof inputs[number][]>();
    for (const input of inputs) {
      if (input.sourceTableId === input.targetTableId) {
        const group = selfRefGroups.get(input.sourceTableId) ?? [];
        group.push(input);
        selfRefGroups.set(input.sourceTableId, group);
      }
    }
    const selfRefLoopIndex = new Map<string, number>();
    for (const [, group] of selfRefGroups) {
      group.forEach((inp, i) => selfRefLoopIndex.set(inp.id, i));
    }
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const meta = metas[i];
      if (input.sourceTableId === input.targetTableId) {
        routes.set(input.id, computeSelfRefLoop(meta.x1, meta.y1, meta.x2, meta.y2, selfRefLoopIndex.get(input.id) ?? 0));
      } else if (lineType === 'rounded') {
        routes.set(input.id, computeRoundedOrthogonalLine(meta.x1, meta.y1, meta.x2, meta.y2, meta.fromRight, meta.toLeft));
      } else {
        routes.set(input.id, computeOrthogonalLine(meta.x1, meta.y1, meta.x2, meta.y2, meta.fromRight, meta.toLeft));
      }
    }
  }

  // Render each line
  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx];
    const meta = metas[idx];
    const route = routes.get(input.id);
    if (!route) continue;

    const { x1, y1, x2, y2, fromRight, toLeft, isUnique, isNullable } = meta;

    // Bezier line
    parts.push(`<path d="${route.path}" fill="none" stroke="${color}" stroke-width="2"${isNullable ? ' stroke-dasharray="6 3"' : ''}/>`);

    // Cardinality label
    const labelText = isUnique ? '1:1' : '1:N';
    parts.push(`<rect x="${route.labelX - 11}" y="${route.labelY - 8}" width="22" height="16" rx="4" fill="${bg}" stroke="${color}" stroke-width="0.8" opacity="0.85"/>`);
    parts.push(`<text x="${route.labelX}" y="${route.labelY + 4}" text-anchor="middle" fill="${color}" font-size="9" font-weight="700" font-family="system-ui,sans-serif">${labelText}</text>`);
    if (meta.fkLabel) {
      const escaped = meta.fkLabel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      parts.push(`<text x="${route.labelX}" y="${route.labelY + 18}" text-anchor="middle" fill="${color}" font-size="10" font-style="italic" font-family="system-ui,sans-serif">${escaped}</text>`);
    }

    // Parent side markers
    const pDir = toLeft ? -1 : 1;
    const pTickX = x2 + pDir * 6;
    parts.push(`<path d="M ${pTickX} ${y2 - 6} L ${pTickX} ${y2 + 6}" stroke="${color}" stroke-width="2" fill="none"/>`);
    const parentCircleCx = x2 + pDir * 14;
    if (!isNullable) {
      parts.push(`<path d="M ${parentCircleCx} ${y2 - 6} L ${parentCircleCx} ${y2 + 6}" stroke="${color}" stroke-width="2" fill="none"/>`);
    } else {
      parts.push(`<circle cx="${parentCircleCx}" cy="${y2}" r="5" stroke="${color}" stroke-width="2" fill="${bg}"/>`);
    }

    // Child side markers
    const cDir = fromRight ? 1 : -1;
    if (isUnique) {
      const cTickX = x1 + cDir * 6;
      parts.push(`<path d="M ${cTickX} ${y1 - 6} L ${cTickX} ${y1 + 6}" stroke="${color}" stroke-width="2" fill="none"/>`);
    } else {
      const tipX = x1 + cDir * 12;
      const baseX = x1 + cDir * 4;
      parts.push(`<path d="M ${tipX} ${y1} L ${baseX} ${y1} M ${tipX} ${y1} L ${baseX} ${y1 - 7} M ${tipX} ${y1} L ${baseX} ${y1 + 7}" stroke="${color}" stroke-width="2" fill="none"/>`);
    }
    const childCircleCx = x1 + cDir * 18;
    parts.push(`<circle cx="${childCircleCx}" cy="${y1}" r="5" stroke="${color}" stroke-width="2" fill="${bg}"/>`);
  }

  return parts.join('\n');
}

const MEMO_SVG_COLORS: Record<string, { bg: string; header: string; text: string }> = {
  yellow:  { bg: '#fef9c3', header: '#facc15', text: '#713f12' },
  blue:    { bg: '#dbeafe', header: '#60a5fa', text: '#1e3a5f' },
  green:   { bg: '#dcfce7', header: '#4ade80', text: '#14532d' },
  pink:    { bg: '#fce7f3', header: '#f472b6', text: '#831843' },
  purple:  { bg: '#f3e8ff', header: '#c084fc', text: '#581c87' },
  orange:  { bg: '#ffedd5', header: '#fb923c', text: '#7c2d12' },
};

function renderMemo(memo: Memo, offsetX: number, offsetY: number): string {
  const x = memo.position.x - offsetX;
  const y = memo.position.y - offsetY;
  const w = memo.width;
  const h = memo.height;
  const colors = MEMO_SVG_COLORS[memo.color ?? 'yellow'] ?? MEMO_SVG_COLORS.yellow;
  const parts: string[] = [];

  // Card background (outside clip so border renders fully)
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${colors.bg}" stroke="${colors.header}" stroke-width="1"/>`);

  // ClipPath to contain header and content within memo bounds
  const clipId = `memo-clip-${esc(memo.id)}`;
  parts.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/></clipPath>`);
  parts.push(`<g clip-path="url(#${clipId})">`);

  // Header bar
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="24" rx="6" fill="${colors.header}"/>`);
  parts.push(`<rect x="${x}" y="${y + 18}" width="${w}" height="6" fill="${colors.header}"/>`);

  // Content text (simple line wrapping)
  if (memo.content) {
    const lineH = 16;
    const maxChars = Math.floor((w - 20) / 7);
    const lines = memo.content.split('\n');
    let lineIdx = 0;
    const maxLines = Math.floor((h - 36) / lineH);
    for (const line of lines) {
      if (lineIdx >= maxLines) break;
      if (line.length <= maxChars) {
        parts.push(`<text x="${x + 10}" y="${y + 40 + lineIdx * lineH}" fill="${colors.text}" font-size="12" font-family="system-ui,sans-serif">${esc(line)}</text>`);
        lineIdx++;
      } else {
        for (let i = 0; i < line.length && lineIdx < maxLines; i += maxChars) {
          parts.push(`<text x="${x + 10}" y="${y + 40 + lineIdx * lineH}" fill="${colors.text}" font-size="12" font-family="system-ui,sans-serif">${esc(line.slice(i, i + maxChars))}</text>`);
          lineIdx++;
        }
      }
    }
  }

  parts.push(`</g>`);

  return parts.join('\n');
}

export function exportSvg(schema: ERDSchema, themeId: string, lineType: LineType = 'bezier'): string {
  const theme = THEMES[themeId] ?? THEMES.modern;
  const allMemos = schema.memos ?? [];
  // Separate free-floating memos from attached memos (attached render as chips on tables)
  const freeMemos = allMemos.filter((mm) => !mm.attachedTableId);
  const attachedByTable = new Map<string, Memo[]>();
  for (const mm of allMemos) {
    if (mm.attachedTableId) {
      const arr = attachedByTable.get(mm.attachedTableId) ?? [];
      arr.push(mm);
      attachedByTable.set(mm.attachedTableId, arr);
    }
  }

  if (schema.tables.length === 0 && freeMemos.length === 0) return '';

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of schema.tables) {
    const h = cardHeight(t);
    const chipCount = attachedByTable.get(t.id)?.length ?? 0;
    const chipOffset = chipCount > 0 ? chipCount * 23 + 4 : 0;
    minX = Math.min(minX, t.position.x);
    minY = Math.min(minY, t.position.y - chipOffset);
    maxX = Math.max(maxX, t.position.x + TABLE_CARD_W);
    maxY = Math.max(maxY, t.position.y + h);
  }
  for (const mm of freeMemos) {
    minX = Math.min(minX, mm.position.x);
    minY = Math.min(minY, mm.position.y);
    maxX = Math.max(maxX, mm.position.x + mm.width);
    maxY = Math.max(maxY, mm.position.y + mm.height);
  }

  const offsetX = minX - PAD;
  const offsetY = minY - PAD;
  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);

  const memosSvg = freeMemos.map((mm) => renderMemo(mm, offsetX, offsetY)).join('\n');
  const lines = renderLines(schema, theme, offsetX, offsetY, lineType);
  const tablesSvg: string[] = [];
  for (const t of schema.tables) {
    tablesSvg.push(renderTable(t, theme, offsetX, offsetY, themeId as ThemeId));
    const chips = attachedByTable.get(t.id);
    if (chips) {
      tablesSvg.push(renderMemoChips(chips, t.position.x - offsetX, t.position.y - offsetY));
    }
  }
  const tables = tablesSvg.join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${theme.canvasBg}"/>
  <g>
${memosSvg}
  </g>
  <g>
${lines}
  </g>
  <g>
${tables}
  </g>
</svg>`;
}
