import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  createBlockDropIndicator,
  createBlockMove,
  createBlockMoveTransaction,
  getBlockDropIndicatorRect,
  getVerticalBlockDropPos,
  positionBlockDragHandle,
  positionBlockDropIndicator,
} from '../../blockDrag/blockDrag';
import { logDevError } from '../../utils/logDevError';
import {
  getActiveTablePos,
  getClosestHTMLElement,
  getOwnerWindow,
  getTableAtPos,
  getTableNodeAt,
  getTableWrapperAtPos,
  requestViewAnimationFrame,
} from '../dom/tableDom';
import {
  applyTableOffsetPct,
  normalizeTableOffsetPct,
  normalizeTableWidthPct,
  readTableOffsetPct,
  readTableWidthPct,
} from '../resizing/tableDimensions';
import {
  startMouseDragSession,
  type MouseDragSession,
} from '../utils/mouseDragSession';

type TableDragSession = {
  tablePos: number;
  table: HTMLTableElement;
  startX: number;
  startY: number;
  startOffsetPct: number;
  latestOffsetPct: number;
  tableWidthPct: number;
  containerWidthPx: number;
  horizontalActive: boolean;
  dropPos: number | null;
  indicator: HTMLElement | null;
};

type ActiveTableDrag = {
  drag: TableDragSession;
  mouse: MouseDragSession;
};

export type TableDragIntent = {
  horizontal: boolean;
  vertical: boolean;
};

export const tableDragHandlePluginKey = new PluginKey('tableDragHandle');

const HORIZONTAL_MOVEMENT_THRESHOLD_PX = 6;
const VERTICAL_MOVEMENT_THRESHOLD_PX = 8;
const isTableNode = (node: ProseMirrorNode) => node.type.name === 'table';

export function getTableDragIntent(deltaX: number, deltaY: number): TableDragIntent {
  return {
    horizontal: Math.abs(deltaX) >= HORIZONTAL_MOVEMENT_THRESHOLD_PX,
    vertical: Math.abs(deltaY) >= VERTICAL_MOVEMENT_THRESHOLD_PX,
  };
}

function getHandleTablePos(view: EditorView, event: Event): number | null {
  const handle = getClosestHTMLElement(view, event.target, '.table-drag-handle');
  const tablePos = Number(handle?.dataset.tablePos);
  return Number.isInteger(tablePos) && getTableNodeAt(view.state.doc, tablePos)
    ? tablePos
    : null;
}

export function createTableMoveTransaction(
  state: EditorState,
  tablePos: number,
  dropPos: number,
) {
  return createBlockMoveTransaction(state, tablePos, dropPos, isTableNode);
}

function positionDragHandle(view: EditorView, tablePos: number): void {
  const handle = view.dom.querySelector<HTMLElement>(
    `.table-drag-handle[data-table-pos="${tablePos}"]`,
  );
  const table = getTableAtPos(view, tablePos);
  if (handle && table) positionBlockDragHandle(view, handle, table);
}

function previewHorizontalDrag(
  view: EditorView,
  session: TableDragSession,
  clientX: number,
): boolean {
  const table = getTableAtPos(view, session.tablePos);
  if (!table || table !== session.table) return false;

  const deltaPct = ((clientX - session.startX) / session.containerWidthPx) * 100;
  session.latestOffsetPct = applyTableOffsetPct(
    table,
    session.startOffsetPct + deltaPct,
    session.tableWidthPct,
  );
  session.horizontalActive = true;
  positionDragHandle(view, session.tablePos);
  return true;
}

function restoreHorizontalPreview(view: EditorView, session: TableDragSession): void {
  if (!session.horizontalActive) return;

  applyTableOffsetPct(
    session.table,
    session.startOffsetPct,
    session.tableWidthPct,
  );
  positionDragHandle(view, session.tablePos);
}

function clearVerticalDropPreview(session: TableDragSession): void {
  session.dropPos = null;
  session.indicator?.remove();
  session.indicator = null;
}

function previewVerticalDrop(
  view: EditorView,
  session: TableDragSession,
  event: MouseEvent,
): void {
  const dropPos = getVerticalBlockDropPos(
    view,
    event,
    { blockPos: session.tablePos, startY: session.startY },
    isTableNode,
  );
  if (dropPos == null) {
    clearVerticalDropPreview(session);
    return;
  }

  const rect = getBlockDropIndicatorRect(
    view,
    session.tablePos,
    dropPos,
    isTableNode,
  );
  if (!rect) {
    clearVerticalDropPreview(session);
    return;
  }

  session.dropPos = dropPos;
  session.indicator ??= createBlockDropIndicator(view);
  positionBlockDropIndicator(session.indicator, rect);
}

function updateTableDragPreview(
  view: EditorView,
  session: TableDragSession,
  event: MouseEvent,
): boolean {
  if (!getTableNodeAt(view.state.doc, session.tablePos)) return false;

  const deltaX = event.clientX - session.startX;
  const deltaY = event.clientY - session.startY;
  const intent = getTableDragIntent(deltaX, deltaY);

  if (intent.horizontal || session.horizontalActive) {
    previewHorizontalDrag(view, session, event.clientX);
  }
  if (intent.vertical) {
    previewVerticalDrop(view, session, event);
  } else {
    clearVerticalDropPreview(session);
  }
  return true;
}

