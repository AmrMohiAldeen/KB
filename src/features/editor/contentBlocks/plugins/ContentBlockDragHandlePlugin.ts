import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  createBlockMoveTransaction,
  getDraggableBlockAt,
  getVerticalBlockDropPos,
  mapDraggableBlockPos,
  positionBlockDragHandle,
  serializeBlockDrag,
} from '../../blockDrag/blockDrag';
import {
  getClosestHTMLElement,
  getOwnerWindow,
  requestViewAnimationFrame,
} from '../../dom/editorDom';
import { isDraggableContentBlockNodeName } from '../model';

type ContentBlockDragSession = {
  blockPos: number;
  startY: number;
};
type DocumentState = Pick<EditorState, 'doc'>;

export const contentBlockDragHandlePluginKey = new PluginKey(
  'contentBlockDragHandle',
);

const isContentBlock = (node: ProseMirrorNode) =>
  isDraggableContentBlockNodeName(node.type.name);

function isTopLevelContentBlock(state: DocumentState, position: number): boolean {
  try {
    return (
      state.doc.resolve(position).depth === 0 &&
      Boolean(getDraggableBlockAt(state.doc, position, isContentBlock))
    );
  } catch {
    return false;
  }
}

function getActiveContentBlockPos(state: EditorState): number | null {
  if (
    state.selection instanceof NodeSelection &&
    isContentBlock(state.selection.node) &&
    isTopLevelContentBlock(state, state.selection.from)
  ) {
    return state.selection.from;
  }

  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (!isContentBlock($from.node(depth))) continue;

    const position = $from.before(depth);
    return isTopLevelContentBlock(state, position) ? position : null;
  }

  return null;
}

function getHandleBlockPos(view: EditorView, event: Event): number | null {
  const handle = getClosestHTMLElement(
    view,
    event.target,
    '.content-block-drag-handle',
  );
  const blockPos = Number(handle?.dataset.contentBlockPos);
  return Number.isInteger(blockPos) && isTopLevelContentBlock(view.state, blockPos)
    ? blockPos
    : null;
}

function getContentBlockElement(
  view: EditorView,
  blockPos: number,
): HTMLElement | null {
  if (!isTopLevelContentBlock(view.state, blockPos)) return null;

  try {
    const dom = view.nodeDOM(blockPos);
    return dom instanceof getOwnerWindow(view).HTMLElement ? dom : null;
  } catch {
    return null;
  }
}

function positionContentBlockDragHandle(
  view: EditorView,
  blockPos: number,
): void {
  const handle = view.dom.querySelector<HTMLElement>(
    `.content-block-drag-handle[data-content-block-pos="${blockPos}"]`,
  );
  const block = getContentBlockElement(view, blockPos);
  if (handle && block) positionBlockDragHandle(view, handle, block);
}

function syncHandleEditability(view: EditorView): void {
  view.dom
    .querySelectorAll<HTMLButtonElement>('.content-block-drag-handle')
    .forEach((handle) => {
      handle.hidden = !view.editable;
      handle.draggable = view.editable;
    });
}

export function ContentBlockDragHandlePlugin() {
  let dragSession: ContentBlockDragSession | null = null;

  return new Plugin({
    key: contentBlockDragHandlePluginKey,
    state: {
      init: () => null,
      apply: (transaction) => {
        if (dragSession) {
          const blockPos = mapDraggableBlockPos(
            transaction,
            dragSession.blockPos,
            isContentBlock,
          );
          if (blockPos == null || !isTopLevelContentBlock(transaction, blockPos)) {
            dragSession = null;
          } else {
            dragSession.blockPos = blockPos;
          }
        }
        return null;
      },
    },
    props: {
      decorations(state) {
        const blockPos = getActiveContentBlockPos(state);
        if (blockPos == null) return null;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            blockPos,
            (view) => {
              const element = view.dom.ownerDocument.createElement('button');
              element.type = 'button';
              element.className =
                'kb-block-drag-handle content-block-drag-handle';
              element.dataset.contentBlockPos = String(blockPos);
              element.setAttribute('aria-label', 'Drag content block');
              element.setAttribute('title', 'Drag content block');
              element.contentEditable = 'false';
              element.hidden = !view.editable;
              element.draggable = view.editable;
              requestViewAnimationFrame(view, () =>
                positionContentBlockDragHandle(view, blockPos),
              );
              return element;
            },
            { key: 'content-block-drag-handle', side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const blockPos = getHandleBlockPos(view, event);
          if (blockPos == null || event.button !== 0) return false;
          if (!view.editable) event.preventDefault();
          return true;
        },
        click(view, event) {
          const blockPos = getHandleBlockPos(view, event);
          if (blockPos == null || event.button !== 0) return false;
          if (!view.editable) {
            event.preventDefault();
            return true;
          }

          try {
            view.dispatch(
              view.state.tr.setSelection(
                NodeSelection.create(view.state.doc, blockPos),
              ),
            );
            view.focus();
            return true;
          } catch {
            return false;
          }
        },
        dragstart(view, event) {
          const blockPos = getHandleBlockPos(view, event);
          if (blockPos == null) return false;
          if (!view.editable) {
            event.preventDefault();
            return true;
          }
          if (!event.dataTransfer) return false;

          dragSession = {
            blockPos,
            startY: event.clientY,
          };
          if (!serializeBlockDrag(view, event, blockPos, isContentBlock)) {
            dragSession = null;
            return false;
          }
          return true;
        },
        dragover(view, event) {
          if (!view.editable || !dragSession || !event.dataTransfer) return false;

          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          return true;
        },
        drop(view, event) {
          if (!view.editable || !dragSession) return false;
          event.preventDefault();

          const session = dragSession;
          dragSession = null;
          const dropPos = getVerticalBlockDropPos(
            view,
            event,
            session,
            isContentBlock,
          );
          const transaction =
            dropPos == null
              ? null
              : createBlockMoveTransaction(
                  view.state,
                  session.blockPos,
                  dropPos,
                  isContentBlock,
                );
          if (transaction) view.dispatch(transaction.scrollIntoView());

          view.focus();
          return true;
        },
        dragend() {
          dragSession = null;
          return false;
        },
      },
    },
    view: () => ({
      update(nextView) {
        if (!nextView.editable) dragSession = null;
        syncHandleEditability(nextView);

        const blockPos = getActiveContentBlockPos(nextView.state);
        if (blockPos != null) {
          requestViewAnimationFrame(nextView, () =>
            positionContentBlockDragHandle(nextView, blockPos),
          );
        }
      },
      destroy() {
        dragSession = null;
      },
    }),
  });
}
