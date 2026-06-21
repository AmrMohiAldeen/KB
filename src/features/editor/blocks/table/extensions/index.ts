import { Extension } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import { RowResizePlugin } from '../plugins/RowResizePlugin';
import { TableOuterResizePlugin } from '../plugins/TableOuterResizePlugin';
import {
  KnowledgeBaseTableCell,
  KnowledgeBaseTableHeader,
} from './TableCellExtensions';
import { KnowledgeBaseTable } from './TableExtension';
import { KnowledgeBaseTableRow } from './TableRowExtension';
import { TableCellFormatting } from './TableCellFormatting';

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
  KnowledgeBaseTableRow,
  KnowledgeBaseTableCell,
  KnowledgeBaseTableHeader,
  TableCellFormatting,
  createPluginExtension('rowResize', RowResizePlugin),
  createPluginExtension('tableOuterResize', TableOuterResizePlugin),
];
