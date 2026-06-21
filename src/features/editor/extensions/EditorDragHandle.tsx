'use client';

import DragHandle from '@tiptap/extension-drag-handle-react';
import type {
  DragHandleRule,
  NestedOptions,
  RuleContext,
} from '@tiptap/extension-drag-handle';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useEditorState, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CALLOUT_NODE_NAME } from '../blocks/callout/model';
import {
  ACCORDION_ITEM_NODE_NAME,
  ACCORDION_NODE_NAME,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
} from '../blocks/model';
import { useTableDragOffset } from '../blocks/table/drag/useTableDragOffset';
import { useImageDragOffset } from '../blocks/image/drag/useImageDragOffset';
import { BLOCK_IMAGE_NODE_NAME } from '../blocks/image/imageTypes';

const EXCLUDE_FROM_DRAG_TARGETS = 1000;
const DRAG_HANDLE_SIZE_PX = 20;
const LIST_ITEM_NODE_NAMES = new Set<string>(['listItem', 'taskItem']);
const TABLE_NODE_NAME = 'table';
const TABLE_INTERNAL_NODE_NAMES = new Set<string>([
  'tableRow',
  'tableCell',
  'tableHeader',
]);
const CUSTOM_CONTAINER_NODE_NAMES = new Set<string>([
  CALLOUT_NODE_NAME,
  ACCORDION_NODE_NAME,
  TABS_NODE_NAME,
]);
const SELECTION_ANCESTOR_DRAG_TARGET_NODE_NAMES = new Set<string>([
  TABLE_NODE_NAME,
  CALLOUT_NODE_NAME,
  ACCORDION_NODE_NAME,
  TABS_NODE_NAME,
]);
const INTERNAL_CONTENT_BLOCK_ITEM_NODE_NAMES = new Set<string>([
  ACCORDION_ITEM_NODE_NAME,
  TAB_ITEM_NODE_NAME,
]);

export type EditorDragHandleRuleInput = {
  nodeName: string;
  parentName?: string | null;
  ancestorNames?: readonly string[];
  isFirst?: boolean;
  isInline?: boolean;
  isText?: boolean;
};

function hasAncestor(
  input: Pick<EditorDragHandleRuleInput, 'ancestorNames'>,
  nodeName: string,
): boolean {
  return input.ancestorNames?.includes(nodeName) ?? false;
}

export function getEditorDragHandleRuleDeduction(
  input: EditorDragHandleRuleInput,
): number {
  if (input.isInline || input.isText) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (
    input.isFirst &&
    input.parentName &&
    LIST_ITEM_NODE_NAMES.has(input.parentName)
  ) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (TABLE_INTERNAL_NODE_NAMES.has(input.nodeName)) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (hasAncestor(input, TABLE_NODE_NAME) && input.nodeName !== TABLE_NODE_NAME) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  for (const containerName of CUSTOM_CONTAINER_NODE_NAMES) {
    if (hasAncestor(input, containerName) && input.nodeName !== containerName) {
      return EXCLUDE_FROM_DRAG_TARGETS;
    }
  }

  if (INTERNAL_CONTENT_BLOCK_ITEM_NODE_NAMES.has(input.nodeName)) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  return 0;
}

function getAncestorNodeNames(context: RuleContext): string[] {
  const names: string[] = [];

  for (let depth = 1; depth < context.depth; depth += 1) {
    names.push(context.$pos.node(depth).type.name);
  }

  return names;
}

const knowledgeBaseDragTargetRules: DragHandleRule = {
  id: 'kbOfficialDragTargets',
  evaluate: (context) =>
    getEditorDragHandleRuleDeduction({
      nodeName: context.node.type.name,
      parentName: context.parent?.type.name ?? null,
      ancestorNames: getAncestorNodeNames(context),
      isFirst: context.isFirst,
      isInline: context.node.isInline,
      isText: context.node.isText,
    }),
};

