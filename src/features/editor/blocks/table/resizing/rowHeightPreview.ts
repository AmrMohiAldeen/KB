import { clampRowHeight } from './tableDimensions';

export type RowHeightPreview = {
  id: string;
  rowIndex: number;
  wrapper: HTMLElement;
  styleElement: HTMLStyleElement;
};

let previewSequence = 0;

export function createRowHeightPreview(
  row: HTMLTableRowElement,
): RowHeightPreview | null {
  const table = row.closest('table');
  const wrapper = table?.closest<HTMLElement>('.tableWrapper');
  const rowIndex = table ? Array.from(table.rows).indexOf(row) : -1;
  if (!wrapper || rowIndex < 0) return null;

  const id = String(++previewSequence);
  const styleElement = row.ownerDocument.createElement('style');
  styleElement.dataset.rowHeightPreview = id;
  row.ownerDocument.head.append(styleElement);
  wrapper.dataset.rowHeightPreview = id;

  return {
    id,
    rowIndex,
    wrapper,
    styleElement,
  };
}

export function applyRowHeightPreview(preview: RowHeightPreview, height: number): void {
  const cssHeight = `${clampRowHeight(height)}px`;
  const rowSelector =
    `.tableWrapper[data-row-height-preview="${preview.id}"] ` +
    `> table > tbody > tr:nth-child(${preview.rowIndex + 1})`;

  preview.styleElement.textContent =
    `${rowSelector}, ${rowSelector} > td, ${rowSelector} > th ` +
    `{ height: ${cssHeight} !important; }`;
}

export function restoreRowHeightPreview(preview: RowHeightPreview): void {
  preview.styleElement.remove();
  if (preview.wrapper.dataset.rowHeightPreview === preview.id) {
    delete preview.wrapper.dataset.rowHeightPreview;
  }
}
