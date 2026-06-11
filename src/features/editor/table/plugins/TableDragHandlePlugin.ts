import { closeHistory } from '@tiptap/pm/history';
import { Fragment, Slice } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  getActiveTablePos,
  getClosestHTMLElement,
  getOwnerWindow,
  getTableAtPos,
  getTableNodeAt,
  getTableWrapperAtPos,
  mapTablePos,
  requestViewAnimationFrame,
} from '../dom/tableDom';
import {
  applyTableOffsetPct,
  normalizeTableOffsetPct,
  normalizeTableWidthPct,
  readTableOffsetPct,
  readTableWidthPct,
} from '../resizing/tableDimensions';

type DragAxis = 'horizontal' | 'vertical';

type TableDragSession = {
  tablePos: number;
  startX: number;
  startY: number;
  startOffsetPct: number;
  latestOffsetPct: number;
  tableWidthPct: number;
  containerWidthPx: number;
  axis: DragAxis | null;
};

export const tableDragHandlePluginKey = new PluginKey('tableDragHandle');

const AXIS_LOCK_THRESHOLD_PX = 4;
const VERTICAL_AXIS_LOCK_THRESHOLD_PX = 6;

function getHandleTablePos(view: EditorView, event: Event): number | null {
  const handle = getClosestHTMLElement(view, event.target, '.table-drag-handle');
  const tablePos = Number(handle?.dataset.tablePos);
  return Number.isInteger(tablePos) && getTableNodeAt(view.state.doc, tablePos)
    ? tablePos
    : null;
}

function serializeTableDrag(
  view: EditorView,
  event: DragEvent,
  tablePos: number,
): boolean {
  if (!event.dataTransfer || !getTableNodeAt(view.state.doc, tablePos)) return false;

  try {
    const selection = NodeSelection.create(view.state.doc, tablePos);
    const { dom, text } = view.serializeForClipboard(selection.content());

    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/html', dom.innerHTML);
    event.dataTransfer.setData('text/plain', text);
    event.dataTransfer.effectAllowed = 'move';
    return true;
  } catch {
    return false;
  }
}

export function resolveTableDragAxis(
  deltaX: number,
  deltaY: number,
  currentAxis: DragAxis | null,
): DragAxis | null {
  if (currentAxis) return currentAxis;
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_THRESHOLD_PX) {
    return null;
  }

  return Math.abs(deltaY) >= VERTICAL_AXIS_LOCK_THRESHOLD_PX ||
    Math.abs(deltaY) >= Math.abs(deltaX)
    ? 'vertical'
    : 'horizontal';
}

export function createTableMoveTransaction(
  state: EditorState,
  tablePos: number,
  dropPos: number,
) {
  const table = getTableNodeAt(state.doc, tablePos);
  if (!table || !Number.isInteger(dropPos) || dropPos < 0 || dropPos > state.doc.content.size) {
    return null;
  }

  try {
    if (state.doc.resolve(tablePos).depth !== 0) return null;

    const tableEnd = tablePos + table.nodeSize;
    const tableSlice = new Slice(Fragment.from(table), 0, 0);
    const insertPos = dropPoint(state.doc, dropPos, tableSlice);
    if (insertPos == null || (insertPos >= tablePos && insertPos <= tableEnd)) {
      return null;
    }

    const tr = state.tr.delete(tablePos, tableEnd);
    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, table);
    tr.setSelection(NodeSelection.create(tr.doc, mappedInsertPos));
    return closeHistory(tr);
  } catch {
    return null;
  }
}

function getAdjacentTableDropPos(
  state: EditorState,
  tablePos: number,
  direction: -1 | 1,
): number | null {
  const table = getTableNodeAt(state.doc, tablePos);
  if (!table) return null;

  try {
    const $tablePos = state.doc.resolve(tablePos);
    if ($tablePos.depth !== 0) return null;

    const tableIndex = $tablePos.index(0);
    if (direction < 0) {
      return tableIndex === 0
        ? null
        : tablePos - state.doc.child(tableIndex - 1).nodeSize;
    }

    return tableIndex >= state.doc.childCount - 1
      ? null
      : tablePos + table.nodeSize + state.doc.child(tableIndex + 1).nodeSize;
  } catch {
    return null;
  }
}

