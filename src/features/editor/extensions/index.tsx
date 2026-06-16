// features/editor/extensions/index.tsx
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TableKit } from '@tiptap/extension-table';
import Color from '@tiptap/extension-color';
import { TextStyle, FontSize, LineHeight  } from '@tiptap/extension-text-style';
import { tableExtensions } from '../table/extensions';
import FontFamily from "@tiptap/extension-font-family";
import { FontSizeShortcuts } from "./FontSizeShortcuts";
import { contentBlockExtensions } from "../contentBlocks/extensions";
import { BlockSelection } from "./BlockSelection";
import { SlashCommandMenu } from "../slashMenu/SlashMenu";
import { PasteSanitizer } from "./PasteSanitizer";
import {
  ListStyleCommands,
  StyledBulletList,
  StyledOrderedList,
} from "./ListStyles";

export const getEditorExtensions = () => [
  StarterKit.configure({
    bulletList: false,
    heading: {
      levels: [1, 2, 3, 4],
    },
    orderedList: false,
  }),

  StyledBulletList,
  StyledOrderedList,
  ListStyleCommands,
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  FontSizeShortcuts,
  LineHeight ,
  Superscript,
  Subscript,
  TaskList,
  TextAlign.configure({
    types: ['paragraph', 'heading'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
  TaskItem.configure({
    HTMLAttributes: {
      class: 'kb-task-item',
    },
    nested: true,
  }),
  Highlight.configure({
    multicolor: true,
  }),
  PasteSanitizer,
  ...contentBlockExtensions,
  SlashCommandMenu,
  TableKit.configure({
    table: false,
    tableCell: false,
    tableHeader: false,
    tableRow: false,
  }),
  ...tableExtensions,
  BlockSelection,
];
