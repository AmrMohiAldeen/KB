// features/editor/extensions/index.tsx
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TableKit } from '@tiptap/extension-table';
import {
  RowResizeExtension,
  TableCellRowHeight,
  TableDragHandleExtension,
  TableHeaderRowHeight,
  TableOuterResizeExtension,
} from './table/TableExtensions';
import { TableWidthPct } from './table/TableWidthPct';
// Future imports: import Accordion from './AccordionExtension';

export const getEditorExtensions = () => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4],
    },
  }),
  TextAlign.configure({
    types: ['paragraph', 'heading'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Highlight,
  Superscript,
  Subscript,
  TableKit.configure({
    table: false,
    tableCell: false,
    tableHeader: false,
  }),
  TableWidthPct.configure({
    resizable: true,
    cellMinWidth: 40,
    lastColumnResizable: false,
  }),
  TableCellRowHeight,
  TableHeaderRowHeight,
  RowResizeExtension,
  TableOuterResizeExtension,
  TableDragHandleExtension,
];

