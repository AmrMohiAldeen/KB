import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { findParentNodeClosestToPos } from 'prosemirror-utils';

export function getActiveTablePos(state: EditorState): number | null {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'table') {
    return state.selection.from;
  }

  const table = findParentNodeClosestToPos(
    state.selection.$from,
    (node) => node.type.name === 'table',
  );

  return table ? table.pos : null;
}

export function getTableWrapperAtPos(view: EditorView, tablePos: number) {
  const dom = view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return null;

  return dom.closest<HTMLElement>('.tableWrapper');
}

export function getTableAtPos(view: EditorView, tablePos: number) {
  return getTableWrapperAtPos(view, tablePos)?.querySelector<HTMLTableElement>('table') ?? null;
}

export function getOwnerWindow(view: EditorView) {
  return view.dom.ownerDocument.defaultView ?? window;
}

export function positionOverlayAtRect(
  view: EditorView,
  overlay: HTMLElement,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
) {
  const editorRect = view.dom.getBoundingClientRect();

  overlay.style.left = `${rect.left - editorRect.left}px`;
  overlay.style.top = `${rect.top - editorRect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}
