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
import {
  getElementContentWidthPx,
  getNearestVisibleResizeContainer,
  getResizeContainerWidthPx,
  isVisibleResizeElement,
  stopResizeStartEvent,
} from '../../lib/dom/resizeDom';

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
  image: HTMLImageElement;
  startX: number;
  startWidthPx: number;
  startOffsetPct: number;
  containerWidthPx: number;
  snapshot: ImageStyleSnapshot;
};

export const imageResizePluginKey = new PluginKey<null>(
  'imageResizePlugin',
);

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

  if (!isVisibleResizeElement(image)) {
    handle.hidden = true;
    return;
  }

  handle.hidden = false;
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
  containerWidthPx?: number,
): boolean {
  if (!view.editable) return false;

  const imageNode = getImageNodeAt(view.state.doc, imagePos);
  if (!imageNode) return false;

  const image = getImageElementAtPos(view, imagePos);
  const maxWidthPx =
    containerWidthPx ??
    (image ? getResizeContainerWidthPx(view, image) : Number.POSITIVE_INFINITY);
  const nextWidth = clampImageWidthPx(width, maxWidthPx);
  const nextAttrs: Record<string, unknown> = {
    ...imageNode.attrs,
    width: nextWidth,
  };

  if (imageNode.type.name === BLOCK_IMAGE_NODE_NAME) {
    nextAttrs.imageOffsetPct = normalizeImageOffsetPct(
      imageNode.attrs.imageOffsetPct,
      nextWidth,
      maxWidthPx,
    );
  }

  if (
    imageNode.attrs.width === nextAttrs.width &&
    imageNode.attrs.imageOffsetPct === nextAttrs.imageOffsetPct
  ) {
    return true;
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

function getCurrentDragImage(
  view: EditorView,
  drag: Pick<ImageResizeDrag, 'image' | 'imagePos'>,
): HTMLImageElement | null {
  if (drag.image.isConnected && view.dom.contains(drag.image)) {
    return drag.image;
  }

  return getImageElementAtPos(view, drag.imagePos);
}

export function ImageResizePlugin() {
  let activeSession: MouseDragSession | null = null;
  let editable = false;
  let resizeObserver: ResizeObserver | null = null;
  let observedImagePos: number | null = null;

  const clearResizeObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedImagePos = null;
  };

  const observeSelectedImage = (view: EditorView) => {
    const selected = getSelectedImage(view.state);
    if (!selected) {
      clearResizeObserver();
      return;
    }

    if (observedImagePos === selected.pos && resizeObserver) return;

    clearResizeObserver();

    const ResizeObserverConstructor = getOwnerWindow(view).ResizeObserver;
    if (typeof ResizeObserverConstructor !== 'function') return;

    const image = getImageElementAtPos(view, selected.pos);
    if (!image) return;

    const container = getNearestVisibleResizeContainer(view, image);
    resizeObserver = new ResizeObserverConstructor(() => {
      requestViewAnimationFrame(view, () =>
        positionImageResizeHandle(view, selected.pos),
      );
    });
    resizeObserver.observe(image);
    resizeObserver.observe(container);
    resizeObserver.observe(view.dom);
    observedImagePos = selected.pos;
  };

  const startImageResize = (
    view: EditorView,
    imagePos: number,
    event: MouseEvent,
  ): boolean => {
    if (!view.editable || event.button !== 0 || activeSession) return false;

    const image = getImageElementAtPos(view, imagePos);
    if (!image) return false;

    setImageResizeCursor(view, true);

    const container = getNearestVisibleResizeContainer(view, image);
    const containerWidthPx =
      getElementContentWidthPx(container) || getResizeContainerWidthPx(view, image);
    const startWidthPx = readImageWidthPx(image);
    const imageNode = getImageNodeAt(view.state.doc, imagePos);
    const drag: ImageResizeDrag = {
      imagePos,
      image,
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

      const currentImage = getCurrentDragImage(view, drag);
      const didCommit =
        commit &&
        latestWidth !== drag.startWidthPx &&
        commitImageWidth(view, drag.imagePos, latestWidth, drag.containerWidthPx);

      if (!didCommit && currentImage) {
        restoreImageStyleSnapshot(currentImage, drag.snapshot);
      }
    };

    activeSession = startMouseDragSession({
      window: getOwnerWindow(view),
      cancelOnWindowBlur: false,
      onMove: (moveEvent) => {
        const currentImage = getCurrentDragImage(view, drag);
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
                  stopResizeStartEvent(event);
                }
              }, { capture: true });
              element.addEventListener('dragstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
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
          if (!selected || !startImageResize(view, selected.pos, event)) {
            return false;
          }

          stopResizeStartEvent(event);
          return true;
        },
      },
    },
    view: (view) => {
      editable = view.editable;

      const handleNativeMouseDown = (event: MouseEvent) => {
        if (
          !(event.target instanceof getOwnerWindow(view).Node) ||
          !view.dom.contains(event.target)
        ) {
          return;
        }

        const handle = getClosestHTMLElement(
          view,
          event.target,
          '.kb-image-resize-handle',
        );
        if (!handle) return;

        const selected = getSelectedImage(view.state);
        if (selected && startImageResize(view, selected.pos, event)) {
          stopResizeStartEvent(event);
        }
      };

      view.dom.ownerDocument.addEventListener('mousedown', handleNativeMouseDown, true);

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
            clearResizeObserver();
            return;
          }

          const selected = getSelectedImage(nextView.state);
          if (selected) {
            observeSelectedImage(nextView);
            requestViewAnimationFrame(nextView, () =>
              positionImageResizeHandle(nextView, selected.pos),
            );
          } else {
            clearResizeObserver();
          }
        },
        destroy() {
          const preserveActiveSession = activeSession && !view.isDestroyed;
          if (!preserveActiveSession) activeSession?.cancel();
          clearResizeObserver();
          view.dom.ownerDocument.removeEventListener(
            'mousedown',
            handleNativeMouseDown,
            true,
          );
          if (!preserveActiveSession) setImageResizeCursor(view, false);
        },
      };
    },
  });
}
