import type { Attribute } from '@tiptap/core';
import { TableRow } from '@tiptap/extension-table';
import { normalizeRowHeight } from '../resizing/tableDimensions';

function readLegacyCellRowHeight(row: HTMLElement): number | null {
  const cell = row.querySelector<HTMLElement>(':scope > td, :scope > th');
  return normalizeRowHeight(
    cell?.getAttribute('data-row-height') ?? cell?.style.height,
  );
}

// Created rowheightAttribute to allow row resizing 
const rowHeightAttribute: Attribute = {
  default: null,
  parseHTML: (element) =>
    normalizeRowHeight(
      element.getAttribute('data-row-height') ?? element.style.height,
    ) ?? readLegacyCellRowHeight(element),
  renderHTML: (attributes) => {
    const rowHeight = normalizeRowHeight(attributes.rowHeight);
    return rowHeight == null
      ? {}
      : {
          'data-row-height': String(rowHeight),
          style: `height: ${rowHeight}px;`,
        };
  },
};

// Added rowHeight attribute to TableRow 
export const KnowledgeBaseTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});
