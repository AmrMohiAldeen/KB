'use client';

import type { Editor } from '@tiptap/react';
import { useNodeHorizontalDragOffset } from '../../../hooks/useNodeHorizontalDragOffset';
import {
  commitTableDragOffset,
  createTableDragOffsetSession,
  restoreTableDragOffsetPreview,
  updateTableDragOffsetPreview,
  type TableDragOffsetSession,
} from './tableDragOffset';

export function useTableDragOffset(editor: Editor) {
  return useNodeHorizontalDragOffset<TableDragOffsetSession>({
    editor,
    nodeName: 'table',
    createSession: createTableDragOffsetSession,
    updatePreview: updateTableDragOffsetPreview,
    commit: commitTableDragOffset,
    restorePreview: restoreTableDragOffsetPreview,
  });
}
