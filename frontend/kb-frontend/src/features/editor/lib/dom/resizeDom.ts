import type { EditorView } from '@tiptap/pm/view';

const RESIZE_CONTAINER_SELECTOR = [
  '.kb-tab-card__body',
  '.kb-tabs__runtime-panel',
  '.kb-tabs__panels',
  '.kb-accordion__panel',
  '.kb-callout__content',
  'td',
  'th',
  '.ProseMirror',
].join(',');

function parsePixel(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getElementContentWidthPx(element: HTMLElement): number {
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  const style = ownerWindow.getComputedStyle(element);
  const width =
    element.clientWidth > 0 ? element.clientWidth : element.getBoundingClientRect().width;
  const contentWidth =
    width - parsePixel(style.paddingLeft) - parsePixel(style.paddingRight);

  return Number.isFinite(contentWidth) && contentWidth > 0 ? contentWidth : 0;
}

export function isVisibleResizeElement(element: HTMLElement): boolean {
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  const style = ownerWindow.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function getNearestVisibleResizeContainer(
  view: EditorView,
  element: HTMLElement,
): HTMLElement {
  let current: HTMLElement | null = element.parentElement;

  while (current && current !== view.dom.parentElement) {
    if (
      current.matches(RESIZE_CONTAINER_SELECTOR) &&
      isVisibleResizeElement(current) &&
      getElementContentWidthPx(current) > 0
    ) {
      return current;
    }

    if (current === view.dom) break;
    current = current.parentElement;
  }

  return view.dom as HTMLElement;
}

export function getResizeContainerWidthPx(
  view: EditorView,
  element: HTMLElement,
): number {
  const container = getNearestVisibleResizeContainer(view, element);
  const width = getElementContentWidthPx(container);

  return Number.isFinite(width) && width > 0 ? width : 1;
}

export function stopResizeStartEvent(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function isResizeHandleEvent(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        [
          '.kb-image-resize-handle',
          '.table-outer-resize-handle',
          '.row-resize-handle',
          '.column-resize-handle',
        ].join(','),
      ),
    )
  );
}
