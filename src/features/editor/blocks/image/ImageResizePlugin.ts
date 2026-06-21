import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { logDevError } from '../../lib/utils/logDevError';
import {
  applyImageOffsetPct,
  applyImageWidthPreview,
  clampImageWidthPx,
  normalizeImageOffsetPct,
  readImageOffsetPct,
  readImageWidthPx,
} from './imageDimensions';
import {
  getClosestHTMLElement,
  getImageElementAtPos,
  getImageNodeAt,
  getOwnerWindow,
  getSelectedImage,
  isImageNode,
  positionOverlayAtRect,
  requestViewAnimationFrame,
} from './imageDom';
import { BLOCK_IMAGE_NODE_NAME } from './imageTypes';
import {
  startMouseDragSession,
  type MouseDragSession,
} from '../../lib/dom/mouseDragSession';

type ImageStyleSnapshot = {
  widthAttribute: string | null;
  datasetWidth: string | undefined;
  styleWidth: string;
  datasetOffset: string | undefined;
  styleMarginLeft: string;
  styleOffset: string;
};

type ImageResizeDrag = {
  imagePos: number;
  startX: number;
  startWidthPx: number;
  startOffsetPct: number;
  containerWidthPx: number;
  snapshot: ImageStyleSnapshot;
};

export const imageResizePluginKey = new PluginKey<null>(
  'imageResizePlugin',
);

function getContainerWidthPx(image: HTMLImageElement): number {
  const width = image.parentElement?.getBoundingClientRect().width;
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    ? width
    : 1;
}

function createImageStyleSnapshot(image: HTMLImageElement): ImageStyleSnapshot {
  return {
    widthAttribute: image.getAttribute('width'),
    datasetWidth: image.dataset.imageWidth,
    styleWidth: image.style.width,
    datasetOffset: image.dataset.imageOffsetPct,
    styleMarginLeft: image.style.marginLeft,
    styleOffset: image.style.getPropertyValue('--image-offset-pct'),
  };
}

function restoreImageStyleSnapshot(
  image: HTMLImageElement,
  snapshot: ImageStyleSnapshot,
): void {
  if (snapshot.widthAttribute == null) {
    image.removeAttribute('width');
  } else {
    image.setAttribute('width', snapshot.widthAttribute);
  }

  if (snapshot.datasetWidth == null) {
    delete image.dataset.imageWidth;
  } else {
    image.dataset.imageWidth = snapshot.datasetWidth;
  }

  if (snapshot.datasetOffset == null) {
    delete image.dataset.imageOffsetPct;
  } else {
    image.dataset.imageOffsetPct = snapshot.datasetOffset;
  }

  image.style.width = snapshot.styleWidth;
  image.style.marginLeft = snapshot.styleMarginLeft;

  if (snapshot.styleOffset) {
    image.style.setProperty('--image-offset-pct', snapshot.styleOffset);
  } else {
    image.style.removeProperty('--image-offset-pct');
  }
}

function positionImageResizeHandle(
  view: EditorView,
  imagePos: number,
): void {
  const handle = view.dom.querySelector<HTMLElement>('.kb-image-resize-handle');
  const image = getImageElementAtPos(view, imagePos);
  if (!handle || !image) return;

  const imageRect = image.getBoundingClientRect();
  positionOverlayAtRect(view, handle, {
    left: imageRect.right - 6,
    top: imageRect.bottom - 6,
    width: 12,
    height: 12,
  });
}

function commitImageWidth(
  view: EditorView,
  imagePos: number,
  width: number,
): boolean {
  if (!view.editable) return false;

  const imageNode = getImageNodeAt(view.state.doc, imagePos);
  if (!imageNode) return false;

  const image = getImageElementAtPos(view, imagePos);
  const containerWidthPx = image ? getContainerWidthPx(image) : Number.POSITIVE_INFINITY;
  const nextWidth = clampImageWidthPx(width, containerWidthPx);
  const nextAttrs: Record<string, unknown> = {
    ...imageNode.attrs,
    width: nextWidth,
  };

  if (imageNode.type.name === BLOCK_IMAGE_NODE_NAME) {
    nextAttrs.imageOffsetPct = normalizeImageOffsetPct(
      imageNode.attrs.imageOffsetPct,
      nextWidth,
      containerWidthPx,
    );
  }

  if (
    imageNode.attrs.width === nextAttrs.width &&
    imageNode.attrs.imageOffsetPct === nextAttrs.imageOffsetPct
  ) {
    return false;
  }

  try {
    view.dispatch(
      closeHistory(view.state.tr.setNodeMarkup(imagePos, undefined, nextAttrs)),
    );
    return true;
  } catch (error) {
    logDevError('Image width commit failed:', error);
    return false;
  }
}

