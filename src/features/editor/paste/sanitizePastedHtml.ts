import { normalizeCalloutVariant } from '../contentBlocks/callout/model';
import { normalizeLinkUrl } from '../components/linkUrl';
import { logDevError } from '../utils/logDevError';

type ListTagName = 'ol' | 'ul';

type SanitizedUrl =
  | { ok: true; url: string }
  | { ok: false };

type WordListContext = {
  lastItem: HTMLLIElement | null;
  level: number;
  list: HTMLOListElement | HTMLUListElement;
  tagName: ListTagName;
};

const MAX_PASTED_HTML_LENGTH = 1_000_000;
const MAX_PASTED_NODE_COUNT = 20_000;
const MAX_SANITIZE_DEPTH = 80;

// Raw pasted media and embedded content is intentionally removed here.
// Approved media must go through the backend upload flow and be inserted as
// safe media references instead of stored as pasted HTML, URLs, or base64 data.
const DROP_WITH_CONTENT = new Set([
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

const ALLOWED_TAGS = new Set([
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

const INLINE_TAGS = new Set([
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

const BLOCK_LIKE_TAGS = new Set([
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

const GENERIC_WRAPPER_TAGS = new Set([
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

const EMPTY_ELEMENT_TAGS = new Set([
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

const ORDERED_LIST_STYLES = new Set([
  'decimal',
  'lower-alpha',
  'lower-roman',
  'upper-alpha',
  'upper-roman',
]);

const BULLET_LIST_STYLES = new Set(['circle', 'disc', 'square']);

const CELL_TEXT_ALIGN_VALUES = new Set(['center', 'left', 'right']);
const BLOCK_TEXT_ALIGN_VALUES = new Set(['center', 'justify', 'left', 'right']);
const TEXT_ALIGN_STYLE_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'td', 'th']);
const TEXT_DECORATION_FORMATTING_TAGS = new Set(['del', 's', 'strike', 'u']);

const DIV_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-accordion',
  'data-kb-accordion-panel',
  'data-kb-callout-content',
  'data-kb-tab-panel',
  'data-kb-tabs',
]);

const SECTION_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-tab-id',
  'data-kb-tab-item',
  'data-kb-tab-label',
]);

const DETAILS_KB_ATTRIBUTE_NAMES = new Set<string>([
  'data-kb-accordion-id',
  'data-kb-accordion-item',
  'data-kb-accordion-title',
]);

const TABLE_BORDER_ATTRIBUTES = [
  'data-table-border-top',
  'data-table-border-right',
  'data-table-border-bottom',
  'data-table-border-left',
  'data-table-border-inner',
] as const;

const ALLOWED_EXPLICIT_URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

const LEGACY_FONT_SIZE_MAP = {
  '1': '10px',
  '2': '13px',
  '3': '16px',
  '4': '18px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
} as const;

const LOOSE_INLINE_CONTAINER_SELECTOR =
  'blockquote, li, td, th, [data-kb-callout-content], [data-kb-tab-panel], [data-kb-accordion-panel]';

// Detects dangerous CSS values such as url(), script/data protocols, @import,
// legacy CSS execution hooks, and dynamic functions like var() or calc().
const CSS_DANGER_PATTERN =
  /(?:url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:|@import|-moz-binding|behavior\s*:|var\s*\(|calc\s*\()/i;

function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function getTagName(element: Element): string {
  return element.tagName.toLowerCase();
}

function removeComments(root: ParentNode): void {
  // Get the browser's NodeFilter object.
  const nodeFilter =
    root.ownerDocument?.defaultView?.NodeFilter ?? globalThis.NodeFilter;
  const walker = root.ownerDocument?.createTreeWalker(
    root, // starts from root 
    nodeFilter.SHOW_COMMENT, // looks only for nodeFilter.SHOW_COMMENT
  );
  if (!walker) return;

  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((comment) => comment.remove());
}

// Remove element, but keep its children in the same place.
function unwrapElement(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function removeNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

function hasAcceptableNodeCount(root: Node): boolean {
  let count = 0;
  const stack = Array.from(root.childNodes);

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    count += 1;
    if (count > MAX_PASTED_NODE_COUNT) return false;

    stack.push(...Array.from(node.childNodes));
  }

  return true;
}

function pruneNodesExceedingMaxDepth(root: Node): void {
  const stack = Array.from(root.childNodes).map((node) => ({
    depth: 1,
    node,
  }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.depth > MAX_SANITIZE_DEPTH) {
      removeNode(current.node);
      continue;
    }

    Array.from(current.node.childNodes).forEach((child) => {
      stack.push({ depth: current.depth + 1, node: child });
    });
  }
}

// changes an element’s tag name while keeping its attributes and children.
function replaceElementTag<TTagName extends keyof HTMLElementTagNameMap>(
  element: HTMLElement,
  tagName: TTagName,
): HTMLElementTagNameMap[TTagName] {
  const replacement = element.ownerDocument.createElement(tagName);

  // copies the attributes from old element to new element
  Array.from(element.attributes).forEach((attribute) => {
    replacement.setAttribute(attribute.name, attribute.value);
  });

  // moves the children from old element to new element 
  while (element.firstChild) replacement.append(element.firstChild);
  element.replaceWith(replacement);

  return replacement;
}

function hasOnlyPhrasingContent(element: HTMLElement): boolean {
  return Array.from(element.childNodes).every((child) => {
    if (isTextNode(child)) return true;
    if (!isElementNode(child)) return false;

    const tagName = getTagName(child);

    // child is allowed if either it is an inline tag, or not a block-like tag
    return INLINE_TAGS.has(tagName) || !BLOCK_LIKE_TAGS.has(tagName);
  });
}

// Checks whether this element contains at least one sanitizer-approved attribute.
function hasAllowedKbAttribute(element: HTMLElement): boolean {
  return Array.from(element.attributes).some((attribute) =>
    isAllowedKbAttribute(getTagName(element), attribute.name.toLowerCase()),
  );
}

function normalizeTextNode(textNode: Text): void {
  const parent = textNode.parentElement;
  if (parent?.closest('pre, code')) {
    textNode.textContent = textNode.textContent?.replace(/\r\n?/g, '\n') ?? '';
    return;
  }

  textNode.textContent =
    textNode.textContent?.replace(/\u00a0/g, ' ').replace(/[\t\r\n ]+/g, ' ') ??
    '';
}

function removeLeadingWhitespace(node: Node): void {
  if (isTextNode(node)) {
    node.textContent = node.textContent?.replace(/^[\s\u00a0]+/, '') ?? '';
    return;
  }

  const firstChild = node.firstChild;
  if (firstChild) removeLeadingWhitespace(firstChild);
}

// Extracts the Word list level from the style; defaults to level 1 when missing
// and caps levels above 8 to keep nesting within the supported range.
function readWordListLevel(paragraph: HTMLElement): number {
  const style = paragraph.getAttribute('style') ?? '';
  const match = style.match(/\bmso-list:[^;]*\blevel(\d+)/i);
  const level = match ? Number(match[1]) : 1;

  return Number.isFinite(level) ? Math.max(1, Math.min(8, level)) : 1;
}

function readWordListTag(paragraph: HTMLElement): ListTagName {
  const marker = Array.from(paragraph.querySelectorAll('span')).find((span) =>
    /mso-list:\s*Ignore/i.test(span.getAttribute('style') ?? ''),
  );
  const markerText = marker?.textContent ?? paragraph.textContent ?? '';

  // if markerText looks like "1." or "a)" or "iv." return "ol";
  return /^\s*(?:\d+|[a-z]+|[ivxlcdm]+)[.)]/i.test(markerText) ? 'ol' : 'ul';
}

function removeWordListMarker(paragraph: HTMLElement): void {
  Array.from(paragraph.querySelectorAll('span'))
    .find((span) => /mso-list:\s*Ignore/i.test(span.getAttribute('style') ?? ''))
    ?.remove();
}

// checks if the element is a Microsoft Word style list paragraph
function isWordListParagraph(element: Element): element is HTMLParagraphElement {
  if (getTagName(element) !== 'p') return false;

  const className = element.getAttribute('class') ?? '';
  const style = element.getAttribute('style') ?? '';

  // returns true if class has bMsoListParagraph, or style contains mso-list
  return /\bMsoListParagraph\w*\b/i.test(className) || /mso-list:/i.test(style);
}

// Converts Microsoft Word-style pasted list paragraphs into normalized list markup.
function convertWordListParagraphs(container: ParentNode): void {
  // Keeps track of the currently open Word lists at each nesting level.
  let stack: WordListContext[] = [];

  Array.from(container.children).forEach((child) => {
    if (!isWordListParagraph(child)) {
      convertWordListParagraphs(child);
      stack = [];
      return;
    }

    const requestedLevel = readWordListLevel(child);
    const level = Math.min(requestedLevel, stack.length + 1);
    const tagName = readWordListTag(child); // ol or ul
    removeWordListMarker(child);

    stack = stack.filter((context) => context.level <= level);

    // Reuse the current list only if the last active list is at the same level.
    let current = stack[stack.length - 1]?.level === level ? stack[stack.length - 1] : null;

    if (!current || current.tagName !== tagName) {
      const list = child.ownerDocument.createElement(tagName);
      const parentContext = stack.find((context) => context.level === level - 1);

      if (parentContext?.lastItem) {
        parentContext.lastItem.append(list);
      } else {
        child.before(list);
      }

      current = { lastItem: null, level, list, tagName };
      stack = stack.filter((context) => context.level < level);
      stack.push(current);
    }

    const item = child.ownerDocument.createElement('li');
    while (child.firstChild) item.append(child.firstChild);
    removeLeadingWhitespace(item);
    current.list.append(item);
    current.lastItem = item;
    child.remove();
  });
}

// Replaces Apple paste-generated space wrappers like
// <span class="Apple-converted-space">&nbsp;</span>
// with normal text spaces, so pasted content keeps spacing without storing
// unnecessary Apple-specific markup.
function normalizeAppleConvertedSpaces(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.Apple-converted-space').forEach((span) => {
    span.replaceWith(
      span.ownerDocument.createTextNode(
        // \u00a0 means the Unicode character for &nbsp;
        (span.textContent || ' ').replace(/\u00a0/g, ' '),
      ),
    );
  });
}

function isDangerousCssValue(value: string): boolean {
  return CSS_DANGER_PATTERN.test(value.replace(/\/\*[\s\S]*?\*\//g, ''));
}

function sanitizeCssColor(
  document: Document,
  value: string,
  options: { allowTransparent?: boolean } = {},
): string | null {
  const trimmed = value.trim().replace(/['"]/g, '');
  if (!trimmed || isDangerousCssValue(trimmed)) return null;
  if (/^(?:inherit|initial|revert|unset|currentcolor)$/i.test(trimmed)) return null;
  if (!options.allowTransparent && /^transparent$/i.test(trimmed)) return null;

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = trimmed;

  return probe.style.color || null;
}

function sanitizeFontSize(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (isDangerousCssValue(trimmed)) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;

  const inRange =
    (unit === 'px' && amount >= 8 && amount <= 48) ||
    (unit === 'pt' && amount >= 6 && amount <= 36) ||
    ((unit === 'em' || unit === 'rem') && amount >= 0.5 && amount <= 3) ||
    (unit === '%' && amount >= 50 && amount <= 300);

  return inRange ? `${amount}${unit}` : null;
}

function sanitizeLineHeight(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'normal') return trimmed;
  if (isDangerousCssValue(trimmed)) return null;

  const unitless = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (unitless) {
    const amount = Number(unitless[1]);
    return amount >= 1 && amount <= 3 ? String(amount) : null;
  }

  const length = trimmed.match(/^(\d+(?:\.\d+)?)(px|%)$/);
  if (!length) return null;

  const amount = Number(length[1]);
  const unit = length[2];
  const inRange =
    (unit === 'px' && amount >= 12 && amount <= 72) ||
    (unit === '%' && amount >= 80 && amount <= 300);

  return inRange ? `${amount}${unit}` : null;
}

function sanitizeFontWeight(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^(?:bold|bolder)$/.test(trimmed)) return trimmed;
  if (/^[5-9]00$/.test(trimmed)) return trimmed;

  return null;
}

function sanitizeTextDecoration(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (isDangerousCssValue(trimmed)) return null;

  const hasUnderline = /\bunderline\b/.test(trimmed);
  const hasLineThrough = /\bline-through\b/.test(trimmed);
  const values: string[] = [];

  if (hasUnderline) values.push('underline');
  if (hasLineThrough) values.push('line-through');

  return values.length > 0 ? values.join(' ') : null;
}

function sanitizeTextAlign(value: string, element: HTMLElement): string | null {
  const trimmed = value.trim().toLowerCase();
  const tagName = getTagName(element);

  if (tagName === 'td' || tagName === 'th') {
    return CELL_TEXT_ALIGN_VALUES.has(trimmed) ? trimmed : null;
  }

  return BLOCK_TEXT_ALIGN_VALUES.has(trimmed) ? trimmed : null;
}

function sanitizeListStyleType(value: string, element: HTMLElement): string | null {
  const trimmed = value.trim().toLowerCase();
  const tagName = getTagName(element);

  if (tagName === 'ol') {
    return ORDERED_LIST_STYLES.has(trimmed) ? trimmed : null;
  }

  if (tagName === 'ul') {
    return BULLET_LIST_STYLES.has(trimmed) ? trimmed : null;
  }

  return null;
}

function sanitizePercentStyle(value: string): string | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100
    ? `${amount}%`
    : null;
}

function sanitizeStyleProperty(
  element: HTMLElement,
  property: string,
  value: string,
): string | null {
  const tagName = getTagName(element);
  const document = element.ownerDocument;
  const normalizedProperty = property.toLowerCase();

  if (!value.trim() || isDangerousCssValue(value)) return null;

  if (normalizedProperty === 'color') {
    return sanitizeCssColor(document, value);
  }

  if (normalizedProperty === 'background-color') {
    if (!INLINE_TAGS.has(tagName) && tagName !== 'td' && tagName !== 'th') {
      return null;
    }

    return sanitizeCssColor(document, value, { allowTransparent: false });
  }

  if (normalizedProperty === 'font-size') return sanitizeFontSize(value);
  if (normalizedProperty === 'line-height') return sanitizeLineHeight(value);
  if (normalizedProperty === 'font-weight') return sanitizeFontWeight(value);
  if (normalizedProperty === 'font-style') {
    return value.trim().toLowerCase() === 'italic' ? 'italic' : null;
  }
  if (normalizedProperty === 'text-decoration') return sanitizeTextDecoration(value);

  if (normalizedProperty === 'text-align') {
    return TEXT_ALIGN_STYLE_TAGS.has(tagName)
      ? sanitizeTextAlign(value, element)
      : null;
  }

  if (normalizedProperty === 'list-style-type') {
    return sanitizeListStyleType(value, element);
  }

  if (tagName === 'table') {
    if (normalizedProperty === 'width' || normalizedProperty === 'margin-left') {
      return sanitizePercentStyle(value);
    }
  }

  return null;
}

function sanitizeStyle(element: HTMLElement): string | null {
  const allowed: string[] = [];

  for (const property of Array.from(element.style)) {
    const value = element.style.getPropertyValue(property);
    const sanitized = sanitizeStyleProperty(element, property, value);

    if (sanitized) allowed.push(`${property.toLowerCase()}: ${sanitized}`);
  }

  return allowed.length > 0 ? allowed.join('; ') : null;
}

function sanitizeExplicitUrl(url: string): SanitizedUrl {
  const normalized = normalizeLinkUrl(url);

  if (!normalized.ok) return { ok: false };

  try {
    const parsed = new URL(normalized.url);
    if (!ALLOWED_EXPLICIT_URL_PROTOCOLS.has(parsed.protocol)) return { ok: false };
  } catch {
    return { ok: false };
  }

  return { ok: true, url: normalized.url };
}

function sanitizeRelativeUrl(url: string): SanitizedUrl {
  if (url.startsWith('//') || url.startsWith('\\\\')) return { ok: false };
  if (/[\u0000-\u001F\u007F\s<>"']/.test(url)) return { ok: false };
  if (/[\\]/.test(url)) return { ok: false };

  return { ok: true, url };
}

function sanitizePastedUrl(value: string | null): SanitizedUrl {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { ok: false };

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return { ok: false };

  const protocolMatch = trimmed.match(/^([a-z][a-z\d+.-]*):/i);
  if (protocolMatch) {
    const protocol = `${protocolMatch[1].toLowerCase()}:`;
    if (!ALLOWED_EXPLICIT_URL_PROTOCOLS.has(protocol)) return { ok: false };

    return sanitizeExplicitUrl(trimmed);
  }

  return sanitizeRelativeUrl(trimmed);
}

function cleanTextAttribute(value: string | null, maxLength: number): string | null {
  const cleaned = value?.replace(/[\u0000-\u001F\u007F<>]/g, '').trim() ?? '';

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function sanitizeIntegerAttribute(
  value: string | null,
  min: number,
  max: number,
): string | null {
  const match = value?.trim().match(/^\d+$/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? String(parsed)
    : null;
}

function sanitizePercentAttribute(
  value: string | null,
  min = 0,
  max = 100,
): string | null {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)%?$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? String(parsed)
    : null;
}

function sanitizeBooleanAttribute(value: string | null): string | null {
  if (value == null) return null;

  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'true' || normalized === '1'
    ? 'true'
    : normalized === 'false' || normalized === '0'
      ? 'false'
      : null;
}

function sanitizeSafeId(value: string | null): string | null {
  const cleaned = value?.trim() ?? '';

  return /^[a-zA-Z0-9_-]{1,64}$/.test(cleaned) ? cleaned : null;
}

function sanitizeColwidth(value: string | null): string | null {
  if (!value) return null;

  const widths = value
    .split(',')
    .map((width) => width.trim())
    .filter(Boolean);

  if (widths.length === 0 || widths.length > 50) return null;

  const sanitized = widths.map((width) =>
    sanitizeIntegerAttribute(width, 25, 2000),
  );

  return sanitized.every((width): width is string => Boolean(width))
    ? sanitized.join(',')
    : null;
}

function sanitizeListStyleAttribute(
  value: string | null,
  tagName: string,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (tagName === 'ol' && ORDERED_LIST_STYLES.has(normalized)) return normalized;
  if (tagName === 'ul' && BULLET_LIST_STYLES.has(normalized)) return normalized;

  return null;
}

function sanitizeOrderedListType(value: string | null): string | null {
  const normalized = value?.trim() ?? '';

  return /^(?:1|a|A|i|I)$/.test(normalized) ? normalized : null;
}

function isAllowedKbAttribute(tagName: string, attributeName: string): boolean {
  if (tagName === 'aside') {
    return attributeName === 'data-kb-callout' ||
      attributeName === 'data-kb-callout-variant';
  }

  if (tagName === 'div') {
    return DIV_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'section') {
    return SECTION_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'details') {
    return DETAILS_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'h3') return attributeName === 'data-kb-tab-label-static';
  if (tagName === 'summary') {
    return attributeName === 'data-kb-accordion-title-static';
  }

  return false;
}

function collectSafeAttributes(element: HTMLElement): Map<string, string> {
  const tagName = getTagName(element);
  const attributes = new Map<string, string>();

  if (tagName === 'a') {
    const href = sanitizePastedUrl(element.getAttribute('href'));
    if (href.ok) {
      attributes.set('href', href.url);

      if ((element.getAttribute('target') ?? '').trim().toLowerCase() === '_blank') {
        attributes.set('target', '_blank');
        attributes.set('rel', 'noopener noreferrer');
      }
    }

    const title = cleanTextAttribute(element.getAttribute('title'), 300);
    if (title) attributes.set('title', title);
  }

  if (tagName === 'code') {
    const languageClass = Array.from(element.classList).find((className) =>
      /^language-[a-z0-9_+-]{1,40}$/i.test(className),
    );
    if (languageClass) attributes.set('class', languageClass);
  }

  if (tagName === 'ol') {
    const start = sanitizeIntegerAttribute(element.getAttribute('start'), 1, 10000);
    const type = sanitizeOrderedListType(element.getAttribute('type'));
    if (start) attributes.set('start', start);
    if (type) attributes.set('type', type);
  }

  if (tagName === 'ol' || tagName === 'ul') {
    const listStyle = sanitizeListStyleAttribute(
      element.getAttribute('data-list-style'),
      tagName,
    );
    if (listStyle) attributes.set('data-list-style', listStyle);

    if (
      tagName === 'ul' &&
      element.getAttribute('data-type')?.trim() === 'taskList'
    ) {
      attributes.set('data-type', 'taskList');
    }
  }

  if (
    tagName === 'li' &&
    element.getAttribute('data-type')?.trim() === 'taskItem'
  ) {
    attributes.set('data-type', 'taskItem');

    const checked = sanitizeBooleanAttribute(element.getAttribute('data-checked'));
    if (checked) attributes.set('data-checked', checked);
  }

  if (tagName === 'table') {
    const width = sanitizePercentAttribute(
      element.getAttribute('data-table-width-pct'),
      10,
      100,
    );
    const offset = sanitizePercentAttribute(
      element.getAttribute('data-table-offset-pct'),
      0,
      100,
    );

    if (width) attributes.set('data-table-width-pct', width);
    if (offset) attributes.set('data-table-offset-pct', offset);

    TABLE_BORDER_ATTRIBUTES.forEach((attributeName) => {
      const value = sanitizeBooleanAttribute(element.getAttribute(attributeName));
      if (value) attributes.set(attributeName, value);
    });
  }

  if (tagName === 'tr') {
    const rowHeight = sanitizeIntegerAttribute(
      element.getAttribute('data-row-height'),
      20,
      800,
    );
    if (rowHeight) attributes.set('data-row-height', rowHeight);
  }

  if (tagName === 'td' || tagName === 'th') {
    const colspan = sanitizeIntegerAttribute(element.getAttribute('colspan'), 1, 50);
    const rowspan = sanitizeIntegerAttribute(element.getAttribute('rowspan'), 1, 50);
    const colwidth = sanitizeColwidth(element.getAttribute('colwidth'));
    const align = sanitizeTextAlign(
      element.getAttribute('align') ?? element.style.textAlign,
      element,
    );
    const backgroundColor =
      sanitizeCssColor(
        element.ownerDocument,
        element.getAttribute('data-cell-background-color') ??
          element.style.backgroundColor,
      ) ?? null;
    const rowHeight = sanitizeIntegerAttribute(
      element.getAttribute('data-row-height'),
      20,
      800,
    );

    if (colspan && colspan !== '1') attributes.set('colspan', colspan);
    if (rowspan && rowspan !== '1') attributes.set('rowspan', rowspan);
    if (colwidth) attributes.set('colwidth', colwidth);
    if (align) attributes.set('align', align);
    if (backgroundColor) {
      attributes.set('data-cell-background-color', backgroundColor);
    }
    if (rowHeight) attributes.set('data-row-height', rowHeight);
  }

  if (tagName === 'col') {
    const span = sanitizeIntegerAttribute(element.getAttribute('span'), 1, 50);
    const width = sanitizeIntegerAttribute(element.getAttribute('width'), 25, 2000);
    if (span && span !== '1') attributes.set('span', span);
    if (width) attributes.set('width', width);
  }

  if (tagName === 'mark') {
    const color = sanitizeCssColor(
      element.ownerDocument,
      element.getAttribute('data-color') ?? element.style.backgroundColor,
    );
    if (color) attributes.set('data-color', color);
  }

  if (tagName === 'aside' && element.hasAttribute('data-kb-callout')) {
    attributes.set('data-kb-callout', '');
    attributes.set(
      'data-kb-callout-variant',
      normalizeCalloutVariant(element.getAttribute('data-kb-callout-variant')),
    );
  }

  if (tagName === 'div') {
    DIV_KB_ATTRIBUTE_NAMES.forEach((attributeName) => {
      if (element.hasAttribute(attributeName)) attributes.set(attributeName, '');
    });
  }

  if (tagName === 'section' && element.hasAttribute('data-kb-tab-item')) {
    attributes.set('data-kb-tab-item', '');

    const itemId = sanitizeSafeId(element.getAttribute('data-kb-tab-id'));
    const label = cleanTextAttribute(element.getAttribute('data-kb-tab-label'), 120);
    if (itemId) attributes.set('data-kb-tab-id', itemId);
    if (label) attributes.set('data-kb-tab-label', label);
  }

  if (tagName === 'details' && element.hasAttribute('data-kb-accordion-item')) {
    attributes.set('data-kb-accordion-item', '');

    const itemId = sanitizeSafeId(element.getAttribute('data-kb-accordion-id'));
    const title = cleanTextAttribute(
      element.getAttribute('data-kb-accordion-title'),
      120,
    );
    if (itemId) attributes.set('data-kb-accordion-id', itemId);
    if (title) attributes.set('data-kb-accordion-title', title);
    if (element.hasAttribute('open')) attributes.set('open', '');
  }

  if (tagName === 'h3' && element.hasAttribute('data-kb-tab-label-static')) {
    attributes.set('data-kb-tab-label-static', '');
  }

  if (
    tagName === 'summary' &&
    element.hasAttribute('data-kb-accordion-title-static')
  ) {
    attributes.set('data-kb-accordion-title-static', '');
  }

  return attributes;
}

function applySanitizedAttributes(element: HTMLElement): void {
  const attributes = collectSafeAttributes(element);
  const style = sanitizeStyle(element);

  Array.from(element.attributes).forEach((attribute) => {
    element.removeAttribute(attribute.name);
  });

  attributes.forEach((value, name) => element.setAttribute(name, value));

  if (style) element.setAttribute('style', style);
}

function shouldUnwrapFormattingElement(element: HTMLElement): boolean {
  const tagName = getTagName(element);

  if ((tagName === 'b' || tagName === 'strong') && /^(?:normal|400)$/i.test(element.style.fontWeight)) {
    return true;
  }

  if ((tagName === 'i' || tagName === 'em') && element.style.fontStyle === 'normal') {
    return true;
  }

  if (
    TEXT_DECORATION_FORMATTING_TAGS.has(tagName) &&
    /(?:^|\s)none(?:\s|$)/i.test(element.style.textDecoration)
  ) {
    return true;
  }

  return false;
}

function normalizeFontElement(element: HTMLElement): HTMLElement {
  const span = replaceElementTag(element, 'span');
  const styles: string[] = [];
  const color = span.getAttribute('color');
  const size = span.getAttribute('size')?.trim();

  if (color) styles.push(`color: ${color}`);

  if (size && /^[1-7]$/.test(size)) {
    styles.push(
      `font-size: ${LEGACY_FONT_SIZE_MAP[size as keyof typeof LEGACY_FONT_SIZE_MAP]}`,
    );
  }

  if (styles.length > 0) {
    const currentStyle = span.getAttribute('style');
    span.setAttribute(
      'style',
      currentStyle ? `${currentStyle}; ${styles.join('; ')}` : styles.join('; '),
    );
  }

  span.removeAttribute('color');
  span.removeAttribute('size');
  span.removeAttribute('face');

  return span;
}

function sanitizeChildNodes(parent: Node, parentDepth: number): void {
  Array.from(parent.childNodes).forEach((child) =>
    sanitizeNode(child, parentDepth + 1),
  );
}

function sanitizeNode(node: Node, depth: number): void {
  if (depth > MAX_SANITIZE_DEPTH) {
    removeNode(node);
    return;
  }

  if (isTextNode(node)) {
    normalizeTextNode(node);
    return;
  }

  if (!isElementNode(node)) {
    removeNode(node);
    return;
  }

  let element: HTMLElement = node;
  let tagName = getTagName(element);

  if (tagName.includes(':')) {
    element.remove();
    return;
  }

  if (DROP_WITH_CONTENT.has(tagName)) {
    element.remove();
    return;
  }

  if (tagName === 'font') {
    element = normalizeFontElement(element);
    tagName = getTagName(element);
  }

  if (tagName === 'h5' || tagName === 'h6') {
    element = replaceElementTag(element, 'h4');
    tagName = getTagName(element);
  }

  if (tagName === 'b') {
    element = replaceElementTag(element, 'strong');
    tagName = getTagName(element);
  } else if (tagName === 'i') {
    element = replaceElementTag(element, 'em');
    tagName = getTagName(element);
  } else if (tagName === 'strike') {
    element = replaceElementTag(element, 's');
    tagName = getTagName(element);
  }

  if (shouldUnwrapFormattingElement(element)) {
    sanitizeChildNodes(element, depth);
    unwrapElement(element);
    return;
  }

  if (GENERIC_WRAPPER_TAGS.has(tagName) && !hasAllowedKbAttribute(element)) {
    if (hasOnlyPhrasingContent(element)) {
      element = replaceElementTag(element, 'p');
      tagName = getTagName(element);
    } else {
      sanitizeChildNodes(element, depth);
      unwrapElement(element);
      return;
    }
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    if (BLOCK_LIKE_TAGS.has(tagName) && hasOnlyPhrasingContent(element)) {
      element = replaceElementTag(element, 'p');
    } else {
      sanitizeChildNodes(element, depth);
      unwrapElement(element);
      return;
    }
  }

  sanitizeChildNodes(element, depth);
  applySanitizedAttributes(element);

  if (getTagName(element) === 'a' && !element.hasAttribute('href')) {
    unwrapElement(element);
  }
}

function readPercent(value: string | null, allowUnitless = false): number | null {
  const match = value
    ?.trim()
    .match(allowUnitless ? /^(\d+(?:\.\d+)?)%?$/ : /^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const percentage = Number(match[1]);

  return Number.isFinite(percentage)
    ? Math.max(10, Math.min(100, percentage))
    : null;
}

function normalizePastedTables(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (!table.querySelector('tr')) {
      table.remove();
      return;
    }

    const width =
      readPercent(table.getAttribute('data-table-width-pct'), true) ??
      readPercent(table.style.width) ??
      readPercent(table.getAttribute('width')) ??
      100;
    const offset =
      readPercent(table.getAttribute('data-table-offset-pct'), true) ??
      readPercent(table.style.marginLeft) ??
      0;
    const clampedOffset = Math.max(0, Math.min(100 - width, offset));

    table.setAttribute('data-table-width-pct', String(width));
    table.setAttribute('data-table-offset-pct', String(clampedOffset));
    table.setAttribute('style', `width: ${width}%; margin-left: ${clampedOffset}%;`);
    table.removeAttribute('width');
  });
}

function convertBackgroundSpansToMarks(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('span').forEach((span) => {
    const backgroundColor = span.style.backgroundColor;
    if (!backgroundColor) return;

    span.style.removeProperty('background-color');

    const mark = span.ownerDocument.createElement('mark');
    mark.setAttribute('data-color', backgroundColor);
    mark.style.backgroundColor = backgroundColor;

    const remainingStyle = span.getAttribute('style');
    while (span.firstChild) mark.append(span.firstChild);

    if (remainingStyle) {
      const innerSpan = span.ownerDocument.createElement('span');
      innerSpan.setAttribute('style', remainingStyle);
      while (mark.firstChild) innerSpan.append(mark.firstChild);
      mark.append(innerSpan);
    }

    span.replaceWith(mark);
  });
}

function unwrapEmptySpans(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('span').forEach((span) => {
    if (span.attributes.length === 0) unwrapElement(span);
  });
}

function isInlineLikeNode(node: Node): boolean {
  if (isTextNode(node)) return Boolean(node.textContent?.trim());
  if (!isElementNode(node)) return false;

  return INLINE_TAGS.has(getTagName(node));
}

function nodeHasMeaningfulContent(node: Node): boolean {
  if (isTextNode(node)) return Boolean(node.textContent?.trim());
  if (!isElementNode(node)) return false;
  if (getTagName(node) === 'br') return true;

  return Array.from(node.childNodes).some(nodeHasMeaningfulContent);
}

function wrapInlineRun(container: Element, run: Node[]): void {
  const meaningful = run.filter(nodeHasMeaningfulContent);
  if (meaningful.length === 0) {
    run.forEach(removeNode);
    return;
  }

  const paragraph = container.ownerDocument.createElement('p');
  meaningful[0].parentNode?.insertBefore(paragraph, meaningful[0]);
  meaningful.forEach((node) => paragraph.append(node));
}

function wrapLooseInlineRuns(root: ParentNode): void {
  const containers = [
    root instanceof Element ? root : null,
    ...Array.from(
      root.querySelectorAll<HTMLElement>(LOOSE_INLINE_CONTAINER_SELECTOR),
    ),
  ].filter((container): container is Element => Boolean(container));

  containers.forEach((container) => {
    let run: Node[] = [];

    Array.from(container.childNodes).forEach((child) => {
      if (isInlineLikeNode(child)) {
        run.push(child);
        return;
      }

      if (run.length > 0) {
        wrapInlineRun(container, run);
        run = [];
      }

      if (isTextNode(child) && !child.textContent?.trim()) child.remove();
    });

    if (run.length > 0) wrapInlineRun(container, run);
  });
}

function removeEmptyElements(root: ParentNode): void {
  Array.from(root.querySelectorAll<HTMLElement>('*'))
    .reverse()
    .forEach((element) => {
      const tagName = getTagName(element);
      if (!EMPTY_ELEMENT_TAGS.has(tagName)) return;
      if (nodeHasMeaningfulContent(element)) return;

      element.remove();
    });

  root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4').forEach((element) => {
    if (nodeHasMeaningfulContent(element)) return;
    if (hasAllowedKbAttribute(element)) return;

    element.remove();
  });
}

function normalizePastedStructure(root: ParentNode): void {
  convertBackgroundSpansToMarks(root);
  unwrapEmptySpans(root);
  wrapLooseInlineRuns(root);
  normalizePastedTables(root);
  removeEmptyElements(root);
}

export function sanitizePastedHTML(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  if (html.length > MAX_PASTED_HTML_LENGTH) return '';

  try {
    const document = new DOMParser().parseFromString(html, 'text/html');
    if (!hasAcceptableNodeCount(document.body)) return '';

    pruneNodesExceedingMaxDepth(document.body);
    removeComments(document.body);
    normalizeAppleConvertedSpaces(document.body);
    convertWordListParagraphs(document.body);
    sanitizeChildNodes(document.body, 0);
    normalizePastedStructure(document.body);
    sanitizeChildNodes(document.body, 0);

    return document.body.innerHTML;
  } catch (error) {
    logDevError('Paste sanitization failed:', error);
    return '';
  }
}
