import { normalizeLinkUrl } from '../components/linkUrl';

const REMOVED_ELEMENTS = new Set([
  'applet',
  'button',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'script',
  'select',
  'style',
  'textarea',
  'title',
  'xml',
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'list-style-type',
  'margin-left',
  'text-align',
  'text-decoration',
  'width',
]);

function removeComments(root: ParentNode): void {
  const walker = root.ownerDocument?.createTreeWalker(
    root,
    NodeFilter.SHOW_COMMENT,
  );
  if (!walker) return;

  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((comment) => comment.remove());
}

function removeLeadingWhitespace(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = node.textContent?.replace(/^[\s\u00a0]+/, '') ?? '';
    return;
  }

  const firstChild = node.firstChild;
  if (firstChild) removeLeadingWhitespace(firstChild);
}

function convertWordListParagraphs(root: ParentNode): void {
  const paragraphs = Array.from(root.querySelectorAll('p')).filter((paragraph) => {
    const className = paragraph.getAttribute('class') ?? '';
    const style = paragraph.getAttribute('style') ?? '';
    return /\bMsoListParagraph\w*\b/i.test(className) || /mso-list:/i.test(style);
  });

  paragraphs.forEach((paragraph) => {
    const marker = Array.from(paragraph.querySelectorAll('span')).find((span) =>
      /mso-list:\s*Ignore/i.test(span.getAttribute('style') ?? ''),
    );
    const markerText = marker?.textContent ?? paragraph.textContent ?? '';
    const listTag = /^\s*(?:\d+|[a-z]+|[ivxlcdm]+)[.)]/i.test(markerText)
      ? 'ol'
      : 'ul';
    marker?.remove();

    const previous = paragraph.previousElementSibling;
    const list =
      previous?.tagName.toLowerCase() === listTag &&
      previous.hasAttribute('data-kb-word-list')
        ? previous
        : paragraph.ownerDocument.createElement(listTag);

    if (!list.isConnected) {
      list.setAttribute('data-kb-word-list', '');
      paragraph.before(list);
    }

    const item = paragraph.ownerDocument.createElement('li');
    while (paragraph.firstChild) item.append(paragraph.firstChild);
    removeLeadingWhitespace(item);
    list.append(item);
    paragraph.remove();
  });

  root
    .querySelectorAll('[data-kb-word-list]')
    .forEach((list) => list.removeAttribute('data-kb-word-list'));
}

function sanitizeStyle(element: HTMLElement): void {
  if (!element.hasAttribute('style')) return;

  const allowed: string[] = [];
  for (const property of Array.from(element.style)) {
    if (!ALLOWED_STYLE_PROPERTIES.has(property.toLowerCase())) continue;

    const value = element.style.getPropertyValue(property).trim();
    const priority = element.style.getPropertyPriority(property);
    if (value) allowed.push(`${property}: ${value}${priority ? ' !important' : ''}`);
  }

  if (allowed.length > 0) {
    element.setAttribute('style', allowed.join('; '));
  } else {
    element.removeAttribute('style');
  }
}

function sanitizeLink(element: HTMLAnchorElement): void {
  const href = element.getAttribute('href');
  if (!href) return;

  const normalized = normalizeLinkUrl(href);
  if (!normalized.ok) {
    element.removeAttribute('href');
    element.removeAttribute('target');
    element.removeAttribute('rel');
    return;
  }

  element.setAttribute('href', normalized.url);
  if (element.getAttribute('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer');
  } else {
    element.removeAttribute('target');
    element.removeAttribute('rel');
  }
}

function sanitizeElement(element: HTMLElement): void {
  const tagName = element.tagName.toLowerCase();
  if (REMOVED_ELEMENTS.has(tagName)) {
    element.remove();
    return;
  }

  if (tagName.includes(':')) {
    element.replaceWith(...Array.from(element.childNodes));
    return;
  }

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (
      name.startsWith('on') ||
      name.startsWith('xmlns') ||
      name === 'contenteditable' ||
      name === 'draggable'
    ) {
      element.removeAttribute(attribute.name);
    }
  });

  const className = element.getAttribute('class');
  if (className && /\bMso\w*/i.test(className)) {
    element.removeAttribute('class');
  }

  sanitizeStyle(element);
  if (element instanceof HTMLAnchorElement) sanitizeLink(element);
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
    const width =
      readPercent(table.getAttribute('data-table-width-pct'), true) ??
      readPercent(table.style.width) ??
      readPercent(table.getAttribute('width')) ??
      100;
    const offset =
      readPercent(table.getAttribute('data-table-offset-pct'), true) ??
      readPercent(table.style.marginLeft) ??
      0;

    table.setAttribute('data-table-width-pct', String(width));
    table.setAttribute(
      'data-table-offset-pct',
      String(Math.max(0, Math.min(100 - width, offset))),
    );
    table.style.width = `${width}%`;
    table.style.marginLeft = `${Math.max(0, Math.min(100 - width, offset))}%`;
    table.removeAttribute('width');
  });
}

export function sanitizePastedHTML(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  const document = new DOMParser().parseFromString(html, 'text/html');
  removeComments(document.body);
  convertWordListParagraphs(document.body);
  Array.from(document.body.querySelectorAll<HTMLElement>('*')).forEach(
    sanitizeElement,
  );
  normalizePastedTables(document.body);
  return document.body.innerHTML;
}
