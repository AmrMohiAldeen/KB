import StarterKit from '@tiptap/starter-kit';

import {
  ListStyleCommands,
  StyledBulletList,
  StyledOrderedList,
} from './ListStyles';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import { TextDirectionExtension } from './TextDirection';
import { Glossary } from './Glossary';
import { FontSizeShortcuts } from './FontSizeShortcuts';
import { HeadingIds } from './HeadingIds';
import { LegacyHelpJuiceFormatting } from './LegacyHelpJuiceFormatting';
import { SafeFontSize, SafeLineHeight, TypographyStyles } from './TypographyStyles';

import { Youtube } from '@tiptap/extension-youtube';
import { imageExtensions } from '../blocks/image';
import { mediaNodeExtensions } from '../media/MediaNodes';
import {
  MediaContentResolver,
  type MediaContentLoader,
} from '../media/MediaContentResolver';

import { TableOfContentsBlock } from '../blocks/tableOfContents';
import { contentBlockExtensions } from '../blocks';
import { SlashCommandMenu } from '../slashMenu';

import { PasteSanitizer, type PasteSanitizerOptions } from '../paste';

import { TableKit } from '@tiptap/extension-table';
import { tableExtensions } from '../blocks/table';

import { BlockSelection } from './BlockSelection';
import { Selection, CharacterCount } from '@tiptap/extensions';
import {
  PRESERVED_SELECTION_CLASS,
  ReadOnlySelectionHighlight,
} from './ReadOnlySelectionHighlight';
import { Mathematics } from '@tiptap/extension-mathematics';

import {
  createFileHandlerExtension,
  type EditorFileHandlerOptions,
} from './FileHandlerIntegration';
import {
  resolveEditorExtensionFeatureFlags,
  type EditorExtensionFeatureFlags,
} from './editorFeatureFlags';
import {
  CommentAnchors,
  type CommentAnchorsOptions,
} from './CommentAnchors';

export type EditorExtensionOptions = {
  featureFlags?: Partial<EditorExtensionFeatureFlags>;
  fileHandler?: EditorFileHandlerOptions;
  pasteSanitizer?: PasteSanitizerOptions;
  mediaContentLoader?: MediaContentLoader;
  commentAnchors?: Partial<CommentAnchorsOptions>;
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
        levels: [1, 2, 3, 4, 5, 6],
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
    SafeFontSize,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    SafeLineHeight,
    TypographyStyles,
    Superscript,
    Subscript,
    TextAlign.configure({
      alignments: ['left', 'center', 'right', 'justify'],
      types: ['paragraph', 'heading'],
    }),
    TextDirectionExtension,
    LegacyHelpJuiceFormatting,
    HeadingIds,
    Glossary,
    FontSizeShortcuts,

    // media
    Youtube,
    ...imageExtensions,
    ...mediaNodeExtensions,
    MediaContentResolver.configure({
      loadContent: options.mediaContentLoader,
    }),

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
      className: PRESERVED_SELECTION_CLASS,
    }),
    ReadOnlySelectionHighlight.configure({
      className: PRESERVED_SELECTION_CLASS,
    }),
    CommentAnchors.configure(options.commentAnchors),

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
