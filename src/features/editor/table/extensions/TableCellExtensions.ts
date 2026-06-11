import type { Attribute } from '@tiptap/core';
import { TableCell, TableHeader } from '@tiptap/extension-table';
import { normalizeRowHeight } from '../resizing/tableDimensions';

const rowHeightAttribute: Attribute = {
  default: null,
  parseHTML: (element) => normalizeRowHeight(element.getAttribute('data-row-height')),
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

export const TableCellWithRowHeight = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});

export const TableHeaderWithRowHeight = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});