function getDragHandleLabel(nodeName: string | null | undefined): string {
  if (nodeName === TABLE_NODE_NAME) return 'Drag table';
  if (nodeName === BLOCK_IMAGE_NODE_NAME) return 'Drag image';
  if (
    nodeName === CALLOUT_NODE_NAME ||
    nodeName === ACCORDION_NODE_NAME ||
    nodeName === TABS_NODE_NAME
  ) {
    return 'Drag content block';
  }

  return 'Drag block';
}

type DragTarget = {
  node: ProseMirrorNode;
  pos: number;
} | null;

type TopLevelDragInfo = {
  index: number;
  node: ProseMirrorNode;
  pos: number;
};

type BlockDragSession = TopLevelDragInfo & {
  indicator: HTMLElement;
  latestDropIndex: number | null;
  startY: number;
  cleanup: () => void;
};

function getNodeInnerClientPoint(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;

  const rect = dom.getBoundingClientRect();
  return {
    x: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
    y: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
  };
}

function pointDragStartAtNode(event: DragEvent, editor: Editor, target: DragTarget) {
  if (!target || editor.isDestroyed) return;

  const node = editor.state.doc.nodeAt(target.pos);
  if (!node || node.type !== target.node.type) return;

  const point = getNodeInnerClientPoint(editor, target.pos);
  if (!point) return;

  try {
    Object.defineProperties(event, {
      clientX: {
        configurable: true,
        get: () => point.x,
      },
      clientY: {
        configurable: true,
        get: () => point.y,
      },
    });
  } catch {
    // Some browser event implementations make these fields non-configurable.
    // In that case the drag handle can fall back to its current hover context.
  }
}

function getTopLevelDragInfo(
  doc: ProseMirrorNode,
  pos: number,
): TopLevelDragInfo | null {
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (offset === pos) {
      return { index, node, pos };
    }
    offset += node.nodeSize;
  }

  return null;
}

function getTopLevelInsertPos(doc: ProseMirrorNode, index: number): number {
  let pos = 0;
  const clampedIndex = Math.max(0, Math.min(index, doc.childCount));
  for (let childIndex = 0; childIndex < clampedIndex; childIndex += 1) {
    pos += doc.child(childIndex).nodeSize;
  }
  return pos;
}

function getTopLevelNodeDom(
  view: EditorView,
  pos: number,
): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

function getDropIndexFromClientY(
  editor: Editor,
  session: BlockDragSession,
  clientY: number,
): number | null {
  const info = getTopLevelDragInfo(editor.state.doc, session.pos);
  if (!info || info.node.type !== session.node.type) return null;

  const currentDom = getTopLevelNodeDom(editor.view, info.pos);
  const deltaY = clientY - session.startY;

  if (currentDom) {
    const currentRect = currentDom.getBoundingClientRect();
    const isInsideCurrentBlock =
      clientY >= currentRect.top && clientY <= currentRect.bottom;

    if (isInsideCurrentBlock && Math.abs(deltaY) >= 8) {
      return deltaY > 0
        ? Math.min(info.index + 2, editor.state.doc.childCount)
        : Math.max(info.index - 1, 0);
    }
  }

  let pos = 0;
  for (let index = 0; index < editor.state.doc.childCount; index += 1) {
    const node = editor.state.doc.child(index);
    const dom = getTopLevelNodeDom(editor.view, pos);
    if (dom) {
      const rect = dom.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
      if (clientY <= rect.bottom) return index + 1;
    }
    pos += node.nodeSize;
  }

  return editor.state.doc.childCount;
}

function positionBlockDropIndicator(
  editor: Editor,
  session: BlockDragSession,
  dropIndex: number,
): void {
  const parent = editor.view.dom.parentElement;
  if (!parent) return;

  const doc = editor.state.doc;
  const editorRect = editor.view.dom.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const beforePos =
    dropIndex < doc.childCount ? getTopLevelInsertPos(doc, dropIndex) : null;
  const beforeDom =
    beforePos == null ? null : getTopLevelNodeDom(editor.view, beforePos);
  const lastPos =
    doc.childCount > 0 ? getTopLevelInsertPos(doc, doc.childCount - 1) : null;
  const lastDom = lastPos == null ? null : getTopLevelNodeDom(editor.view, lastPos);
  const lineY = beforeDom
    ? beforeDom.getBoundingClientRect().top
    : lastDom
      ? lastDom.getBoundingClientRect().bottom
      : editorRect.top;

  session.indicator.hidden = false;
  session.indicator.style.left = `${editorRect.left - parentRect.left}px`;
  session.indicator.style.top = `${lineY - parentRect.top}px`;
  session.indicator.style.width = `${editorRect.width}px`;
}