function getVerticalDropPos(
  view: EditorView,
  event: DragEvent,
  session: TableDragSession,
): number | null {
  const fallbackDirection = event.clientY < session.startY ? -1 : 1;
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) {
    return getAdjacentTableDropPos(view.state, session.tablePos, fallbackDirection);
  }

  const table = getTableNodeAt(view.state.doc, session.tablePos);
  if (!table) return null;

  try {
    const $pos = view.state.doc.resolve(coords.pos);
    const topLevelPos = $pos.depth === 0 ? coords.pos : $pos.before(1);
    const targetNode = view.state.doc.nodeAt(topLevelPos);
    const pointsAtDraggedTable =
      topLevelPos >= session.tablePos &&
      topLevelPos < session.tablePos + table.nodeSize;

    if (!targetNode || pointsAtDraggedTable) {
      return getAdjacentTableDropPos(
        view.state,
        session.tablePos,
        fallbackDirection,
      );
    }

    const targetDom = view.nodeDOM(topLevelPos);
    const targetRect =
      targetDom instanceof getOwnerWindow(view).HTMLElement
        ? targetDom.getBoundingClientRect()
        : null;
    const direction =
      targetRect && targetRect.height > 0
        ? event.clientY < targetRect.top + targetRect.height / 2
          ? -1
          : 1
        : fallbackDirection;

    return direction < 0 ? topLevelPos : topLevelPos + targetNode.nodeSize;
  } catch {
    return getAdjacentTableDropPos(
      view.state,
      session.tablePos,
      fallbackDirection,
    );
  }
}

function positionDragHandle(view: EditorView, tablePos: number): void {
  const handle = view.dom.querySelector<HTMLElement>(
    `.table-drag-handle[data-table-pos="${tablePos}"]`,
  );
  const table = getTableAtPos(view, tablePos);
  if (!handle || !table) return;

  const editorRect = view.dom.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  handle.style.left = `${tableRect.left - editorRect.left - handle.offsetWidth - 4}px`;
  handle.style.top = `${tableRect.top - editorRect.top - handle.offsetHeight - 4}px`;
}

function previewHorizontalDrag(
  view: EditorView,
  session: TableDragSession,
  clientX: number,
): void {
  const table = getTableAtPos(view, session.tablePos);
  if (!table) return;

  const deltaPct = ((clientX - session.startX) / session.containerWidthPx) * 100;
  session.latestOffsetPct = applyTableOffsetPct(
    table,
    session.startOffsetPct + deltaPct,
    session.tableWidthPct,
  );
  positionDragHandle(view, session.tablePos);
}

function restoreHorizontalPreview(view: EditorView, session: TableDragSession): void {
  const tableNode = getTableNodeAt(view.state.doc, session.tablePos);
  const table = getTableAtPos(view, session.tablePos);
  if (!tableNode || !table) return;

  const width = normalizeTableWidthPct(tableNode.attrs.tableWidthPct);
  applyTableOffsetPct(
    table,
    normalizeTableOffsetPct(tableNode.attrs.tableOffsetPct, width),
    width,
  );
  positionDragHandle(view, session.tablePos);
}

