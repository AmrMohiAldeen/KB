import {
  TABLE_CELL_TAGS,
  TABLE_COL_TAGS,
  TABLE_DIRECT_CHILD_TAGS,
  TABLE_ROW_TAGS,
  TABLE_SECTION_TAGS,
} from './pasteSanitizerConfig';
import { getTagName, isElementNode, removeNode } from './domUtils';
import type { PercentReadOptions } from './pasteSanitizerTypes';

const MAX_TABLE_SPAN = 50;
const LENGTH_TO_PX = {
  cm: 96 / 2.54,
  in: 96,
  mm: 96 / 25.4,
  pc: 16,
  pt: 96 / 72,
  px: 1,
} as const;

function readPercent(
  value: string | null,
  { allowUnitless = false, max, min }: PercentReadOptions,
): number | null {
  const match = value
    ?.trim()
    .match(allowUnitless ? /^(\d+(?:\.\d+)?)%?$/ : /^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const percentage = Number(match[1]);

  return Number.isFinite(percentage)
    ? Math.max(min, Math.min(max, percentage))
    : null;
}

function readInteger(value: string | null, min: number, max: number): number | null {
  const match = value?.trim().match(/^\d+$/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function readSafePixelLength(
  value: string | null,
  { max, min }: { max: number; min: number },
): number | null {
  const match = value
    ?.trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)(px|pt|pc|in|cm|mm)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = (match[2] || 'px') as keyof typeof LENGTH_TO_PX;
  const pixels = Math.round(amount * LENGTH_TO_PX[unit]);

  return Number.isFinite(pixels) && pixels >= min && pixels <= max
    ? pixels
    : null;
}

function readTableSpan(element: HTMLElement, attributeName: string): number {
  return readInteger(element.getAttribute(attributeName), 1, MAX_TABLE_SPAN) ?? 1;
}

function readColumnWidth(col: HTMLTableColElement): number | null {
  return readSafePixelLength(col.getAttribute('width') ?? col.style.width, {
    max: 2000,
    min: 25,
  });
}

function readCellWidth(cell: HTMLTableCellElement): number | null {
  return readSafePixelLength(cell.getAttribute('width') ?? cell.style.width, {
    max: 2000,
    min: 25,
  });
}

function readRowHeight(row: HTMLTableRowElement): number | null {
  const firstCell = Array.from(row.children).find((child) =>
    TABLE_CELL_TAGS.has(getTagName(child)),
  ) as HTMLTableCellElement | undefined;

  return readSafePixelLength(row.getAttribute('height') ?? row.style.height, {
    max: 800,
    min: 20,
  }) ?? readSafePixelLength(
    firstCell?.getAttribute('height') ?? firstCell?.style.height ?? null,
    {
      max: 800,
      min: 20,
    },
  );
}

function readColwidthList(value: string | null, expectedLength: number): number[] | null {
  if (!value) return null;

  const widths = value
    .split(',')
    .map((width) => readSafePixelLength(width, { max: 2000, min: 25 }));

  return widths.length === expectedLength &&
    widths.every((width): width is number => width != null)
    ? widths
    : null;
}

function tableColumnWidths(table: HTMLTableElement): number[] {
  const widths: number[] = [];

  Array.from(table.children).forEach((child) => {
    if (getTagName(child) !== 'colgroup') return;

    Array.from(child.children).forEach((col) => {
      if (getTagName(col) !== 'col') return;

      const width = readColumnWidth(col as HTMLTableColElement);
      const span = readTableSpan(col as HTMLElement, 'span');
      if (width == null || widths.length >= MAX_TABLE_SPAN) return;

      const count = Math.min(span, MAX_TABLE_SPAN - widths.length);
      widths.push(...Array.from({ length: count }, () => width));
      col.setAttribute('width', String(width));
    });
  });

  return widths;
}

function directTableCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter((child): child is HTMLTableCellElement =>
    TABLE_CELL_TAGS.has(getTagName(child)),
  );
}

function normalizeTableCellColwidths(table: HTMLTableElement): void {
  const columnWidths = tableColumnWidths(table);
  const occupiedRowspans: number[] = [];

  Array.from(table.querySelectorAll<HTMLTableRowElement>('tr')).forEach((row) => {
    for (let index = 0; index < occupiedRowspans.length; index += 1) {
      occupiedRowspans[index] = Math.max(0, occupiedRowspans[index] - 1);
    }

    let columnIndex = 0;

    directTableCells(row).forEach((cell) => {
      while (occupiedRowspans[columnIndex] > 0) columnIndex += 1;

      const colspan = readTableSpan(cell, 'colspan');
      const rowspan = readTableSpan(cell, 'rowspan');
      const existing = readColwidthList(cell.getAttribute('colwidth'), colspan);
      const fromColumns = columnWidths.slice(columnIndex, columnIndex + colspan);
      const cellWidth = readCellWidth(cell);
      const fallback =
        cellWidth == null
          ? null
          : Array.from(
              { length: colspan },
              () => Math.max(25, Math.round(cellWidth / colspan)),
            );
      const next = existing ?? (fromColumns.length === colspan ? fromColumns : null) ?? fallback;

      if (next) cell.setAttribute('colwidth', next.join(','));

      for (let offset = 0; offset < colspan; offset += 1) {
        if (rowspan > 1) {
          occupiedRowspans[columnIndex + offset] = Math.max(
            occupiedRowspans[columnIndex + offset] ?? 0,
            rowspan,
          );
        }
      }

      columnIndex += colspan;
    });
  });
}

function normalizeTableRowHeights(table: HTMLTableElement): void {
  table.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    const height = readRowHeight(row);
    if (height != null) row.setAttribute('data-row-height', String(height));
  });
}

