'use client';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef } from 'react';
import {
  commitTableDragOffset,
  createTableDragOffsetSession,
  restoreTableDragOffsetPreview,
  updateTableDragOffsetPreview,
  type TableDragOffsetSession,
} from './tableDragOffset';

type ActiveDragTarget = {
  node: ProseMirrorNode;
  pos: number;
} | null;

function getDragClientX(event: DragEvent): number | null {
  if (!Number.isFinite(event.clientX)) return null;

  // Some browsers emit a final drag event at 0,0. Treat that as missing data so
  // the last real dragover position wins.
  if (event.clientX === 0 && event.clientY === 0) return null;

  return event.clientX;
}

export function useTableDragOffset(editor: Editor) {
  const activeTargetRef = useRef<ActiveDragTarget>(null);
  const sessionRef = useRef<TableDragOffsetSession | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingCommitRef = useRef<number | null>(null);

  const cleanupListeners = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const updatePreview = useCallback((event: DragEvent) => {
    const session = sessionRef.current;
    const clientX = getDragClientX(event);
    if (!session || clientX == null) return;

    updateTableDragOffsetPreview(session, clientX);
  }, []);

  const finishDrag = useCallback(
    (event?: DragEvent) => {
      if (event) updatePreview(event);
      cleanupListeners();

      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session) return;

      const ownerWindow = editor.view.dom.ownerDocument.defaultView ?? window;
      pendingCommitRef.current = ownerWindow.setTimeout(() => {
        pendingCommitRef.current = null;

        if (!commitTableDragOffset(editor, session)) {
          restoreTableDragOffsetPreview(session);
        }
      }, 0);
    },
    [cleanupListeners, editor, updatePreview],
  );

  const onNodeChange = useCallback(
    ({ node, pos }: { node: ProseMirrorNode | null; pos: number }) => {
      activeTargetRef.current = node ? { node, pos } : null;
    },
    [],
  );

  const onElementDragStart = useCallback(
    (event: DragEvent) => {
      cleanupListeners();

      const target = activeTargetRef.current;
      if (!target || target.node.type.name !== 'table') return;

      const clientX = getDragClientX(event);
      if (clientX == null) return;

      const session = createTableDragOffsetSession(editor, target.pos, clientX);
      if (!session) return;

      sessionRef.current = session;

      const ownerDocument = editor.view.dom.ownerDocument;
      const handleDrag = (dragEvent: DragEvent) => updatePreview(dragEvent);
      const handleDrop = (dropEvent: DragEvent) => finishDrag(dropEvent);

      ownerDocument.addEventListener('drag', handleDrag);
      ownerDocument.addEventListener('dragover', handleDrag);
      ownerDocument.addEventListener('drop', handleDrop);

      cleanupRef.current = () => {
        ownerDocument.removeEventListener('drag', handleDrag);
        ownerDocument.removeEventListener('dragover', handleDrag);
        ownerDocument.removeEventListener('drop', handleDrop);
      };
    },
    [cleanupListeners, editor, finishDrag, updatePreview],
  );

  const onElementDragEnd = useCallback(
    (event: DragEvent) => {
      finishDrag(event);
    },
    [finishDrag],
  );

  useEffect(
    () => () => {
      cleanupListeners();
      const pendingCommit = pendingCommitRef.current;
      if (pendingCommit != null) {
        const ownerWindow = editor.view.dom.ownerDocument.defaultView ?? window;
        ownerWindow.clearTimeout(pendingCommit);
      }
      sessionRef.current = null;
    },
    [cleanupListeners, editor],
  );

  return {
    onNodeChange,
    onElementDragStart,
    onElementDragEnd,
  };
}
