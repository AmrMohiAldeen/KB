import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export type ActiveTable = {
  node: ProseMirrorNode;
  pos: number;
};

type TableSelectionState = Pick<EditorState, 'doc' | 'selection'>;

export function getTableNodeAt(
  doc: ProseMirrorNode,
  tablePos: number,
): ProseMirrorNode | null {
  if (!Number.isInteger(tablePos) || tablePos < 0 || tablePos > doc.content.size) {
    return null;
  }

  const node = doc.nodeAt(tablePos);
  return node?.type.name === 'table' ? node : null;
}

export function getActiveTable(state: TableSelectionState): ActiveTable | null {
  if (
    state.selection instanceof NodeSelection &&
    state.selection.node.type.name === 'table'
  ) {
    return {
      node: state.selection.node,
      pos: state.selection.from,
    };
  }

  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      return {
        node,
        pos: $from.before(depth),
      };
    }
  }

  return null;
}

export function getActiveTablePos(state: TableSelectionState): number | null {
  return getActiveTable(state)?.pos ?? null;
}

export function mapTablePos(
  tr: Transaction,
  tablePos: number | null,
): number | null {
  if (tablePos == null) return null;

  const mapped = tr.mapping.mapResult(tablePos, 1);
  return mapped.deleted || !getTableNodeAt(tr.doc, mapped.pos) ? null : mapped.pos;
}

export function getTableWrapperAtPos(
  view: EditorView,
  tablePos: number,
): HTMLElement | null {
  if (!getTableNodeAt(view.state.doc, tablePos)) return null;

  try {
    const dom = view.nodeDOM(tablePos);
    if (!(dom instanceof getOwnerWindow(view).HTMLElement)) return null;
    return dom.matches('.tableWrapper')
      ? dom
      : dom.closest<HTMLElement>('.tableWrapper');
  } catch {
    return null;
  }
}

export function getTableAtPos(
  view: EditorView,
  tablePos: number,
): HTMLTableElement | null {
  return getTableWrapperAtPos(view, tablePos)?.querySelector<HTMLTableElement>('table') ?? null;
}

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
