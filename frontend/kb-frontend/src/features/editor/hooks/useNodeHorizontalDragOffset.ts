'use client';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef } from 'react';

type ActiveDragTarget = {
  node: ProseMirrorNode;
  pos: number;
} | null;

export type NodeHorizontalDragOffsetHandlers = {
  onNodeChange: (target: {
    node: ProseMirrorNode | null;
    pos: number;
  }) => void;
  onElementDragStart: (event: DragEvent) => void;
  onElementDragEnd: (event: DragEvent) => void;
  cancelDrag: () => void;
};

type NodeHorizontalDragOffsetOptions<Session> = {
  editor: Editor;
  nodeName: string;
  createSession: (
    editor: Editor,
    pos: number,
    startClientX: number,
  ) => Session | null;
  updatePreview: (session: Session, clientX: number) => void;
  commit: (editor: Editor, session: Session) => boolean;
  restorePreview: (session: Session) => void;
};

function getDragClientX(event: DragEvent): number | null {
  if (!Number.isFinite(event.clientX)) return null;

  // Some browsers emit a final drag event at 0,0. Treat that as missing data so
  // the last real dragover position wins.
  if (event.clientX === 0 && event.clientY === 0) return null;

  return event.clientX;
}

export function useNodeHorizontalDragOffset<Session>({
  editor,
  nodeName,
  createSession,
  updatePreview: updateSessionPreview,
  commit,
  restorePreview,
}: NodeHorizontalDragOffsetOptions<Session>): NodeHorizontalDragOffsetHandlers {
  const activeTargetRef = useRef<ActiveDragTarget>(null);
  const sessionRef = useRef<Session | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingCommitRef = useRef<number | null>(null);
  const didDropRef = useRef(false);

  const cleanupListeners = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const updatePreview = useCallback(
    (event: DragEvent) => {
      const session = sessionRef.current;
      const clientX = getDragClientX(event);
      if (!session || clientX == null) return;

      updateSessionPreview(session, clientX);
    },
    [updateSessionPreview],
  );

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

        if (!commit(editor, session)) {
          restorePreview(session);
        }
      }, 0);
    },
    [cleanupListeners, commit, editor, restorePreview, updatePreview],
  );

  const cancelDrag = useCallback(() => {
    cleanupListeners();

    const pendingCommit = pendingCommitRef.current;
    if (pendingCommit != null) {
      const ownerWindow = editor.view.dom.ownerDocument.defaultView ?? window;
      ownerWindow.clearTimeout(pendingCommit);
      pendingCommitRef.current = null;
    }

    const session = sessionRef.current;
    sessionRef.current = null;
    didDropRef.current = false;
    if (session) {
      restorePreview(session);
    }
  }, [cleanupListeners, editor, restorePreview]);

  const onNodeChange = useCallback(
    ({ node, pos }: { node: ProseMirrorNode | null; pos: number }) => {
      activeTargetRef.current = node ? { node, pos } : null;
    },
    [],
  );

  const onElementDragStart = useCallback(
    (event: DragEvent) => {
      cleanupListeners();
      didDropRef.current = false;

      const target = activeTargetRef.current;
      if (!target || target.node.type.name !== nodeName) return;

      const clientX = getDragClientX(event);
      if (clientX == null) return;

      const session = createSession(editor, target.pos, clientX);
      if (!session) return;

      sessionRef.current = session;

      const ownerDocument = editor.view.dom.ownerDocument;
      const handleDrag = (dragEvent: DragEvent) => updatePreview(dragEvent);
      const handleDrop = (dropEvent: DragEvent) => {
        didDropRef.current = true;
        finishDrag(dropEvent);
      };

      ownerDocument.addEventListener('drag', handleDrag);
      ownerDocument.addEventListener('dragover', handleDrag);
      ownerDocument.addEventListener('drop', handleDrop);

      cleanupRef.current = () => {
        ownerDocument.removeEventListener('drag', handleDrag);
        ownerDocument.removeEventListener('dragover', handleDrag);
        ownerDocument.removeEventListener('drop', handleDrop);
      };
    },
    [
      cleanupListeners,
      createSession,
      editor,
      finishDrag,
      nodeName,
      updatePreview,
    ],
  );

  const onElementDragEnd = useCallback(
    (event: DragEvent) => {
      if (didDropRef.current || pendingCommitRef.current != null) {
        finishDrag(event);
        didDropRef.current = false;
      } else {
        cancelDrag();
      }
    },
    [cancelDrag, finishDrag],
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
      didDropRef.current = false;
    },
    [cleanupListeners, editor],
  );

  return {
    onNodeChange,
    onElementDragStart,
    onElementDragEnd,
    cancelDrag,
  };
}
