import StarterKit from '@tiptap/starter-kit';

import {
  ListStyleCommands,
  StyledBulletList,
  StyledOrderedList,
} from './ListStyles';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

import { TextStyle, FontSize, LineHeight } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import { FontSizeShortcuts } from './FontSizeShortcuts';

import { Youtube } from '@tiptap/extension-youtube';
import { imageExtensions } from '../blocks/image';

import { TableOfContentsBlock } from '../blocks/tableOfContents';
import { contentBlockExtensions } from '../blocks';
import { SlashCommandMenu } from '../slashMenu';

import { PasteSanitizer, type PasteSanitizerOptions } from '../paste';

import { TableKit } from '@tiptap/extension-table';
import { tableExtensions } from '../blocks/table';

import { BlockSelection } from './BlockSelection';
import { Selection, CharacterCount } from '@tiptap/extensions';
import { Mathematics } from '@tiptap/extension-mathematics';

import {
  createFileHandlerExtension,
  type EditorFileHandlerOptions,
} from './FileHandlerIntegration';
import {
  resolveEditorExtensionFeatureFlags,
  type EditorExtensionFeatureFlags,
} from './editorFeatureFlags';

export type EditorExtensionOptions = {
  featureFlags?: Partial<EditorExtensionFeatureFlags>;
  fileHandler?: EditorFileHandlerOptions;
  pasteSanitizer?: PasteSanitizerOptions;
};

export const getEditorExtensions = (options: EditorExtensionOptions = {}) => {
  const featureFlags = resolveEditorExtensionFeatureFlags(options.featureFlags);

  return [

    /*
    Starterkit includes the following extensions: 
    Nodes:
      - BulletList & OrderedList (disabled here bcz we added custom nested lists)
      - Blockquote, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, Paragraph, Text

    Marks:
        Bold, Code, Italic, Link, Strike, Underline

    Extensions:
        Dropcursor
        Gapcursor
        Undo/Redo
        ListKeymap
        TrailingNode 
    */

    StarterKit.configure({
      bulletList: false,
      heading: {
        levels: [1, 2, 3, 4],
      },
      orderedList: false,
    }),

    // Lists
    StyledBulletList,
    StyledOrderedList,
    ListStyleCommands,
    TaskList,
    TaskItem.configure({
      HTMLAttributes: {
        class: 'kb-task-item',
      },
      nested: true,
    }),
    
    // Text styling/marks
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    LineHeight,
    Superscript,
    Subscript,
    TextAlign.configure({
      alignments: ['left', 'center', 'right', 'justify'],
      types: ['paragraph', 'heading'],
    }),
    FontSizeShortcuts,

    // media
    Youtube,
    ...imageExtensions,

    // block/content components
    TableOfContentsBlock,
    ...contentBlockExtensions,
    SlashCommandMenu,

    //past helpers
    PasteSanitizer.configure(options.pasteSanitizer),

    // tables
    TableKit.configure({
      table: false,
      tableCell: false,
      tableHeader: false,
      tableRow: false,
    }),
    ...tableExtensions,

    // selection
    BlockSelection,
    Selection.configure({
      className: 'kb-preserved-selection',
    }),

    CharacterCount.configure({
      limit: null,
    }),
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
      },
    }),

    //optional feature-flag extensions
    ...(featureFlags.fileHandler
      ? createFileHandlerExtension(options.fileHandler)
      : []),
  ];
};