function commitTableDrag(view: EditorView, session: TableDragSession): boolean {
  if (!view.editable) return false;

  try {
    let tablePos = session.tablePos;
    let tr = view.state.tr;

    if (session.dropPos != null) {
      const move = createBlockMove(
        view.state,
        session.tablePos,
        session.dropPos,
        isTableNode,
      );
      if (move) {
        tr = move.transaction;
        tablePos = move.newBlockPos;
      }
    }

    const tableNode = getTableNodeAt(tr.doc, tablePos);
    if (!tableNode) return false;

    if (session.horizontalActive) {
      const width = normalizeTableWidthPct(tableNode.attrs.tableWidthPct);
      const offset = normalizeTableOffsetPct(session.latestOffsetPct, width);
      if (tableNode.attrs.tableOffsetPct !== offset) {
        tr.setNodeMarkup(tablePos, undefined, {
          ...tableNode.attrs,
          tableOffsetPct: offset,
        });
      }
    }

    if (!tr.docChanged) return false;
    view.dispatch(closeHistory(tr).scrollIntoView());
    return true;
  } catch (error) {
    logDevError('Table drag commit failed:', error);
    return false;
  }
}

function createDragSession(
  view: EditorView,
  event: MouseEvent,
  tablePos: number,
): TableDragSession | null {
  const table = getTableAtPos(view, tablePos);
  const wrapper = getTableWrapperAtPos(view, tablePos);
  if (!table || !wrapper) return null;

  const tableWidthPct = readTableWidthPct(table);
  const startOffsetPct = readTableOffsetPct(table, tableWidthPct);
  const containerWidth = (wrapper.parentElement ?? wrapper).getBoundingClientRect().width;
  return {
    tablePos,
    table,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetPct,
    latestOffsetPct: startOffsetPct,
    tableWidthPct,
    containerWidthPx:
      Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 1,
    horizontalActive: false,
    dropPos: null,
    indicator: null,
  };
}

function syncHandleEditability(view: EditorView): void {
  view.dom.querySelectorAll<HTMLButtonElement>('.table-drag-handle').forEach((handle) => {
    handle.hidden = !view.editable;
    handle.draggable = false;
  });
}

export function TableDragHandlePlugin() {
  let activeDrag: ActiveTableDrag | null = null;

  const finishDrag = (view: EditorView, session: TableDragSession, commit: boolean) => {
    if (activeDrag?.drag === session) activeDrag = null;
    restoreHorizontalPreview(view, session);
    session.indicator?.remove();
    session.indicator = null;
    if (commit) {
      commitTableDrag(view, session);
    } else {
      session.dropPos = null;
    }
  };

  const cancelDrag = () => {
    activeDrag?.mouse.cancel();
  };

  return new Plugin({
    key: tableDragHandlePluginKey,
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
              element.className = 'kb-block-drag-handle table-drag-handle';
              element.dataset.tablePos = String(tablePos);
              element.setAttribute('aria-label', 'Drag table');
              element.setAttribute('title', 'Drag table');
              element.contentEditable = 'false';
              element.hidden = !view.editable;
              element.draggable = false;
              requestViewAnimationFrame(view, () => positionDragHandle(view, tablePos));
              return element;
            },
            { key: 'table-drag-handle', side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const tablePos = getHandleTablePos(view, event);
          if (tablePos == null || event.button !== 0) return false;
          event.preventDefault();
          if (!view.editable || activeDrag) return true;

          const drag = createDragSession(view, event, tablePos);
          if (!drag) return true;

          const mouse = startMouseDragSession({
            window: getOwnerWindow(view),
            onMove: (moveEvent) => {
              if (!updateTableDragPreview(view, drag, moveEvent)) {
                activeDrag?.mouse.cancel();
              }
            },
            onCommit: (upEvent) => {
              updateTableDragPreview(view, drag, upEvent);
              finishDrag(view, drag, true);
              view.focus();
            },
            onCancel: () => finishDrag(view, drag, false),
          });
          activeDrag = { drag, mouse };
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
          } catch (error) {
            logDevError('Table selection from drag handle failed:', error);
            return false;
          }
        },
        dragstart(view, event) {
          if (getHandleTablePos(view, event) == null) return false;
          event.preventDefault();
          return true;
        },
        blur() {
          cancelDrag();
          return false;
        },
      },
    },
    view: (view) => ({
      update(nextView, previousState) {
        if (activeDrag && previousState.doc !== nextView.state.doc) cancelDrag();
        if (!nextView.editable) cancelDrag();
        syncHandleEditability(nextView);

        const tablePos = getActiveTablePos(nextView.state);
        if (tablePos != null) {
          requestViewAnimationFrame(nextView, () => positionDragHandle(nextView, tablePos));
        }
      },
      destroy() {
        cancelDrag();
        activeDrag?.drag.indicator?.remove();
        activeDrag = null;
        syncHandleEditability(view);
      },
    }),
  });
}
