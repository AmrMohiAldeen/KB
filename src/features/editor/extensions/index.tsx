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
import { CharacterCount, Selection } from '@tiptap/extensions';
import { Mathematics } from '@tiptap/extension-mathematics';
import { tableExtensions } from '../table/extensions';
import FontFamily from "@tiptap/extension-font-family";
import { FontSizeShortcuts } from "./FontSizeShortcuts";
import { contentBlockExtensions } from "../contentBlocks/extensions";
import { BlockSelection } from "./BlockSelection";
import { SlashCommandMenu } from "../slashMenu/SlashMenu";
import {Youtube} from '@tiptap/extension-youtube'
import { getHierarchicalIndexes, TableOfContents } from '@tiptap/extension-table-of-contents'
import {
  PasteSanitizer,
  type PasteSanitizerOptions,
} from "./PasteSanitizer";
import {
  ListStyleCommands,
  StyledBulletList,
  StyledOrderedList,
} from "./ListStyles";
import {
  createFileHandlerExtension,
  type EditorFileHandlerOptions,
} from './FileHandlerIntegration';
import {
  resolveEditorExtensionFeatureFlags,
  type EditorExtensionFeatureFlags,
} from './editorFeatureFlags';
import { TableOfContentsBlock } from "./TableOfContentsBlock";
import Image from '@tiptap/extension-image'
export type EditorExtensionOptions = {
  featureFlags?: Partial<EditorExtensionFeatureFlags>;
  fileHandler?: EditorFileHandlerOptions;
  pasteSanitizer?: PasteSanitizerOptions;
};

export const getEditorExtensions = (options: EditorExtensionOptions = {}) => {
  const featureFlags = resolveEditorExtensionFeatureFlags(options.featureFlags);
  
  return [
    StarterKit.configure({
    bulletList: false,
    heading: {
      levels: [1, 2, 3, 4],
    },
    orderedList: false,
    }),
    TableOfContents.configure({
      anchorTypes: ["heading"],
      getIndex: getHierarchicalIndexes,
    }),

    TableOfContentsBlock,
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
    Youtube,
    Image,
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
    PasteSanitizer.configure(options.pasteSanitizer),
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
    ...(featureFlags.selection
      ? [
          Selection.configure({
            className: 'kb-preserved-selection',
          }),
        ]
      : []),
    ...(featureFlags.characterCount
      ? [
          CharacterCount.configure({
            limit: null,
          }),
        ]
      : []),
    ...(featureFlags.mathematics
      ? [
          Mathematics.configure({
            katexOptions: {
              throwOnError: false,
            },
          }),
        ]
      : []),
    ...(featureFlags.fileHandler
      ? createFileHandlerExtension(options.fileHandler)
      : []),
  ];
};
