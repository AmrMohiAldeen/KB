import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { getOwnerWindow } from '../dom/editorDom';
import { logDevError } from '../utils/logDevError';

export type DraggableBlockPredicate = (node: ProseMirrorNode) => boolean;

export type VerticalBlockDragSession = {
  blockPos: number;
  startY: number;
};

export type BlockMoveResult = {
  transaction: Transaction;
  newBlockPos: number;
};

type BlockContext = {
  block: ProseMirrorNode;
  parent: ProseMirrorNode;
  parentDepth: number;
  index: number;
  boundaries: number[];
};

type BlockDropIndicatorRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

function getBlockContext(
  state: Pick<EditorState, 'doc'>,
  blockPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): BlockContext | null {
  const block = getDraggableBlockAt(state.doc, blockPos, isDraggableBlock);
  if (!block) return null;

  try {
    const $blockPos = state.doc.resolve(blockPos);
    const parent = $blockPos.parent;
    const index = $blockPos.index();
    if (parent.maybeChild(index) !== block) return null;

    const boundaries = [$blockPos.start()];
    for (let childIndex = 0; childIndex < parent.childCount; childIndex += 1) {
      boundaries.push(boundaries[childIndex] + parent.child(childIndex).nodeSize);
    }

    return {
      block,
      parent,
      parentDepth: $blockPos.depth,
      index,
      boundaries,
    };
  } catch (error) {
    logDevError('Draggable block context lookup failed:', error);
    return null;
  }
}

export function getDraggableBlockAt(
  doc: ProseMirrorNode,
  blockPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): ProseMirrorNode | null {
  if (!Number.isInteger(blockPos) || blockPos < 0 || blockPos > doc.content.size) {
    return null;
  }

  const node = doc.nodeAt(blockPos);
  return node && isDraggableBlock(node) ? node : null;
}

export function mapDraggableBlockPos(
  transaction: Transaction,
  blockPos: number | null,
  isDraggableBlock: DraggableBlockPredicate,
): number | null {
  if (blockPos == null) return null;

  const mapped = transaction.mapping.mapResult(blockPos, 1);
  return mapped.deleted ||
    !getDraggableBlockAt(transaction.doc, mapped.pos, isDraggableBlock)
    ? null
    : mapped.pos;
}

export function serializeBlockDrag(
  view: EditorView,
  event: DragEvent,
  blockPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): boolean {
  if (
    !event.dataTransfer ||
    !getDraggableBlockAt(view.state.doc, blockPos, isDraggableBlock)
  ) {
    return false;
  }

  try {
    const selection = NodeSelection.create(view.state.doc, blockPos);
    const { dom, text } = view.serializeForClipboard(selection.content());

    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/html', dom.innerHTML);
    event.dataTransfer.setData('text/plain', text);
    event.dataTransfer.effectAllowed = 'move';
    return true;
  } catch (error) {
    logDevError('Block drag serialization failed:', error);
    return false;
  }
}

export function createBlockMove(
  state: EditorState,
  blockPos: number,
  dropPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): BlockMoveResult | null {
  const context = getBlockContext(state, blockPos, isDraggableBlock);
  if (
    !context ||
    !Number.isInteger(dropPos) ||
    dropPos < 0 ||
    dropPos > state.doc.content.size ||
    !context.boundaries.includes(dropPos)
  ) {
    return null;
  }

  try {
    const blockEnd = blockPos + context.block.nodeSize;
    if (dropPos >= blockPos && dropPos <= blockEnd) {
      return null;
    }

    const transaction = state.tr.delete(blockPos, blockEnd);
    const mappedInsertPos = transaction.mapping.map(dropPos);
    transaction.insert(mappedInsertPos, context.block);
    transaction.setSelection(NodeSelection.create(transaction.doc, mappedInsertPos));
    return { transaction, newBlockPos: mappedInsertPos };
  } catch (error) {
    logDevError('Block move transaction creation failed:', error);
    return null;
  }
}

export function createBlockMoveTransaction(
  state: EditorState,
  blockPos: number,
  dropPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): Transaction | null {
  const move = createBlockMove(state, blockPos, dropPos, isDraggableBlock);
  return move ? closeHistory(move.transaction) : null;
}

function getAdjacentBlockDropPos(
  state: EditorState,
  blockPos: number,
  direction: -1 | 1,
  isDraggableBlock: DraggableBlockPredicate,
): number | null {
  const context = getBlockContext(state, blockPos, isDraggableBlock);
  if (!context) return null;

  return direction < 0
    ? context.index === 0
      ? null
      : context.boundaries[context.index - 1]
    : context.index >= context.parent.childCount - 1
      ? null
      : context.boundaries[context.index + 2];
}

