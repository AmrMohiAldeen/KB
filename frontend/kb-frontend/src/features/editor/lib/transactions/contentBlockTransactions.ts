import { closeHistory, redo, undo } from '@tiptap/pm/history';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { logDevError } from '../utils/logDevError';
import {
  ACCORDION_ITEM_NODE_NAME,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
  type ContentBlockContainerNodeName,
  type ContentBlockItemAttributesByNodeName,
  type ContentBlockItemNodeName,
} from '../../blocks/model';

// Describes one item inside a content block container.
export type ItemContext = {
  index: number;
  item: ProseMirrorNode;
  parent: ProseMirrorNode;
  parentPos: number;
};

/**
 * Dispatches a ProseMirror transaction with consistent history behavior.
 *
 * By default, the transaction is wrapped with closeHistory(), so each content-block
 * action becomes a separate undo step.
 *
 * For UI-only/internal actions, pass addToHistory: false so the transaction does
 * not pollute the user's undo history.
 */
export function dispatchContentBlockTransaction(
  view: EditorView,
  transaction: Transaction,
  options: { addToHistory?: boolean } = {},
): void {
  view.dispatch(
    options.addToHistory === false
      ? transaction.setMeta('addToHistory', false)
      : closeHistory(transaction),
  );
}

function getItemTypeName(
  parentTypeName: ContentBlockContainerNodeName,
): typeof ACCORDION_ITEM_NODE_NAME | typeof TAB_ITEM_NODE_NAME {
  return parentTypeName === TABS_NODE_NAME
    ? TAB_ITEM_NODE_NAME
    : ACCORDION_ITEM_NODE_NAME;
}

export function resolveNodeViewPosition(
  getPos: (() => number | undefined) | boolean,
): number | null {
  if (typeof getPos !== 'function') return null;

  try {
    const position = getPos();
    return typeof position === 'number' ? position : null;
  } catch {
    return null;
  }
}

/**
 * Selects the entire tabs/accordion container as a NodeSelection.
 *
 * This is useful before running block-level actions from a node-view menu,
 * because it makes the active content block explicit in the editor state.
 */
export function activateContentBlock(
  view: EditorView,
  containerPos: number,
  containerTypeName: ContentBlockContainerNodeName,
  options: { focus?: boolean } = {},
): boolean {
  if (!view.editable) return false;

  const container = view.state.doc.nodeAt(containerPos);
  if (!container || container.type.name !== containerTypeName) return false;

  try {
    const selection = view.state.selection;

    // Avoid dispatching if the correct container is already selected.
    if (
      !(selection instanceof NodeSelection) ||
      selection.from !== containerPos ||
      selection.node.type.name !== containerTypeName
    ) {
      view.dispatch(
        view.state.tr
          .setSelection(NodeSelection.create(view.state.doc, containerPos))
          .setMeta('addToHistory', false),
      );
    }
    
    if (options.focus) view.focus();
    return true;
  } catch (error) {
    logDevError('Content block activation failed:', error);
    return false;
  }
}

export function runContentBlockHistoryAction(
  view: EditorView,
  action: 'redo' | 'undo',
): boolean {
  if (!view.editable) return false;

  const command = action === 'undo' ? undo : redo;
  const applied = command(view.state, view.dispatch);

  if (applied) view.focus();
  return applied;
}

export function getItemContext(
  view: EditorView,
  itemPos: number,
  parentTypeName: ContentBlockContainerNodeName,
): ItemContext | null {
  try {
    const $pos = view.state.doc.resolve(itemPos);
    const parent = $pos.parent;
    const index = $pos.index();
    const item = parent.maybeChild(index);

    if (
      !item ||
      parent.type.name !== parentTypeName ||
      item.type.name !== getItemTypeName(parentTypeName)
    ) {
      return null;
    }

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

export function updateNodeAttributes<NodeName extends ContentBlockItemNodeName>(
  view: EditorView,
  position: number,
  expectedTypeName: NodeName,
  attributes: Partial<ContentBlockItemAttributesByNodeName[NodeName]>,
  options: { addToHistory?: boolean } = {},
): boolean {
  if (!view.editable) return false;

  const node = view.state.doc.nodeAt(position);
  if (!node || node.type.name !== expectedTypeName) return false;

  dispatchContentBlockTransaction(
    view,
    view.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...attributes,
    }),
    options,
  );
  return true;
}

export function appendItem(
  view: EditorView,
  containerPos: number,
  containerTypeName: ContentBlockContainerNodeName,
  item: ProseMirrorNode,
): boolean {
  if (!view.editable || item.type.name !== getItemTypeName(containerTypeName)) {
    return false;
  }

  const container = view.state.doc.nodeAt(containerPos);
  if (!container || container.type.name !== containerTypeName) return false;

  dispatchContentBlockTransaction(
    view,
    view.state.tr.insert(containerPos + container.nodeSize - 1, item),
  );
  return true;
}

export function removeItem(
  view: EditorView,
  itemPos: number,
  parentTypeName: ContentBlockContainerNodeName,
): boolean {
  if (!view.editable) return false;

  const context = getItemContext(view, itemPos, parentTypeName);
  if (!context || context.parent.childCount <= 1) return false;

  dispatchContentBlockTransaction(
    view,
    view.state.tr.delete(itemPos, itemPos + context.item.nodeSize),
  );
  return true;
}

export function moveItem(
  view: EditorView,
  itemPos: number,
  parentTypeName: ContentBlockContainerNodeName,
  direction: -1 | 1,
): boolean {
  if (!view.editable) return false;

  const context = getItemContext(view, itemPos, parentTypeName);
  if (!context) return false;

  const destination = context.index + direction;
  if (destination < 0 || destination >= context.parent.childCount) return false;

  const adjacent = context.parent.child(destination);
  const from = direction === -1 ? itemPos - adjacent.nodeSize : itemPos;
  const to =
    direction === -1
      ? itemPos + context.item.nodeSize
      : itemPos + context.item.nodeSize + adjacent.nodeSize;
  const replacement =
    direction === -1
      ? [context.item, adjacent]
      : [adjacent, context.item];

  dispatchContentBlockTransaction(
    view,
    view.state.tr.replaceWith(from, to, Fragment.fromArray(replacement)),
  );
  return true;
}
