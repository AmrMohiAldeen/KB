'use client';

import type { Editor } from '@tiptap/react';
import { useNodeHorizontalDragOffset } from '../../../hooks/useNodeHorizontalDragOffset';
import {
  commitImageDragOffset,
  createImageDragOffsetSession,
  restoreImageDragOffsetPreview,
  updateImageDragOffsetPreview,
  type ImageDragOffsetSession,
} from './imageDragOffset';
import { BLOCK_IMAGE_NODE_NAME } from '../imageTypes';

export function useImageDragOffset(editor: Editor) {
  return useNodeHorizontalDragOffset<ImageDragOffsetSession>({
    editor,
    nodeName: BLOCK_IMAGE_NODE_NAME,
    createSession: createImageDragOffsetSession,
    updatePreview: updateImageDragOffsetPreview,
    commit: commitImageDragOffset,
    restorePreview: restoreImageDragOffsetPreview,
  });
}