function commitHorizontalDrag(view: EditorView, session: TableDragSession): boolean {
  if (!view.editable) return false;

  const tableNode = getTableNodeAt(view.state.doc, session.tablePos);
  if (!tableNode) return false;

  const offset = normalizeTableOffsetPct(session.latestOffsetPct, session.tableWidthPct);
  if (tableNode.attrs.tableOffsetPct === offset) return false;

  try {
    view.dispatch(
      closeHistory(
        view.state.tr.setNodeMarkup(session.tablePos, undefined, {
          ...tableNode.attrs,
          tableOffsetPct: offset,
        }),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

function createDragSession(
  view: EditorView,
  event: DragEvent,
  tablePos: number,
): TableDragSession | null {
  const table = getTableAtPos(view, tablePos);
  const wrapper = getTableWrapperAtPos(view, tablePos);
  if (!table || !wrapper) return null;

  const tableWidthPct = readTableWidthPct(table);
  const startOffsetPct = readTableOffsetPct(table, tableWidthPct);
  const containerWidth = wrapper.getBoundingClientRect().width;
  return {
    tablePos,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetPct,
    latestOffsetPct: startOffsetPct,
    tableWidthPct,
    containerWidthPx:
      Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 1,
    axis: null,
  };
}

function syncHandleEditability(view: EditorView): void {
  view.dom.querySelectorAll<HTMLButtonElement>('.table-drag-handle').forEach((handle) => {
    handle.hidden = !view.editable;
    handle.draggable = view.editable;
  });
}

export function TableDragHandlePlugin() {
  let dragSession: TableDragSession | null = null;

  const cancelDrag = (view: EditorView) => {
    if (dragSession?.axis === 'horizontal') restoreHorizontalPreview(view, dragSession);
    dragSession = null;
  };

  return new Plugin({
    key: tableDragHandlePluginKey,
    state: {
      init: () => null,
      apply: (tr) => {
        if (dragSession) {
          const tablePos = mapTablePos(tr, dragSession.tablePos);
          if (tablePos == null) {
            dragSession = null;
          } else {
            dragSession.tablePos = tablePos;
          }
        }
        return null;
      },
    },
    props: {
      decorations(state) {
        const tablePos = getActiveTablePos(state);
        if (tablePos == null) return null;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            tablePos,
            (view) => {
              const element = view.dom.ownerDocument.createElement('button');
              element.type = 'button';
              element.className = 'table-drag-handle';
              element.dataset.tablePos = String(tablePos);
              element.setAttribute('aria-label', 'Drag table');
              element.setAttribute('title', 'Drag table');
              element.contentEditable = 'false';
              element.hidden = !view.editable;
              element.draggable = view.editable;
              requestViewAnimationFrame(view, () => positionDragHandle(view, tablePos));
              return element;
            },
            { side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const tablePos = getHandleTablePos(view, event);
          if (tablePos == null || event.button !== 0) return false;
          if (!view.editable) event.preventDefault();
          return true;
        },
        click(view, event) {
          const tablePos = getHandleTablePos(view, event);
          if (tablePos == null || event.button !== 0) return false;
          if (!view.editable) {
            event.preventDefault();
            return true;
          }

          try {
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, tablePos)),
            );
            view.focus();
            return true;
          } catch {
            return false;
          }
        },
        dragstart(view, event) {
          const tablePos = getHandleTablePos(view, event);
          if (tablePos == null) return false;
          if (!view.editable) {
            event.preventDefault();
            return true;
          }
          if (!event.dataTransfer) return false;

          dragSession = createDragSession(view, event, tablePos);
          if (!dragSession || !serializeTableDrag(view, event, tablePos)) {
            dragSession = null;
            return false;
          }
          return true;
        },
        dragover(view, event) {
          if (!view.editable || !dragSession || !event.dataTransfer) return false;

          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          dragSession.axis = resolveTableDragAxis(
            event.clientX - dragSession.startX,
            event.clientY - dragSession.startY,
            dragSession.axis,
          );
          if (dragSession.axis === 'horizontal') {
            previewHorizontalDrag(view, dragSession, event.clientX);
          }
          return true;
        },
        drop(view, event) {
          if (!view.editable || !dragSession) return false;
          event.preventDefault();

          const session = dragSession;
          dragSession = null;
          session.axis = resolveTableDragAxis(
            event.clientX - session.startX,
            event.clientY - session.startY,
            session.axis,
          );

          if (session.axis === 'horizontal') {
            previewHorizontalDrag(view, session, event.clientX);
            commitHorizontalDrag(view, session);
          } else if (session.axis === 'vertical') {
            const dropPos = getVerticalDropPos(view, event, session);
            const tr =
              dropPos == null
                ? null
                : createTableMoveTransaction(view.state, session.tablePos, dropPos);
            if (tr) view.dispatch(tr.scrollIntoView());
          }

          view.focus();
          return true;
        },
        dragend(view) {
          cancelDrag(view);
          return false;
        },
      },
    },
    view: (view) => ({
      update(nextView) {
        if (!nextView.editable) cancelDrag(nextView);
        syncHandleEditability(nextView);
      },
      destroy() {
        cancelDrag(view);
      },
    }),
  });
}
