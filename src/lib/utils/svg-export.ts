import type { ERDSchema, Table } from '$lib/types/erd';

const TABLE_W = 220;
const LINE_ATTACH_W = 200; // RelationLines uses 200 for FK attachment X
const HEADER_H = 37;
const ROW_H = 26;
const COMMENT_H = 24;
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
  // Match RelationLines: ignores comment height
  return table.position.y + HEADER_H + colIdx * ROW_H + ROW_H / 2;
}

function computeBezier(x1: number, y1: number, x2: number, y2: number, fromRight: boolean, toLeft: boolean) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const straight = Math.min(20, Math.max(8, dx * 0.25));
  const dirS = fromRight ? 1 : -1;
  const dirT = toLeft ? -1 : 1;
  const sx1 = x1 + dirS * straight;
  const sx2 = x2 + dirT * straight;
  const curveDx = Math.abs(sx2 - sx1);
  const offset = Math.max(40, Math.min(150, Math.max(curveDx * 0.4, dy * 0.4)));
  const cx1 = sx1 + dirS * offset;
  const cx2 = sx2 + dirT * offset;
  const path = `M ${x1} ${y1} L ${sx1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${sx2} ${y2} L ${x2} ${y2}`;
  const labelX = (sx1 + 3 * cx1 + 3 * cx2 + sx2) / 8;
  const labelY = (y1 + y2) / 2;
  return { path, labelX, labelY };
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

