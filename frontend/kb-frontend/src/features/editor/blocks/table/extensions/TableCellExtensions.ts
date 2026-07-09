import type { Attribute } from '@tiptap/core';
import { TableCell, TableHeader } from '@tiptap/extension-table';
import { normalizeRowHeight } from '../resizing/tableDimensions';
import { cellDefaultMarksAttribute } from './TableCellFormatting';

// Kept only so older JSON/HTML can be migrated to the tableRow attribute.
const legacyRowHeightAttribute: Attribute = {
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

const backgroundColorAttribute: Attribute = {
  default: null,
  parseHTML: (element) =>
    element.getAttribute('data-cell-background-color') ??
    element.style.backgroundColor ??
    null,
  renderHTML: (attributes) => {
    const backgroundColor =
      typeof attributes.backgroundColor === 'string'
        ? attributes.backgroundColor.trim()
        : '';
    return backgroundColor
      ? {
          'data-cell-background-color': backgroundColor,
          style: `background-color: ${backgroundColor};`,
        }
      : {};
  },
};

// Added the following attributes to cells:
// rowHeight: in old browsers formatting row height on <tr> can lead to unexpected behavior 
// backgroundColor
// defaultMarks: to allow formatting empty cells (text written later will have this formatting) 
const cellAttributes = () => ({
  rowHeight: legacyRowHeightAttribute,
  backgroundColor: backgroundColorAttribute,
  defaultMarks: cellDefaultMarksAttribute,
});

export const KnowledgeBaseTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellAttributes(),
    };
  },
});

export const KnowledgeBaseTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellAttributes(),
    };
  },
});
