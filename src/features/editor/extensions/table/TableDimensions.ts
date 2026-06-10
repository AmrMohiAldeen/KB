export const MIN_TABLE_WIDTH_PCT = 10;
export const MAX_TABLE_WIDTH_PCT = 100;
export const DEFAULT_TABLE_WIDTH_PCT = MAX_TABLE_WIDTH_PCT;
export const MIN_ROW_HEIGHT_PX = 20;

export function clampTableWidthPct(value: number) {
  return Math.max(MIN_TABLE_WIDTH_PCT, Math.min(MAX_TABLE_WIDTH_PCT, value));
}

export function normalizeTableWidthPct(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? clampTableWidthPct(numericValue)
    : DEFAULT_TABLE_WIDTH_PCT;
}

export function readTableWidthPct(table: HTMLTableElement) {
  const dataValue = Number(table.dataset.tableWidthPct);
  if (Number.isFinite(dataValue) && dataValue > 0) {
    return clampTableWidthPct(dataValue);
  }

  const match = table.style.width.match(/^(\d+(?:\.\d+)?)%$/);
  return match ? clampTableWidthPct(Number(match[1])) : DEFAULT_TABLE_WIDTH_PCT;
}

export function applyTableWidthPct(table: HTMLTableElement, value: number) {
  const width = clampTableWidthPct(Math.round(value * 10) / 10);
  const cssWidth = `${width}%`;

  table.dataset.tableWidthPct = String(width);
  table.style.setProperty('--table-width-pct', cssWidth);
  table.style.width = cssWidth;

  return width;
}

export function clampRowHeight(height: number) {
  return Math.max(MIN_ROW_HEIGHT_PX, Math.round(height));
}

type HeightStyleSnapshot = {
  element: HTMLElement;
  value: string;
  priority: string;
};

export type RowHeightPreview = {
  elements: HTMLElement[];
  originalStyles: HeightStyleSnapshot[];
};

export function createRowHeightPreview(row: HTMLTableRowElement): RowHeightPreview {
  const elements = [row, ...Array.from(row.cells)];

  return {
    elements,
    originalStyles: elements.map((element) => ({
      element,
      value: element.style.getPropertyValue('height'),
      priority: element.style.getPropertyPriority('height'),
    })),
  };
}

export function applyRowHeightPreview(preview: RowHeightPreview, height: number) {
  const cssHeight = `${clampRowHeight(height)}px`;

  preview.elements.forEach((element) => {
    element.style.setProperty('height', cssHeight, 'important');
  });
}

export function finalizeRowHeightPreview(preview: RowHeightPreview, height: number) {
  const cssHeight = `${clampRowHeight(height)}px`;

  preview.elements.forEach((element) => {
    element.style.setProperty('height', cssHeight);
  });
}

export function restoreRowHeightPreview(preview: RowHeightPreview) {
  preview.originalStyles.forEach(({ element, value, priority }) => {
    if (value) {
      element.style.setProperty('height', value, priority);
    } else {
      element.style.removeProperty('height');
    }
  });
}
