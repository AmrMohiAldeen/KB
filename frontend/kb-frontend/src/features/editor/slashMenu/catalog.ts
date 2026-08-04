import {
  CONTENT_BLOCK_KINDS,
  CONTENT_BLOCK_OPTIONS,
  type ContentBlockKind,
} from '../blocks/catalog';

export const SLASH_COMMAND_KINDS = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'bullet-list',
  'ordered-list',
  'task-list',
  'blockquote',
  'code-block',
  'horizontal-rule',
  'glossary',
  'table',
  'upload-image',
  'upload-video',
  'upload-attachment',
  'media-library',
  'youtube',
  ...CONTENT_BLOCK_KINDS, // tabs, accordions and callouts
] as const;

export type SlashCommandKind = (typeof SLASH_COMMAND_KINDS)[number];
export type SlashCommandGroup = 'Basic' | 'Lists' | 'Advanced' | 'Media' | 'Callouts';

export type SlashCommandOption = {
  description: string;
  group: SlashCommandGroup;
  keywords: readonly string[];
  kind: SlashCommandKind;
  label: string;
  shortcut?: string;
};

const CONTENT_BLOCK_GROUPS: Record<ContentBlockKind, SlashCommandGroup> = {
  tabs: 'Advanced',
  accordion: 'Advanced',
  'callout-info': 'Callouts',
  'callout-warning': 'Callouts',
  'callout-success': 'Callouts',
  'callout-danger': 'Callouts',
  'callout-tip': 'Callouts',
};

const CONTENT_BLOCK_KEYWORDS: Record<ContentBlockKind, readonly string[]> = {
  tabs: ['panel', 'switcher'],
  accordion: ['collapse', 'expand', 'faq', 'details'],
  'callout-info': ['notice', 'note', 'info'],
  'callout-warning': ['notice', 'caution', 'warning'],
  'callout-success': ['notice', 'success', 'positive'],
  'callout-danger': ['notice', 'danger', 'error', 'critical'],
  'callout-tip': ['notice', 'tip', 'hint'],
};

export const SLASH_COMMAND_OPTIONS: readonly SlashCommandOption[] = [
  {
    kind: 'paragraph',
    label: 'Text',
    description: 'Start a plain paragraph',
    group: 'Basic',
    keywords: ['paragraph', 'body'],
  },
  {
    kind: 'heading-1',
    label: 'Heading 1',
    description: 'Large section heading',
    group: 'Basic',
    keywords: ['h1', 'title'],
    shortcut: 'Ctrl+Alt+1',
  },
  {
    kind: 'heading-2',
    label: 'Heading 2',
    description: 'Medium section heading',
    group: 'Basic',
    keywords: ['h2', 'subtitle'],
    shortcut: 'Ctrl+Alt+2',
  },
  {
    kind: 'heading-3',
    label: 'Heading 3',
    description: 'Small section heading',
    group: 'Basic',
    keywords: ['h3', 'subtitle'],
    shortcut: 'Ctrl+Alt+3',
  },
  {
    kind: 'blockquote',
    label: 'Blockquote',
    description: 'Highlight a quotation',
    group: 'Basic',
    keywords: ['quote'],
  },
  {
    kind: 'horizontal-rule',
    label: 'Divider',
    description: 'Separate sections visually',
    group: 'Basic',
    keywords: ['rule', 'separator', 'hr'],
  },
  {
    kind: 'glossary',
    label: 'Glossary term',
    description: 'Define an inline article term',
    group: 'Advanced',
    keywords: ['definition', 'term', 'tooltip'],
  },
  {
    kind: 'bullet-list',
    label: 'Bullet list',
    description: 'Create an unordered list',
    group: 'Lists',
    keywords: ['ul', 'unordered'],
    shortcut: 'Ctrl+Shift+8',
  },
  {
    kind: 'ordered-list',
    label: 'Numbered list',
    description: 'Create an ordered list',
    group: 'Lists',
    keywords: ['ol', 'numbered'],
    shortcut: 'Ctrl+Shift+7',
  },
  {
    kind: 'task-list',
    label: 'Task list',
    description: 'Create a checklist',
    group: 'Lists',
    keywords: ['checklist', 'todo'],
  },
  {
    kind: 'code-block',
    label: 'Code block',
    description: 'Insert a formatted code block',
    group: 'Advanced',
    keywords: ['code', 'pre'],
    shortcut: 'Ctrl+Alt+C',
  },
  {
    kind: 'table',
    label: 'Table',
    description: 'Insert a 3 by 3 table',
    group: 'Advanced',
    keywords: ['grid', 'rows', 'columns'],
  },
  {
    kind: 'upload-image',
    label: 'Upload image or GIF',
    description: 'Upload and insert an image',
    group: 'Media',
    keywords: ['image', 'gif', 'photo', 'media'],
  },
  {
    kind: 'upload-video',
    label: 'Upload video',
    description: 'Upload and insert a video',
    group: 'Media',
    keywords: ['video', 'movie', 'media'],
  },
  {
    kind: 'upload-attachment',
    label: 'Upload attachment',
    description: 'Upload a PDF or document',
    group: 'Media',
    keywords: ['file', 'pdf', 'document', 'media'],
  },
  {
    kind: 'media-library',
    label: 'Media library',
    description: 'Insert a previously uploaded file',
    group: 'Media',
    keywords: ['existing', 'select', 'file'],
  },
  {
    kind: 'youtube',
    label: 'YouTube video',
    description: 'Insert an approved YouTube link',
    group: 'Media',
    keywords: ['external', 'embed', 'video'],
  },
  ...CONTENT_BLOCK_OPTIONS.map((item) => ({
    ...item,
    group: CONTENT_BLOCK_GROUPS[item.kind],
    keywords: CONTENT_BLOCK_KEYWORDS[item.kind],
  })),
];

export function isContentBlockKind(
  kind: SlashCommandKind,
): kind is ContentBlockKind {
  return CONTENT_BLOCK_KINDS.some((candidate) => candidate === kind);
}

export function getMatchingSlashCommands(query: string): SlashCommandOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  // If the user has not typed anything after "/", show all commands
  if (!normalizedQuery) return [...SLASH_COMMAND_OPTIONS];

  // treat any valid table dimension query as just "table"
  const searchableQuery = normalizedQuery.replace(/^table:\d*x?\d*$/, 'table');

  return SLASH_COMMAND_OPTIONS.map((item, sourceIndex) => {
    // Convert all searchable fields to lowercase once so every comparison
    // uses the same normalized format.
    const label = item.label.toLowerCase();
    const kind = item.kind.toLowerCase();
    const keywords = item.keywords.map((keyword) => keyword.toLowerCase());

    // These are all the values that can match the user's query.
    const values = [label, kind, ...keywords];

    // Infinity means "not matched yet".
    let score = Number.POSITIVE_INFINITY;

    // Score priority:
    // 0 = exact match, best result
    // 1 = label starts with query
    // 2 = command kind starts with query
    // 3 = keyword starts with query
    // 4 = query appears anywhere in label/kind/keywords
    if (values.some((value) => value === searchableQuery)) score = 0;
    else if (label.startsWith(searchableQuery)) score = 1 + label.length / 100;
    else if (kind.startsWith(searchableQuery)) score = 2 + kind.length / 100;
    else if (keywords.some((keyword) => keyword.startsWith(searchableQuery))) {
      score = 3;
    } else if (values.some((value) => value.includes(searchableQuery))) {
      score = 4;
    }

    return { item, score, sourceIndex };
  })
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => left.score - right.score || left.sourceIndex - right.sourceIndex)
    .map(({ item }) => item);
}
