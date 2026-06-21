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
  'table',
  ...CONTENT_BLOCK_KINDS,
] as const;

export type SlashCommandKind = (typeof SLASH_COMMAND_KINDS)[number];
export type SlashCommandGroup = 'Basic' | 'Lists' | 'Advanced' | 'Callouts';

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
  accordion: ['collapse', 'expand', 'faq'],
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
  if (!normalizedQuery) return [...SLASH_COMMAND_OPTIONS];
  const searchableQuery = normalizedQuery.replace(/^table:\d*x?\d*$/, 'table');

  return SLASH_COMMAND_OPTIONS.map((item, sourceIndex) => {
    const label = item.label.toLowerCase();
    const kind = item.kind.toLowerCase();
    const keywords = item.keywords.map((keyword) => keyword.toLowerCase());
    const values = [label, kind, ...keywords];
    let score = Number.POSITIVE_INFINITY;

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
