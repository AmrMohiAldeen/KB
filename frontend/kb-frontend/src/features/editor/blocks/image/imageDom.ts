import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  getClosestHTMLElement,
  getOwnerWindow,
  positionOverlayAtRect,
  requestViewAnimationFrame,
} from '../../lib/dom/editorDom';
import { logDevError } from '../../lib/utils/logDevError';
import {
  BLOCK_IMAGE_NODE_NAME,
  IMAGE_NODE_NAMES,
  INLINE_IMAGE_NODE_NAME,
  type ImageDisplayMode,
} from './imageTypes';

export {
  getClosestHTMLElement,
  getOwnerWindow,
  positionOverlayAtRect,
  requestViewAnimationFrame,
};

export type SelectedImage = {
  node: ProseMirrorNode;
  pos: number;
  display: ImageDisplayMode;
};

export function isImageNode(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && IMAGE_NODE_NAMES.has(node.type.name));
}

export function getImageDisplayMode(
  node: ProseMirrorNode,
): ImageDisplayMode | null {
  if (node.type.name === BLOCK_IMAGE_NODE_NAME) return 'block';
  if (node.type.name === INLINE_IMAGE_NODE_NAME) return 'inline';
  return null;
}

export function getSelectedImage(state: Pick<EditorState, 'selection'>): SelectedImage | null {
  const { selection } = state;

  if (!(selection instanceof NodeSelection) || !isImageNode(selection.node)) {
    return null;
  }

  const display = getImageDisplayMode(selection.node);

  return display
    ? {
        node: selection.node,
        pos: selection.from,
        display,
      }
    : null;
}

export function isImageNodeSelection(
  state: Pick<EditorState, 'selection'>,
): boolean {
  return getSelectedImage(state) != null;
}

export function getImageNodeAt(
  doc: ProseMirrorNode,
  imagePos: number,
): ProseMirrorNode | null {
  if (!Number.isInteger(imagePos) || imagePos < 0 || imagePos > doc.content.size) {
    return null;
  }

  const node = doc.nodeAt(imagePos);
  return isImageNode(node) ? node : null;
}

export function mapImagePos(
  tr: Transaction,
  imagePos: number | null,
): number | null {
  if (imagePos == null) return null;

  const mapped = tr.mapping.mapResult(imagePos, 1);
  return mapped.deleted || !getImageNodeAt(tr.doc, mapped.pos) ? null : mapped.pos;
}

export function getImageElementAtPos(
  view: EditorView,
  imagePos: number,
): HTMLImageElement | null {
  if (!getImageNodeAt(view.state.doc, imagePos)) return null;

  try {
    const ownerWindow = getOwnerWindow(view);
    const findImage = (dom: Node | null): HTMLImageElement | null => {
      if (dom instanceof ownerWindow.HTMLImageElement) {
        return dom.dataset.kbImage ? dom : null;
      }

      if (!(dom instanceof ownerWindow.HTMLElement)) return null;

      if (dom.matches('img[data-kb-image]')) {
        return dom as HTMLImageElement;
      }

      return dom.querySelector<HTMLImageElement>('img[data-kb-image]');
    };

    const directRaw = view.nodeDOM(imagePos);
    const directDom = findImage(directRaw);
    if (directDom) return directDom;

    const { node, offset } = view.domAtPos(imagePos);
    const parentDom = findImage(node);
    if (parentDom) return parentDom;

    const startNode =
      node instanceof ownerWindow.HTMLElement &&
      node.classList.contains('ProseMirror-widget')
        ? node
        : node.childNodes.item(offset);

    for (
      let current: ChildNode | null = startNode;
      current;
      current = current.nextSibling
    ) {
      const image = findImage(current);
      if (image) return image;

      if (
        current instanceof ownerWindow.HTMLElement &&
        !current.classList.contains('ProseMirror-widget')
      ) {
        break;
      }
    }
  } catch (error) {
    logDevError('Image DOM lookup failed:', error);
  }

  return null;
}

export function getImageContainerAtPos(
  view: EditorView,
  imagePos: number,
): HTMLElement | null {
  const image = getImageElementAtPos(view, imagePos);
  return image?.parentElement ?? null;
}