function hideBlockDropIndicator(session: BlockDragSession | null): void {
  if (!session) return;
  session.indicator.hidden = true;
}

function commitBlockDragMove(
  editor: Editor,
  session: BlockDragSession,
): boolean {
  if (!editor.isEditable || session.latestDropIndex == null) return false;

  const doc = editor.state.doc;
  const info = getTopLevelDragInfo(doc, session.pos);
  if (!info || info.node.type !== session.node.type) return false;

  const dropIndex = Math.max(0, Math.min(session.latestDropIndex, doc.childCount));
  if (dropIndex === info.index || dropIndex === info.index + 1) return false;

  const from = info.pos;
  const to = from + info.node.nodeSize;
  const rawInsertPos = getTopLevelInsertPos(doc, dropIndex);
  const insertPos = rawInsertPos > from ? rawInsertPos - info.node.nodeSize : rawInsertPos;
  const transaction = editor.state.tr.delete(from, to).insert(insertPos, info.node);

  const movedNode = transaction.doc.nodeAt(insertPos);
  if (movedNode && NodeSelection.isSelectable(movedNode)) {
    transaction.setSelection(NodeSelection.create(transaction.doc, insertPos));
  }

  editor.view.dispatch(closeHistory(transaction.setMeta('uiEvent', 'drop')));
  return true;
}