export function getVerticalBlockDropPos(
  view: EditorView,
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
  session: VerticalBlockDragSession,
  isDraggableBlock: DraggableBlockPredicate,
): number | null {
  const fallbackDirection = event.clientY < session.startY ? -1 : 1;
  const context = getBlockContext(view.state, session.blockPos, isDraggableBlock);
  if (!context) return null;

  let coords: ReturnType<EditorView['posAtCoords']> = null;
  try {
    coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  } catch (error) {
    logDevError('Block drop coordinate lookup failed:', error);
  }
  if (!coords) {
    return getAdjacentBlockDropPos(
      view.state,
      session.blockPos,
      fallbackDirection,
      isDraggableBlock,
    );
  }

  try {
    const $pos = view.state.doc.resolve(coords.pos);
    if (
      $pos.depth < context.parentDepth ||
      $pos.node(context.parentDepth) !== context.parent
    ) {
      return getAdjacentBlockDropPos(
        view.state,
        session.blockPos,
        fallbackDirection,
        isDraggableBlock,
      );
    }

    const targetIndex = $pos.index(context.parentDepth);
    const targetNode = context.parent.maybeChild(targetIndex);
    const targetPos = context.boundaries[targetIndex];
    if (!targetNode || targetIndex === context.index) {
      return getAdjacentBlockDropPos(
        view.state,
        session.blockPos,
        fallbackDirection,
        isDraggableBlock,
      );
    }

    const targetDom = view.nodeDOM(targetPos);
    const targetRect =
      targetDom instanceof getOwnerWindow(view).HTMLElement
        ? targetDom.getBoundingClientRect()
        : null;
    const direction =
      targetRect && targetRect.height > 0
        ? event.clientY < targetRect.top + targetRect.height / 2
          ? -1
          : 1
        : fallbackDirection;

    return direction < 0
      ? context.boundaries[targetIndex]
      : context.boundaries[targetIndex + 1];
  } catch (error) {
    logDevError('Block drop target lookup failed:', error);
    return getAdjacentBlockDropPos(
      view.state,
      session.blockPos,
      fallbackDirection,
      isDraggableBlock,
    );
  }
}

export function getBlockDropIndicatorRect(
  view: EditorView,
  blockPos: number,
  dropPos: number,
  isDraggableBlock: DraggableBlockPredicate,
): BlockDropIndicatorRect | null {
  const context = getBlockContext(view.state, blockPos, isDraggableBlock);
  const boundaryIndex = context?.boundaries.indexOf(dropPos) ?? -1;
  if (!context || boundaryIndex < 0) return null;

  const targetIndex = Math.min(boundaryIndex, context.parent.childCount - 1);
  const targetPos = context.boundaries[targetIndex];
  try {
    const targetDom = view.nodeDOM(targetPos);
    if (!(targetDom instanceof getOwnerWindow(view).HTMLElement)) return null;

    const rect = targetDom.getBoundingClientRect();
    const top = boundaryIndex < context.parent.childCount ? rect.top : rect.bottom;
    return { left: rect.left, top: top - 1, width: rect.width, height: 2 };
  } catch (error) {
    logDevError('Block drop indicator geometry lookup failed:', error);
    return null;
  }
}

export function createBlockDropIndicator(view: EditorView): HTMLElement {
  const indicator = view.dom.ownerDocument.createElement('div');
  indicator.className = 'kb-block-drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  view.dom.ownerDocument.body.append(indicator);
  return indicator;
}

export function positionBlockDropIndicator(
  indicator: HTMLElement,
  rect: BlockDropIndicatorRect,
): void {
  indicator.style.left = `${rect.left}px`;
  indicator.style.top = `${rect.top}px`;
  indicator.style.width = `${rect.width}px`;
  indicator.style.height = `${rect.height}px`;
}

export function positionBlockDragHandle(
  view: EditorView,
  handle: HTMLElement,
  blockElement: HTMLElement,
): void {
  const editorRect = view.dom.getBoundingClientRect();
  const blockRect = blockElement.getBoundingClientRect();
  handle.style.left = `${blockRect.left - editorRect.left - handle.offsetWidth - 4}px`;
  handle.style.top = `${blockRect.top - editorRect.top - handle.offsetHeight - 4}px`;
}