function setImageResizeCursor(view: EditorView, active: boolean): void {
  view.dom.classList.toggle('resize-cursor-image', active);
}

function hideImageResizeHandles(view: EditorView): void {
  view.dom
    .querySelectorAll<HTMLElement>('.kb-image-resize-handle')
    .forEach((handle) => {
      handle.hidden = true;
    });
}

export function ImageResizePlugin() {
  let activeSession: MouseDragSession | null = null;
  let editable = false;

  const startImageResize = (
    view: EditorView,
    imagePos: number,
    event: MouseEvent,
  ): boolean => {
    if (!view.editable || event.button !== 0 || activeSession) return false;

    const image = getImageElementAtPos(view, imagePos);
    if (!image) return false;

    event.preventDefault();
    setImageResizeCursor(view, true);

    const container = image.parentElement ?? view.dom;
    const containerWidthPx = getContainerWidthPx(image);
    const startWidthPx = readImageWidthPx(image);
    const imageNode = getImageNodeAt(view.state.doc, imagePos);
    const drag: ImageResizeDrag = {
      imagePos,
      startX: event.clientX,
      startWidthPx,
      startOffsetPct:
        imageNode?.type.name === BLOCK_IMAGE_NODE_NAME
          ? readImageOffsetPct(image, container, startWidthPx)
          : 0,
      containerWidthPx,
      snapshot: createImageStyleSnapshot(image),
    };
    let latestWidth = drag.startWidthPx;

    const finish = (commit: boolean) => {
      activeSession = null;
      setImageResizeCursor(view, false);

      const currentImage = getImageElementAtPos(view, drag.imagePos);
      if (currentImage) restoreImageStyleSnapshot(currentImage, drag.snapshot);

      if (commit && latestWidth !== drag.startWidthPx) {
        commitImageWidth(view, drag.imagePos, latestWidth);
      }
    };

    activeSession = startMouseDragSession({
      window: getOwnerWindow(view),
      onMove: (moveEvent) => {
        const currentImage = getImageElementAtPos(view, drag.imagePos);
        if (!currentImage) {
          activeSession?.cancel();
          return;
        }

        latestWidth = applyImageWidthPreview(
          currentImage,
          drag.startWidthPx + moveEvent.clientX - drag.startX,
          drag.containerWidthPx,
        );

        const currentImageNode = getImageNodeAt(view.state.doc, drag.imagePos);
        if (currentImageNode?.type.name === BLOCK_IMAGE_NODE_NAME) {
          applyImageOffsetPct(
            currentImage,
            drag.startOffsetPct,
            latestWidth,
            drag.containerWidthPx,
          );
        }

        positionImageResizeHandle(view, drag.imagePos);
      },
      onCommit: () => finish(true),
      onCancel: () => finish(false),
    });

    return true;
  };

  return new Plugin<null>({
    key: imageResizePluginKey,
    state: {
      init: () => null,
      apply: () => null,
    },
    props: {
      handleClickOn(view, _pos, node, nodePos, event, direct) {
        if (!view.editable || !direct || !isImageNode(node)) return false;

        event.preventDefault();
        view.dispatch(
          view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)),
        );
        return true;
      },
      decorations(state) {
        const selected = getSelectedImage(state);
        if (!editable || !selected) return null;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            selected.pos,
            (view) => {
              const element = view.dom.ownerDocument.createElement('button');
              element.type = 'button';
              element.className = 'kb-image-resize-handle';
              element.contentEditable = 'false';
              element.draggable = false;
              element.setAttribute('aria-label', 'Resize image');
              element.addEventListener('mousedown', (event) => {
                if (startImageResize(view, selected.pos, event)) {
                  event.stopPropagation();
                }
              });
              requestViewAnimationFrame(view, () =>
                positionImageResizeHandle(view, selected.pos),
              );
              return element;
            },
            { side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const handle = getClosestHTMLElement(
            view,
            event.target,
            '.kb-image-resize-handle',
          );
          if (!handle) return false;

          const selected = getSelectedImage(view.state);
          return selected ? startImageResize(view, selected.pos, event) : false;
        },
      },
    },
    view: (view) => {
      editable = view.editable;

      return {
        update(nextView, previousState) {
          if (activeSession && previousState.doc !== nextView.state.doc) {
            activeSession.cancel();
          }

          editable = nextView.editable;

          if (!nextView.editable) {
            activeSession?.cancel();
            setImageResizeCursor(nextView, false);
            hideImageResizeHandles(nextView);
          }

          const selected = getSelectedImage(nextView.state);
          if (selected) {
            requestViewAnimationFrame(nextView, () =>
              positionImageResizeHandle(nextView, selected.pos),
            );
          }
        },
        destroy() {
          activeSession?.cancel();
          setImageResizeCursor(view, false);
        },
      };
    },
  });
}
