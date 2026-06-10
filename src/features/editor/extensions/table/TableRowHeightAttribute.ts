// extensions/table/TableRowHeightAttribute.ts

import { Attribute } from '@tiptap/core';

 export const rowHeightAttribute: Attribute = {
  default: null,
  parseHTML: (element) => {
    const v = element.getAttribute('data-row-height');
    return v ? Number(v) : null;
  },
  renderHTML: (attrs) => {
    if (!attrs.rowHeight) return {};
    return {
      'data-row-height': String(attrs.rowHeight),
      style: `height: ${attrs.rowHeight}px;`,
    };
  },
};

