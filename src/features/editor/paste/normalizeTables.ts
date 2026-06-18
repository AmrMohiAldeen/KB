import {
  TABLE_CELL_TAGS,
  TABLE_COL_TAGS,
  TABLE_DIRECT_CHILD_TAGS,
  TABLE_ROW_TAGS,
  TABLE_SECTION_TAGS,
} from './pasteSanitizerConfig';
import { getTagName, isElementNode, removeNode } from './domUtils';
import type { PercentReadOptions } from './pasteSanitizerTypes';

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

function wrapDirectTableRows(table: HTMLTableElement): void {
  let body: HTMLTableSectionElement | null = null;

  Array.from(table.children).forEach((child) => {
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

export function normalizePastedTableStructure(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
    if (cell.parentElement && getTagName(cell.parentElement) === 'tr') return;

    cell.remove();
  });

  root.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    const parentTagName = row.parentElement ? getTagName(row.parentElement) : '';
    if (parentTagName !== 'table' && !TABLE_SECTION_TAGS.has(parentTagName)) {
      row.remove();
      return;
    }

    removeInvalidChildren(row, TABLE_CELL_TAGS);
    if (!hasDirectChildWithTag(row, TABLE_CELL_TAGS)) row.remove();
  });

  root.querySelectorAll<HTMLTableSectionElement>('thead, tbody, tfoot')
    .forEach((section) => {
      if (!section.parentElement || getTagName(section.parentElement) !== 'table') {
        section.remove();
        return;
      }

      removeInvalidChildren(section, TABLE_ROW_TAGS);
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