function getSelectionDragTarget(state: EditorState): DragTarget {
  const { selection } = state;

  if (
    selection instanceof NodeSelection &&
    getEditorDragHandleRuleDeduction({
      nodeName: selection.node.type.name,
      isInline: selection.node.isInline,
      isText: selection.node.isText,
    }) < EXCLUDE_FROM_DRAG_TARGETS
  ) {
    return {
      node: selection.node,
      pos: selection.from,
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const pos = $from.before(depth);
    if (!SELECTION_ANCESTOR_DRAG_TARGET_NODE_NAMES.has(node.type.name)) {
      continue;
    }

    if (
      getEditorDragHandleRuleDeduction({
        nodeName: node.type.name,
        parentName: depth > 0 ? $from.node(depth - 1).type.name : null,
        ancestorNames: Array.from({ length: depth - 1 }, (_, index) =>
          $from.node(index + 1).type.name,
        ),
        isInline: node.isInline,
        isText: node.isText,
      }) < EXCLUDE_FROM_DRAG_TARGETS
    ) {
      return { node, pos };
    }
  }

  return null;
}

export const EDITOR_DRAG_HANDLE_NESTED_OPTIONS: NestedOptions = {
  defaultRules: false,
  edgeDetection: {
    edges: ['left', 'top'],
    threshold: 24,
    strength: 500,
  },
  rules: [knowledgeBaseDragTargetRules],
};

export function EditorDragHandle({ editor }: { editor: Editor }) {
  const tableDragOffset = useTableDragOffset(editor);
  const imageDragOffset = useImageDragOffset(editor);
  const {
    cancelDrag: cancelTableDrag,
    onElementDragEnd: onTableElementDragEnd,
    onElementDragStart: onTableElementDragStart,
    onNodeChange: onTableNodeChange,
  } = tableDragOffset;
  const {
    cancelDrag: cancelImageDrag,
    onElementDragEnd: onImageElementDragEnd,
    onElementDragStart: onImageElementDragStart,
    onNodeChange: onImageNodeChange,
  } = imageDragOffset;
  const [dragHandleLabel, setDragHandleLabel] = useState('Drag block');
  const currentTargetRef = useRef<{
    node: ProseMirrorNode;
    pos: number;
  } | null>(null);
  const blockDragSessionRef = useRef<BlockDragSession | null>(null);
  const isEditable = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      !currentEditor.isDestroyed && currentEditor.isEditable,
  });
  const selectionDragTarget = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor.isDestroyed || !currentEditor.isEditable
        ? null
        : getSelectionDragTarget(currentEditor.state),
  });

  const onNodeChange = useCallback(
    (args: { node: ProseMirrorNode | null; pos: number }) => {
      onTableNodeChange(args);
      onImageNodeChange(args);
      currentTargetRef.current = args.node
        ? {
            node: args.node,
            pos: args.pos,
          }
        : null;
      setDragHandleLabel(getDragHandleLabel(args.node?.type.name));
    },
    [onImageNodeChange, onTableNodeChange],
  );

  const finishBlockDragSession = useCallback((commit: boolean) => {
    const session = blockDragSessionRef.current;
    if (!session) return;

    blockDragSessionRef.current = null;
    session.cleanup();
    if (commit) {
      commitBlockDragMove(editor, session);
    }
  }, [editor]);

  const startBlockDragSession = useCallback(
    (event: DragEvent, target: DragTarget) => {
      if (!target || editor.isDestroyed || !editor.isEditable) return;

      finishBlockDragSession(false);

      const info = getTopLevelDragInfo(editor.state.doc, target.pos);
      if (!info || info.node.type !== target.node.type) return;

      const ownerDocument = editor.view.dom.ownerDocument;
      const parent = editor.view.dom.parentElement;
      if (!parent) return;

      const indicator = ownerDocument.createElement('div');
      indicator.className = 'kb-block-drop-indicator';
      indicator.hidden = true;
      parent.append(indicator);

      const handleDragOver = (dragEvent: DragEvent) => {
        if (blockDragSessionRef.current !== session) return;

        dragEvent.preventDefault();
        const dropIndex = getDropIndexFromClientY(
          editor,
          session,
          dragEvent.clientY,
        );
        session.latestDropIndex = dropIndex;

        if (
          dropIndex == null ||
          dropIndex === session.index ||
          dropIndex === session.index + 1
        ) {
          hideBlockDropIndicator(session);
          return;
        }

        positionBlockDropIndicator(editor, session, dropIndex);
      };

      const handleDrop = (dropEvent: DragEvent) => {
        if (blockDragSessionRef.current !== session) return;

        handleDragOver(dropEvent);
        finishBlockDragSession(true);
      };

      const handleDragEnd = () => finishBlockDragSession(false);
      const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key !== 'Escape') return;

        keyboardEvent.preventDefault();
        cancelTableDrag();
        cancelImageDrag();
        finishBlockDragSession(false);
      };

      const session: BlockDragSession = {
        ...info,
        indicator,
        latestDropIndex: null,
        startY: event.clientY,
        cleanup: () => {
          ownerDocument.removeEventListener('dragover', handleDragOver, true);
          ownerDocument.removeEventListener('drop', handleDrop, true);
          ownerDocument.removeEventListener('dragend', handleDragEnd, true);
          ownerDocument.removeEventListener('keydown', handleKeyDown, true);
          indicator.remove();
        },
      };

      ownerDocument.addEventListener('dragover', handleDragOver, true);
      ownerDocument.addEventListener('drop', handleDrop, true);
      ownerDocument.addEventListener('dragend', handleDragEnd, true);
      ownerDocument.addEventListener('keydown', handleKeyDown, true);
      blockDragSessionRef.current = session;
    },
    [
      editor,
      finishBlockDragSession,
      cancelImageDrag,
      cancelTableDrag,
    ],
  );

  const onElementDragStart = useCallback((event: DragEvent) => {
    const target = currentTargetRef.current;
    if (target && !editor.isDestroyed && editor.isEditable) {
      editor.view.dispatch(closeHistory(editor.state.tr));
    }

    onTableElementDragStart(event);
    onImageElementDragStart(event);
    startBlockDragSession(event, target);
    pointDragStartAtNode(event, editor, target);
  }, [
    editor,
    onImageElementDragStart,
    onTableElementDragStart,
    startBlockDragSession,
  ]);

  const onElementDragEnd = useCallback((event: DragEvent) => {
    onTableElementDragEnd(event);
    onImageElementDragEnd(event);
    finishBlockDragSession(false);
  }, [
    finishBlockDragSession,
    onImageElementDragEnd,
    onTableElementDragEnd,
  ]);

  const selectCurrentTarget = () => {
    const target = currentTargetRef.current;
    if (!target || editor.isDestroyed || !editor.isEditable) return;

    const node = editor.state.doc.nodeAt(target.pos);
    if (!node || !node.eq(target.node)) return;

    editor.view.dispatch(
      closeHistory(
        editor.state.tr
          .setSelection(NodeSelection.create(editor.state.doc, target.pos))
          .scrollIntoView(),
      ),
    );
    editor.view.focus();
  };

  useEffect(() => {
    if (!selectionDragTarget || editor.isDestroyed || !editor.isEditable) {
      return;
    }

    const dom = editor.view.nodeDOM(selectionDragTarget.pos);
    if (!(dom instanceof HTMLElement)) return;

    const handle =
      editor.view.dom.parentElement?.querySelector<HTMLElement>(
        '.kb-official-drag-handle',
      ) ?? null;
    const button = handle?.querySelector<HTMLButtonElement>(
      '.kb-block-drag-handle__button',
    );
    if (!handle || !button) return;

    const positionHandle = () => {
      if (editor.isDestroyed) return;

      const rect = dom.getBoundingClientRect();
      const parentElement = editor.view.dom.parentElement;
      if (!parentElement) return;

      const parentRect = parentElement.getBoundingClientRect();
      handle.style.visibility = '';
      handle.style.pointerEvents = 'auto';
      handle.style.left = `${Math.max(
        0,
        rect.left - parentRect.left - DRAG_HANDLE_SIZE_PX - 4,
      )}px`;
      handle.style.top = `${Math.max(
        0,
        rect.top - parentRect.top - DRAG_HANDLE_SIZE_PX,
      )}px`;

      const label = getDragHandleLabel(selectionDragTarget.node.type.name);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    };

    positionHandle();

    currentTargetRef.current = selectionDragTarget;
    onTableNodeChange({
      node: selectionDragTarget.node,
      pos: selectionDragTarget.pos,
    });
    onImageNodeChange({
      node: selectionDragTarget.node,
      pos: selectionDragTarget.pos,
    });

    const rect = dom.getBoundingClientRect();
    editor.view.dom.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
        clientY: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
      }),
    );
    const frame = requestAnimationFrame(positionHandle);
    return () => cancelAnimationFrame(frame);
  }, [
    editor,
    onImageNodeChange,
    onTableNodeChange,
    selectionDragTarget,
  ]);

  useEffect(
    () => () => {
      const session = blockDragSessionRef.current;
      blockDragSessionRef.current = null;
      session?.cleanup();
    },
    [],
  );

  if (!isEditable) return null;

  return (
    <DragHandle
      editor={editor}
      className="kb-block-drag-handle kb-official-drag-handle"
      nested={EDITOR_DRAG_HANDLE_NESTED_OPTIONS}
      onNodeChange={onNodeChange}
      onElementDragStart={onElementDragStart}
      onElementDragEnd={onElementDragEnd}
      computePositionConfig={{
        placement: 'left-start',
        strategy: 'absolute',
      }}
      dragImageProperties={[
        'background-color',
        'border',
        'border-radius',
        'box-shadow',
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'margin',
        'padding',
      ]}
    >
      <button
        type="button"
        className="kb-block-drag-handle__button"
        aria-label={dragHandleLabel}
        title={dragHandleLabel}
        tabIndex={-1}
        onClick={(event) => {
          event.preventDefault();
          selectCurrentTarget();
        }}
      >
        <span className="sr-only">{dragHandleLabel}</span>
      </button>
    </DragHandle>
  );
}
