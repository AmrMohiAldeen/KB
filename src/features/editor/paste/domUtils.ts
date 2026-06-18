import { BLOCK_LIKE_TAGS, INLINE_TAGS } from './pasteSanitizerConfig';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === ELEMENT_NODE;
}

export function isTextNode(node: Node): node is Text {
  return node.nodeType === TEXT_NODE;
}

export function getTagName(element: Element): string {
  return element.tagName.toLowerCase();
}

export function removeNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

export function unwrapElement(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

export function replaceElementTag<TTagName extends keyof HTMLElementTagNameMap>(
  element: HTMLElement,
  tagName: TTagName,
): HTMLElementTagNameMap[TTagName] {
  const replacement = element.ownerDocument.createElement(tagName);

  Array.from(element.attributes).forEach((attribute) => {
    replacement.setAttribute(attribute.name, attribute.value);
  });

  while (element.firstChild) replacement.append(element.firstChild);
  element.replaceWith(replacement);

  return replacement;
}

export function hasOnlyPhrasingContent(element: HTMLElement): boolean {
  return Array.from(element.childNodes).every((child) => {
    if (isTextNode(child)) return true;
    if (!isElementNode(child)) return false;

    const tagName = getTagName(child);
    return INLINE_TAGS.has(tagName) || !BLOCK_LIKE_TAGS.has(tagName);
  });
}

export function nodeHasMeaningfulContent(node: Node): boolean {
  if (isTextNode(node)) return Boolean(node.textContent?.trim());
  if (!isElementNode(node)) return false;
  if (getTagName(node) === 'br') return true;

  return Array.from(node.childNodes).some(nodeHasMeaningfulContent);
}