function renderTable(t: Table, theme: ThemeColors, offsetX: number, offsetY: number): string {
  const x = t.position.x - offsetX;
  const y = t.position.y - offsetY;
  const h = cardHeight(t);
  const r = theme.cardRadius;

  const parts: string[] = [];

  // Card background
  parts.push(`<rect x="${x}" y="${y}" width="${TABLE_W}" height="${h}" rx="${r}" fill="${theme.cardBg}" stroke="${theme.cardBorder}" stroke-width="${theme.cardBorderWidth}"/>`);

  // Header background (clip to top radius)
  parts.push(`<clipPath id="hdr-${esc(t.id)}"><rect x="${x}" y="${y}" width="${TABLE_W}" height="${HEADER_H}" rx="${r}"/></clipPath>`);
  parts.push(`<rect x="${x}" y="${y}" width="${TABLE_W}" height="${HEADER_H}" fill="${theme.headerBg}" clip-path="url(#hdr-${esc(t.id)})"/>`);
  // Header bottom border (to cover rounded corners at bottom of header)
  parts.push(`<rect x="${x}" y="${y + HEADER_H - 1}" width="${TABLE_W}" height="1" fill="${theme.headerBg}"/>`);

  // Table name
  const nameText = t.name.length > 24 ? t.name.slice(0, 23) + '\u2026' : t.name;
  parts.push(`<text x="${x + 10}" y="${y + HEADER_H / 2 + 5}" fill="${theme.headerText}" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${esc(nameText)}</text>`);

  let curY = y + HEADER_H;

  // Comment
  if (t.comment) {
    parts.push(`<rect x="${x}" y="${curY}" width="${TABLE_W}" height="${COMMENT_H}" fill="${theme.commentBg}"/>`);
    parts.push(`<line x1="${x}" y1="${curY + COMMENT_H}" x2="${x + TABLE_W}" y2="${curY + COMMENT_H}" stroke="${theme.commentBorder}" stroke-width="0.5"/>`);
    const commentText = t.comment.length > 28 ? t.comment.slice(0, 27) + '\u2026' : t.comment;
    parts.push(`<text x="${x + 10}" y="${curY + COMMENT_H / 2 + 4}" fill="${theme.commentText}" font-size="11" font-style="italic" font-family="system-ui,sans-serif">${esc(commentText)}</text>`);
    curY += COMMENT_H;
  }

  curY += 4; // column-list top padding

  const fkSourceIds = new Set(t.foreignKeys.flatMap((fk) => fk.columnIds));
  const uniqueKeyColIds = new Set((t.uniqueKeys ?? []).flatMap((uk) => uk.columnIds));

  if (t.columns.length === 0) {
    parts.push(`<text x="${x + TABLE_W / 2}" y="${curY + ROW_H / 2 + 4}" text-anchor="middle" fill="${theme.noColText}" font-size="12" font-style="italic" font-family="system-ui,sans-serif">No columns</text>`);
  }

  for (let i = 0; i < t.columns.length; i++) {
    const col = t.columns[i];
    const rowY = curY + i * ROW_H;
    const centerY = rowY + ROW_H / 2;

    // Row border (except last)
    if (i < t.columns.length - 1 && theme.colBorder !== 'none') {
      parts.push(`<line x1="${x + 1}" y1="${rowY + ROW_H}" x2="${x + TABLE_W - 1}" y2="${rowY + ROW_H}" stroke="${theme.colBorder}" stroke-width="0.5"/>`);
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
    let typeX = x + TABLE_W - 8;

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

function renderLines(schema: ERDSchema, theme: ThemeColors, offsetX: number, offsetY: number): string {
  const parts: string[] = [];
  const color = theme.lineColor;
  const bg = theme.lineBg;

  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = schema.tables.find((t) => t.id === fk.referencedTableId);
      if (!refTable) continue;

      for (let i = 0; i < fk.columnIds.length; i++) {
        const srcColIdx = getColIndex(table, fk.columnIds[i]);
        const refColIdx = getColIndex(refTable, fk.referencedColumnIds[i]);
        if (srcColIdx < 0 || refColIdx < 0) continue;

        const srcCenterX = table.position.x + LINE_ATTACH_W / 2;
        const refCenterX = refTable.position.x + LINE_ATTACH_W / 2;
        const overlapAmount = Math.min(table.position.x + LINE_ATTACH_W, refTable.position.x + LINE_ATTACH_W)
          - Math.max(table.position.x, refTable.position.x);
        const overlapsX = overlapAmount > LINE_ATTACH_W * 0.3;

        let fromRight: boolean, toLeft: boolean;
        if (overlapsX) { fromRight = true; toLeft = false; }
        else { fromRight = srcCenterX <= refCenterX; toLeft = fromRight; }

        const x1 = (fromRight ? table.position.x + LINE_ATTACH_W : table.position.x) - offsetX;
        const y1 = colY(table, srcColIdx) - offsetY;
        const x2 = (toLeft ? refTable.position.x : refTable.position.x + LINE_ATTACH_W) - offsetX;
        const y2 = colY(refTable, refColIdx) - offsetY;

        const srcCol = table.columns[srcColIdx];
        const isUnique = srcCol?.unique ?? false;
        const isNullable = srcCol?.nullable ?? false;

        const { path, labelX, labelY } = computeBezier(x1, y1, x2, y2, fromRight, toLeft);

        // Bezier line
        parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"${isNullable ? ' stroke-dasharray="6 3"' : ''}/>`);

        // Cardinality label
        const labelText = isUnique ? '1:1' : '1:N';
        parts.push(`<rect x="${labelX - 11}" y="${labelY - 8}" width="22" height="16" rx="4" fill="${bg}" stroke="${color}" stroke-width="0.8" opacity="0.85"/>`);
        parts.push(`<text x="${labelX}" y="${labelY + 4}" text-anchor="middle" fill="${color}" font-size="9" font-weight="700" font-family="system-ui,sans-serif">${labelText}</text>`);

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
    }
  }

  return parts.join('\n');
}

export function exportSvg(schema: ERDSchema, themeId: string): string {
  const theme = THEMES[themeId] ?? THEMES.modern;

  if (schema.tables.length === 0) return '';

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of schema.tables) {
    const h = cardHeight(t);
    minX = Math.min(minX, t.position.x);
    minY = Math.min(minY, t.position.y);
    maxX = Math.max(maxX, t.position.x + TABLE_W);
    maxY = Math.max(maxY, t.position.y + h);
  }

  const offsetX = minX - PAD;
  const offsetY = minY - PAD;
  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);

  const lines = renderLines(schema, theme, offsetX, offsetY);
  const tables = schema.tables.map((t) => renderTable(t, theme, offsetX, offsetY)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${theme.canvasBg}"/>
  <g>
${lines}
  </g>
  <g>
${tables}
  </g>
</svg>`;
}
