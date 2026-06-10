// extensions/table/TableExtensions.ts
import { Extension } from '@tiptap/core';
import { RowResizePlugin } from './rowResize/RowResizePlugin';
import { TableOuterResizePlugin } from './outerResize/TableOuterResizePlugin';
import { TableDragHandlePlugin } from './dragHandle/TableDragHandlePlugin';
import { TableCell, TableHeader } from '@tiptap/extension-table';
import { rowHeightAttribute } from './TableRowHeightAttribute';

export const RowResizeExtension = Extension.create({
  name: 'rowResize',
  addProseMirrorPlugins() {
    return [RowResizePlugin()];
  },
});

export const TableOuterResizeExtension = Extension.create({
  name: 'tableOuterResize',
  addProseMirrorPlugins() {
    return [TableOuterResizePlugin()];
  },
});

export const TableDragHandleExtension = Extension.create({
  name: 'tableDragHandle',
  addProseMirrorPlugins() {
    return [TableDragHandlePlugin()];
  },
});

export const TableCellRowHeight = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});
    
export const TableHeaderRowHeight = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});