import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export type ItemContext = {
  index: number;
  item: ProseMirrorNode;
  parent: ProseMirrorNode;
  parentPos: number;
};

export function resolveNodeViewPosition(
  getPos: (() => number | undefined) | boolean,
): number | null {
  if (typeof getPos !== 'function') return null;

  const position = getPos();
  return typeof position === 'number' ? position : null;
}

export function getItemContext(
  view: EditorView,
  itemPos: number,
  parentTypeName: string,
): ItemContext | null {
  try {
    const $pos = view.state.doc.resolve(itemPos);
    const parent = $pos.parent;
    const index = $pos.index();
    const item = parent.maybeChild(index);

    if (!item || parent.type.name !== parentTypeName) return null;

    return {
      index,
      item,
      parent,
      parentPos: $pos.before($pos.depth),
    };
  } catch {
    return null;
  }
}

export function updateNodeAttributes(
  view: EditorView,
  position: number,
  attributes: Record<string, unknown>,
): boolean {
  if (!view.editable) return false;

  const node = view.state.doc.nodeAt(position);
  if (!node) return false;

  view.dispatch(
    view.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...attributes,
    }),
  );
  return true;
}

export function replaceContainerChildren(
  view: EditorView,
  containerPos: number,
  containerTypeName: string,
  children: readonly ProseMirrorNode[],
): boolean {
  if (!view.editable) return false;

  const container = view.state.doc.nodeAt(containerPos);
  if (!container || container.type.name !== containerTypeName || children.length === 0) {
    return false;
  }

  view.dispatch(
    view.state.tr.replaceWith(
      containerPos + 1,
      containerPos + container.nodeSize - 1,
      Fragment.fromArray([...children]),
    ),
  );
  return true;
}

export function insertItemAfter(
  view: EditorView,
  itemPos: number,
  parentTypeName: string,
  item: ProseMirrorNode,
): boolean {
  if (!view.editable) return false;

  const context = getItemContext(view, itemPos, parentTypeName);
  if (!context) return false;

  view.dispatch(view.state.tr.insert(itemPos + context.item.nodeSize, item));
  return true;
}

export function removeItem(
  view: EditorView,
  itemPos: number,
  parentTypeName: string,
): boolean {
  if (!view.editable) return false;

  const context = getItemContext(view, itemPos, parentTypeName);
  if (!context || context.parent.childCount <= 1) return false;

  view.dispatch(view.state.tr.delete(itemPos, itemPos + context.item.nodeSize));
  return true;
}

export function moveItem(
  view: EditorView,
  itemPos: number,
  parentTypeName: string,
  direction: -1 | 1,
): boolean {
  if (!view.editable) return false;

  const context = getItemContext(view, itemPos, parentTypeName);
  if (!context) return false;

  const destination = context.index + direction;
  if (destination < 0 || destination >= context.parent.childCount) return false;

  const children: ProseMirrorNode[] = [];
  context.parent.forEach((child) => children.push(child));
  const [moved] = children.splice(context.index, 1);
  children.splice(destination, 0, moved);

  return replaceContainerChildren(
    view,
    context.parentPos,
    parentTypeName,
    children,
  );
}
