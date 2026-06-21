export const MIN_TABLE_WIDTH_PCT = 10;
export const MAX_TABLE_WIDTH_PCT = 100;
export const DEFAULT_TABLE_WIDTH_PCT = MAX_TABLE_WIDTH_PCT;
export const DEFAULT_TABLE_OFFSET_PCT = 0;
export const MIN_ROW_HEIGHT_PX = 20;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampTableWidthPct(value: number): number {
  return Number.isFinite(value)
    ? Math.max(MIN_TABLE_WIDTH_PCT, Math.min(MAX_TABLE_WIDTH_PCT, value))
    : DEFAULT_TABLE_WIDTH_PCT;
}

export function normalizeTableWidthPct(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? clampTableWidthPct(numericValue)
    : DEFAULT_TABLE_WIDTH_PCT;
}

export function readTableWidthPct(table: HTMLTableElement): number {
  const dataValue = Number(table.dataset.tableWidthPct);
  if (Number.isFinite(dataValue) && dataValue > 0) {
    return clampTableWidthPct(dataValue);
  }

  const match = table.style.width.match(/^(\d+(?:\.\d+)?)%$/);
  return match ? clampTableWidthPct(Number(match[1])) : DEFAULT_TABLE_WIDTH_PCT;
}

export function applyTableWidthPct(table: HTMLTableElement, value: number): number {
  const width = clampTableWidthPct(roundToTenth(value));
  const cssWidth = `${width}%`;

  table.dataset.tableWidthPct = String(width);
  table.style.setProperty('--table-width-pct', cssWidth);
  table.style.width = cssWidth;
  applyTableOffsetPct(table, readTableOffsetPct(table, width), width);

  return width;
}

export function clampTableOffsetPct(value: number, tableWidthPct: number): number {
  const maxOffset = MAX_TABLE_WIDTH_PCT - normalizeTableWidthPct(tableWidthPct);
  return Number.isFinite(value)
    ? Math.max(DEFAULT_TABLE_OFFSET_PCT, Math.min(maxOffset, value))
    : DEFAULT_TABLE_OFFSET_PCT;
}

export function normalizeTableOffsetPct(value: unknown, tableWidthPct: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? clampTableOffsetPct(numericValue, tableWidthPct)
    : DEFAULT_TABLE_OFFSET_PCT;
}

export function readTableOffsetPct(
  table: HTMLTableElement,
  tableWidthPct = readTableWidthPct(table),
): number {
  const dataValue = Number(table.dataset.tableOffsetPct);
  if (Number.isFinite(dataValue) && dataValue >= 0) {
    return clampTableOffsetPct(dataValue, tableWidthPct);
  }

  const match = table.style.marginLeft.match(/^(\d+(?:\.\d+)?)%$/);
  return match
    ? clampTableOffsetPct(Number(match[1]), tableWidthPct)
    : DEFAULT_TABLE_OFFSET_PCT;
}

export function applyTableOffsetPct(
  table: HTMLTableElement,
  value: number,
  tableWidthPct = readTableWidthPct(table),
): number {
  const offset = clampTableOffsetPct(roundToTenth(value), tableWidthPct);
  const cssOffset = `${offset}%`;

  table.dataset.tableOffsetPct = String(offset);
  table.style.setProperty('--table-offset-pct', cssOffset);
  table.style.marginLeft = cssOffset;

  return offset;
}

export function normalizeRowHeight(value: unknown): number | null {
  const height =
    typeof value === 'string' && value.trim().endsWith('px')
      ? Number(value.trim().slice(0, -2))
      : Number(value);
  return Number.isFinite(height) && height > 0
    ? Math.max(MIN_ROW_HEIGHT_PX, Math.round(height))
    : null;
}

export function clampRowHeight(height: number): number {
  return normalizeRowHeight(height) ?? MIN_ROW_HEIGHT_PX;
}
