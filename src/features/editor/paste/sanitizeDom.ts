import {
  ALLOWED_TAGS,
  BLOCK_LIKE_TAGS,
  DROP_WITH_CONTENT,
  EMPTY_ELEMENT_TAGS,
  GENERIC_WRAPPER_TAGS,
  INLINE_TAGS,
  LEGACY_FONT_SIZE_MAP,
  LOOSE_INLINE_CONTAINER_SELECTOR,
  MAX_SANITIZE_DEPTH,
  TEXT_DECORATION_FORMATTING_TAGS,
} from './pasteSanitizerConfig';
import { applySanitizedAttributes, isAllowedKbAttribute } from './sanitizeAttributes';
import {
  getTagName,
  hasOnlyPhrasingContent,
  isElementNode,
  isTextNode,
  nodeHasMeaningfulContent,
  removeNode,
  replaceElementTag,
  unwrapElement,
} from './domUtils';
import {
  normalizePastedTables,
  normalizePastedTableStructure,
} from './normalizeTables';

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

function shouldUnwrapFormattingElement(element: HTMLElement): boolean {
  const tagName = getTagName(element);

  if (
    (tagName === 'b' || tagName === 'strong') &&
    /^(?:normal|400)$/i.test(element.style.fontWeight)
  ) {
    return true;
  }

  if (
    (tagName === 'i' || tagName === 'em') &&
    element.style.fontStyle === 'normal'
  ) {
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
  const ElementCtor = root.ownerDocument?.defaultView?.Element;
  const containers = [
    ElementCtor && root instanceof ElementCtor ? root : null,
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

export function sanitizeDom(root: ParentNode): void {
  sanitizeChildNodes(root, 0);
}

export function normalizePastedStructure(root: ParentNode): void {
  convertBackgroundSpansToMarks(root);
  unwrapEmptySpans(root);
  normalizePastedTableStructure(root);
  wrapLooseInlineRuns(root);
  normalizePastedTables(root);
  removeEmptyElements(root);
}