export function readTableWidthPercent(table: HTMLElement): number | null {
  return (
    readPercent(table.getAttribute('data-table-width-pct'), {
      allowUnitless: true,
      max: 100,
      min: 10,
    }) ??
    readPercent(table.style.width, { max: 100, min: 10 }) ??
    readPercent(table.getAttribute('width'), { max: 100, min: 10 })
  );
}

export function readTableOffsetPercent(table: HTMLElement): number | null {
  return (
    readPercent(table.getAttribute('data-table-offset-pct'), {
      allowUnitless: true,
      max: 100,
      min: 0,
    }) ?? readPercent(table.style.marginLeft, { max: 100, min: 0 })
  );
}

function hasDirectChildWithTag(element: Element, tagNames: Set<string>): boolean {
  return Array.from(element.children).some((child) =>
    tagNames.has(getTagName(child)),
  );
}

function removeInvalidChildren(element: Element, allowedTags: Set<string>): void {
  Array.from(element.childNodes).forEach((child) => {
    if (isElementNode(child) && allowedTags.has(getTagName(child))) return;

    removeNode(child);
  });
}

// converts pasted tables that have <tr> rows directly under <table> 
// into valid HTML by grouping those rows inside a generated <tbody>.
function wrapDirectTableRows(table: HTMLTableElement): void {
  let body: HTMLTableSectionElement | null = null;

  Array.from(table.children).forEach((child) => {

    // Reset the current tbody when another table section interrupts the direct row sequence.
    if (getTagName(child) !== 'tr') {
      body = null;
      return;
    }

    if (!body) {
      body = table.ownerDocument.createElement('tbody');
      table.insertBefore(body, child);
    }

    body.append(child);
  });
}

export function normalizePastedTableImportMetadata(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    normalizeTableCellColwidths(table);
    normalizeTableRowHeights(table);
  });
}

export function normalizePastedTableStructure(root: ParentNode): void {
  // Cells are only valid directly inside table rows.
  root.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
    if (cell.parentElement && getTagName(cell.parentElement) === 'tr') return;

    cell.remove();
  });

   // Rows are only valid under table sections or directly under table before wrapping.
  root.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    const parentTagName = row.parentElement ? getTagName(row.parentElement) : '';
    if (parentTagName !== 'table' && !TABLE_SECTION_TAGS.has(parentTagName)) {
      row.remove();
      return;
    }

    removeInvalidChildren(row, TABLE_CELL_TAGS);

    // Remove rows that no longer contain any valid cells.
    if (!hasDirectChildWithTag(row, TABLE_CELL_TAGS)) row.remove();
  });

  root.querySelectorAll<HTMLTableSectionElement>('thead, tbody, tfoot')
    .forEach((section) => {
      if (!section.parentElement || getTagName(section.parentElement) !== 'table') {
        section.remove();
        return;
      }

      removeInvalidChildren(section, TABLE_ROW_TAGS);

      // Remove sections that no longer contain any valid rows.
      if (!hasDirectChildWithTag(section, TABLE_ROW_TAGS)) section.remove();
    });

  root.querySelectorAll<HTMLTableColElement>('col').forEach((col) => {
    if (col.parentElement && getTagName(col.parentElement) === 'colgroup') return;

    col.remove();
  });

  root.querySelectorAll<HTMLTableColElement>('colgroup').forEach((colgroup) => {
    if (colgroup.parentElement && getTagName(colgroup.parentElement) === 'table') {
      removeInvalidChildren(colgroup, TABLE_COL_TAGS);
      return;
    }

    colgroup.remove();
  });

  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    removeInvalidChildren(table, TABLE_DIRECT_CHILD_TAGS);
    wrapDirectTableRows(table);

    if (!table.querySelector('tr')) table.remove();
  });
}

export function normalizePastedTables(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (!table.querySelector('tr')) {
      table.remove();
      return;
    }

    const width = readTableWidthPercent(table) ?? 100;
    const offset = readTableOffsetPercent(table) ?? 0;
    const clampedOffset = Math.max(0, Math.min(100 - width, offset));

    table.setAttribute('data-table-width-pct', String(width));
    table.setAttribute('data-table-offset-pct', String(clampedOffset));
    table.setAttribute('style', `width: ${width}%; margin-left: ${clampedOffset}%;`);
    table.removeAttribute('width');
  });
}
