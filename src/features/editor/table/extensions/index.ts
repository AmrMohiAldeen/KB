import { Extension } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import { RowResizePlugin } from '../plugins/RowResizePlugin';
import { TableDragHandlePlugin } from '../plugins/TableDragHandlePlugin';
import { TableOuterResizePlugin } from '../plugins/TableOuterResizePlugin';
import {
  TableCellWithRowHeight,
  TableHeaderWithRowHeight,
} from './TableCellExtensions';
import { KnowledgeBaseTable } from './TableExtension';

function createPluginExtension(name: string, createPlugin: () => Plugin) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [createPlugin()];
    },
  });
}

export const tableExtensions = [
  KnowledgeBaseTable.configure({
    resizable: true,
    cellMinWidth: 40,
    lastColumnResizable: false,
  }),
  TableCellWithRowHeight,
  TableHeaderWithRowHeight,
  createPluginExtension('rowResize', RowResizePlugin),
  createPluginExtension('tableOuterResize', TableOuterResizePlugin),
  createPluginExtension('tableDragHandle', TableDragHandlePlugin),
];
