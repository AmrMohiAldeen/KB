import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  applyImageOffsetPct,
  normalizeImageOffsetPct,
  readImageOffsetPct,
  readImageWidthPx,
} from '../imageDimensions';
import {
  getImageElementAtPos,
  getImageNodeAt,
} from '../imageDom';
import { BLOCK_IMAGE_NODE_NAME } from '../imageTypes';

export type ImageDragOffsetSession = {
  imagePos: number;
  imageNode: ProseMirrorNode;
  image: HTMLImageElement;
  startX: number;
  startOffsetPct: number;
  latestOffsetPct: number;
  imageWidthPx: number;
  containerWidthPx: number;
  hadDatasetOffset: boolean;
  datasetOffset?: string;
  styleMarginLeft: string;
  styleOffset: string;
};

function getImageContainer(image: HTMLImageElement): HTMLElement {
  return image.parentElement ?? image.ownerDocument.body;
}

function readContainerWidthPx(image: HTMLImageElement): number {
  const width = getImageContainer(image).getBoundingClientRect().width;

  return typeof width === 'number' && Number.isFinite(width) && width > 0
    ? width
    : 1;
}

export function createImageDragOffsetSession(
  editor: Editor,
  imagePos: number,
  startX: number,
): ImageDragOffsetSession | null {
  if (!editor.isEditable) return null;

  const imageNode = getImageNodeAt(editor.state.doc, imagePos);
  const image = getImageElementAtPos(editor.view, imagePos);
  if (!imageNode || imageNode.type.name !== BLOCK_IMAGE_NODE_NAME || !image) {
    return null;
  }

  const imageWidthPx = readImageWidthPx(image);
  const containerWidthPx = readContainerWidthPx(image);
  const container = getImageContainer(image);
  const startOffsetPct = readImageOffsetPct(image, container, imageWidthPx);

  return {
    imagePos,
    imageNode,
    image,
    startX,
    startOffsetPct,
    latestOffsetPct: startOffsetPct,
    imageWidthPx,
    containerWidthPx,
    hadDatasetOffset: image.dataset.imageOffsetPct != null,
    datasetOffset: image.dataset.imageOffsetPct,
    styleMarginLeft: image.style.marginLeft,
    styleOffset: image.style.getPropertyValue('--image-offset-pct'),
  };
}

export function updateImageDragOffsetPreview(
  session: ImageDragOffsetSession,
  clientX: number,
): number {
  const deltaPct =
    ((clientX - session.startX) / session.containerWidthPx) * 100;

  session.latestOffsetPct = applyImageOffsetPct(
    session.image,
    session.startOffsetPct + deltaPct,
    session.imageWidthPx,
    session.containerWidthPx,
  );

  return session.latestOffsetPct;
}

function findMatchingImagePos(
  editor: Editor,
  session: ImageDragOffsetSession,
): number | null {
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === BLOCK_IMAGE_NODE_NAME && node.eq(session.imageNode)) {
      foundPos = pos;
      return false;
    }

    return true;
  });

  return foundPos;
}

export function resolveImageDragOffsetCommitPos(
  editor: Editor,
  session: ImageDragOffsetSession,
): number | null {
  if (getImageNodeAt(editor.state.doc, session.imagePos)) {
    return session.imagePos;
  }

  return findMatchingImagePos(editor, session);
}

export function commitImageDragOffset(
  editor: Editor,
  session: ImageDragOffsetSession,
): boolean {
  if (!editor.isEditable) return false;

  const imagePos = resolveImageDragOffsetCommitPos(editor, session);
  if (imagePos == null) return false;

  const imageNode = getImageNodeAt(editor.state.doc, imagePos);
  if (!imageNode || imageNode.type.name !== BLOCK_IMAGE_NODE_NAME) return false;

  const imageOffsetPct = normalizeImageOffsetPct(
    session.latestOffsetPct,
    session.imageWidthPx,
    session.containerWidthPx,
  );

  if (imageNode.attrs.imageOffsetPct === imageOffsetPct) return false;

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(imagePos, undefined, {
      ...imageNode.attrs,
      imageOffsetPct,
    }),
  );
  return true;
}

export function restoreImageDragOffsetPreview(
  session: ImageDragOffsetSession,
): void {
  if (session.hadDatasetOffset) {
    session.image.dataset.imageOffsetPct = session.datasetOffset ?? '';
  } else {
    delete session.image.dataset.imageOffsetPct;
  }

  session.image.style.marginLeft = session.styleMarginLeft;

  if (session.styleOffset) {
    session.image.style.setProperty('--image-offset-pct', session.styleOffset);
  } else {
    session.image.style.removeProperty('--image-offset-pct');
  }
}

