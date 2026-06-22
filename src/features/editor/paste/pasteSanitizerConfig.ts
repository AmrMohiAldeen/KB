export const MAX_PASTED_HTML_LENGTH = 1_000_000;
export const MAX_PASTED_NODE_COUNT = 20_000;
export const MAX_SANITIZE_DEPTH = 80;

// Raw pasted media and embedded content is intentionally removed here.
// Approved media must go through the backend upload flow and be inserted as
// safe media references instead of stored as pasted HTML, URLs, or base64 data.
export const DROP_WITH_CONTENT = new Set([
  'applet',
  'area',
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'iframe',
  'img',
  'input',
  'link',
  'map',
  'math',
  'meta',
  'noscript',
  'object',
  'option',
  'picture',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'textarea',
  'title',
  'track',
  'video',
  'xml',
]);

export const ALLOWED_TAGS = new Set([
  'a',
  'aside',
  'blockquote',
  'br',
  'code',
  'col',
  'colgroup',
  'del',
  'details',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'section',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

export const INLINE_TAGS = new Set([
  'a',
  'br',
  'code',
  'del',
  'em',
  'mark',
  's',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
]);

export const BLOCK_LIKE_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

export const GENERIC_WRAPPER_TAGS = new Set([
  'address',
  'article',
  'aside',
  'center',
  'div',
  'figcaption',
  'figure',
  'footer',
  'header',
  'main',
  'nav',
  'section',
]);

export const EMPTY_ELEMENT_TAGS = new Set([
  'a',
  'del',
  'em',
  'mark',
  's',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
]);

export const ORDERED_LIST_STYLES = new Set([
  'decimal',
  'lower-alpha',
  'lower-roman',
  'upper-alpha',
  'upper-roman',
]);

export const BULLET_LIST_STYLES = new Set(['circle', 'disc', 'square']);

export const CELL_TEXT_ALIGN_VALUES = new Set(['center', 'left', 'right']);
export const BLOCK_TEXT_ALIGN_VALUES = new Set([
  'center',
  'justify',
  'left',
  'right',
]);
export const TEXT_ALIGN_STYLE_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'td',
  'th',
]);
export const TEXT_DECORATION_FORMATTING_TAGS = new Set([
  'del',
  's',
  'strike',
  'u',
]);
export const TABLE_CELL_TAGS = new Set(['td', 'th']);
export const TABLE_COL_TAGS = new Set(['col']);
export const TABLE_ROW_TAGS = new Set(['tr']);
export const TABLE_SECTION_TAGS = new Set(['tbody', 'tfoot', 'thead']);
export const TABLE_DIRECT_CHILD_TAGS = new Set([
  'colgroup',
  'tbody',
  'tfoot',
  'thead',
  'tr',
]);

export const DIV_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-accordion',
  'data-kb-accordion-panel',
  'data-kb-callout-content',
  'data-kb-tab-panel',
  'data-kb-tabs',
]);

export const SECTION_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-tab-id',
  'data-kb-tab-item',
  'data-kb-tab-label',
]);

export const DETAILS_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-accordion-id',
  'data-kb-accordion-item',
  'data-kb-accordion-title',
]);

export const TABLE_BORDER_ATTRIBUTES = [
  'data-table-border-top',
  'data-table-border-right',
  'data-table-border-bottom',
  'data-table-border-left',
  'data-table-border-inner',
] as const;

export const ALLOWED_EXPLICIT_URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

export const LEGACY_FONT_SIZE_MAP = {
  '1': '10px',
  '2': '13px',
  '3': '16px',
  '4': '18px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
} as const;

export const LOOSE_INLINE_CONTAINER_SELECTOR =
  'blockquote, li, td, th, [data-kb-callout-content], [data-kb-tab-panel], [data-kb-accordion-panel]';

// Detects dangerous CSS values such as url(), script/data protocols, @import,
// legacy CSS execution hooks, and dynamic functions like var() or calc().
export const CSS_DANGER_PATTERN =
  /(?:url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:|@import|-moz-binding|behavior\s*:|var\s*\(|calc\s*\()/i;
