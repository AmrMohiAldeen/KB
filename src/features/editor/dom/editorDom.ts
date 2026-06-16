import type { EditorView } from '@tiptap/pm/view';

export function getOwnerWindow(view: EditorView): Window & typeof globalThis {
  return (view.dom.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
}

export function getClosestHTMLElement(
  view: EditorView,
  target: EventTarget | null,
  selector: string,
): HTMLElement | null {
  const ownerWindow = getOwnerWindow(view);
  if (!(target instanceof ownerWindow.HTMLElement)) return null;
  return target.closest<HTMLElement>(selector);
}

export function requestViewAnimationFrame(
  view: EditorView,
  callback: () => void,
): number {
  return getOwnerWindow(view).requestAnimationFrame(() => {
    if (!view.isDestroyed) callback();
  });
}

export function positionOverlayAtRect(
  view: EditorView,
  overlay: HTMLElement,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): void {
  const editorRect = view.dom.getBoundingClientRect();

  overlay.style.left = `${rect.left - editorRect.left}px`;
  overlay.style.top = `${rect.top - editorRect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}
