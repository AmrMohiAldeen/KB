import { getTagName, isTextNode } from './domUtils';
import type { ListTagName } from './pasteSanitizerTypes';

type WordListContext = {
  lastItem: HTMLLIElement | null;
  level: number;
  list: HTMLOListElement | HTMLUListElement;
  tagName: ListTagName;
};

function removeLeadingWhitespace(node: Node): void {
  if (isTextNode(node)) {
    node.textContent = node.textContent?.replace(/^[\s\u00a0]+/, '') ?? '';
    return;
  }

  const firstChild = node.firstChild;
  if (firstChild) removeLeadingWhitespace(firstChild);
}

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

  return /^\s*(?:\d+|[a-z]+|[ivxlcdm]+)[.)]/i.test(markerText) ? 'ol' : 'ul';
}

function removeWordListMarker(paragraph: HTMLElement): void {
  Array.from(paragraph.querySelectorAll('span'))
    .find((span) => /mso-list:\s*Ignore/i.test(span.getAttribute('style') ?? ''))
    ?.remove();
}

function isWordListParagraph(element: Element): element is HTMLParagraphElement {
  if (getTagName(element) !== 'p') return false;

  const className = element.getAttribute('class') ?? '';
  const style = element.getAttribute('style') ?? '';

  return /\bMsoListParagraph\w*\b/i.test(className) || /mso-list:/i.test(style);
}

function convertWordListParagraphs(container: ParentNode): void {
  let stack: WordListContext[] = [];

  Array.from(container.children).forEach((child) => {
    if (!isWordListParagraph(child)) {
      convertWordListParagraphs(child);
      stack = [];
      return;
    }

    const requestedLevel = readWordListLevel(child);
    const level = Math.min(requestedLevel, stack.length + 1);
    const tagName = readWordListTag(child);
    removeWordListMarker(child);

    stack = stack.filter((context) => context.level <= level);

    let current =
      stack[stack.length - 1]?.level === level ? stack[stack.length - 1] : null;

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

function normalizeAppleConvertedSpaces(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.Apple-converted-space').forEach((span) => {
    span.replaceWith(
      span.ownerDocument.createTextNode(
        (span.textContent || ' ').replace(/\u00a0/g, ' '),
      ),
    );
  });
}

export function normalizeWordPaste(root: ParentNode): void {
  normalizeAppleConvertedSpaces(root);
  convertWordListParagraphs(root);
}
