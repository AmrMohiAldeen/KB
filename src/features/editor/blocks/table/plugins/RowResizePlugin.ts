import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { logDevError } from '../../../lib/utils/logDevError';
import {
  getClosestHTMLElement,
  getOwnerWindow,
  getTableAtPos,
  getTableNodeAt,
  mapTablePos,
  positionOverlayAtRect,
  requestViewAnimationFrame,
} from '../dom/tableDom';
import {
  applyRowHeightPreview,
  createRowHeightPreview,
  restoreRowHeightPreview,
  type RowHeightPreview,
} from '../resizing/rowHeightPreview';
import { clampRowHeight } from '../resizing/tableDimensions';
import {
  startMouseDragSession,
  type MouseDragSession,
} from '../../../lib/dom/mouseDragSession';
import {
  isVisibleResizeElement,
  stopResizeStartEvent,
} from '../../../lib/dom/resizeDom';

type ActiveRow = {
  tablePos: number;
  rowIndex: number;
};

type RowResizeState = {
  active: ActiveRow | null;
};

type RowDrag = ActiveRow & {
  startY: number;
  startHeight: number;
};

export const rowResizePluginKey = new PluginKey<RowResizeState>('rowResizePlugin');

const EDGE_DETECT_PX = 6;
const TABLE_OUTER_EDGE_DETECT_PX = 8;

function isNearTableOuterRightEdge(
  table: HTMLTableElement,
  event: MouseEvent,
): boolean {
  const rect = table.getBoundingClientRect();
  return (
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom &&
    Math.abs(rect.right - event.clientX) <= TABLE_OUTER_EDGE_DETECT_PX
  );
}

function getRowPos(
  table: ProseMirrorNode,
  tablePos: number,
  rowIndex: number,
): number | null {
  if (rowIndex < 0 || rowIndex >= table.childCount) return null;

  let rowPos = tablePos + 1;
  for (let index = 0; index < rowIndex; index += 1) {
    rowPos += table.child(index).nodeSize;
  }
  return rowPos;
}

export function createLegacyRowHeightMigration(
  state: EditorState,
): Transaction | null {
  const tr = state.tr;

  state.doc.descendants((node, position) => {
    if (node.type.name === 'tableRow' && node.attrs.rowHeight == null) {
      for (let index = 0; index < node.childCount; index += 1) {
        const legacyHeight = node.child(index).attrs.rowHeight;
        if (legacyHeight != null) {
          tr.setNodeMarkup(position, undefined, {
            ...node.attrs,
            rowHeight: clampRowHeight(legacyHeight),
          });
          break;
        }
      }
    }

    if (
      (node.type.name === 'tableCell' || node.type.name === 'tableHeader') &&
      node.attrs.rowHeight != null
    ) {
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        rowHeight: null,
      });
    }
  });

  return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
}

function findTablePosFromCell(view: EditorView, cell: HTMLElement): number | null {
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'table') return $pos.before(depth);
    }
  } catch (error) {
    logDevError('Table position lookup from row resize target failed:', error);
    return null;
  }

  return null;
}

function detectRowAtCoords(view: EditorView, event: MouseEvent) {
  const handle = getClosestHTMLElement(view, event.target, '.row-resize-handle');
  if (handle) {
    const tablePos = Number(handle.dataset.tablePos);
    const rowIndex = Number(handle.dataset.rowIndex);
    const table = getTableAtPos(view, tablePos);
    if (table && isNearTableOuterRightEdge(table, event)) return null;

    const row = table?.rows[rowIndex];
    return Number.isInteger(tablePos) && Number.isInteger(rowIndex) && row
      ? { tablePos, rowIndex, row }
      : null;
  }

  const cell = getClosestHTMLElement(view, event.target, 'td,th');
  if (!cell) return null;

  const tablePos = findTablePosFromCell(view, cell);
  if (tablePos == null) return null;

  const table = getTableAtPos(view, tablePos);
  if (!table) return null;
  if (isNearTableOuterRightEdge(table, event)) return null;

  const rows = Array.from(table.rows);
  const rowIndex = rows.findIndex(
    (row) =>
      Math.abs(row.getBoundingClientRect().bottom - event.clientY) <=
      EDGE_DETECT_PX,
  );
  return rowIndex >= 0 ? { tablePos, rowIndex, row: rows[rowIndex] } : null;
}

function positionRowResizeHandle(
  view: EditorView,
  tablePos: number,
  rowIndex: number,
): void {
  const handle = view.dom.querySelector<HTMLElement>('.row-resize-handle');
  const table = getTableAtPos(view, tablePos);
  const row = table?.rows[rowIndex];
  if (!handle || !table || !row) return;

  const tableRect = table.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (!isVisibleResizeElement(table) || rowRect.width <= 0 || rowRect.height <= 0) {
    handle.hidden = true;
    return;
  }

  handle.hidden = false;
  positionOverlayAtRect(view, handle, {
    left: tableRect.left,
    top: rowRect.bottom - 3,
    width: tableRect.width,
    height: 6,
  });
}

function commitRowHeight(
  view: EditorView,
  tablePos: number,
  rowIndex: number,
  height: number,
): boolean {
  if (!view.editable) return false;

  const table = getTableNodeAt(view.state.doc, tablePos);
  const rowPos = table ? getRowPos(table, tablePos, rowIndex) : null;
  if (!table || rowPos == null) return false;

  const rowHeight = clampRowHeight(height);
  const row = view.state.doc.nodeAt(rowPos);
  if (!row || row.type.name !== 'tableRow' || row.attrs.rowHeight === rowHeight) {
    return false;
  }

  try {
    view.dispatch(
      closeHistory(
        view.state.tr.setNodeMarkup(rowPos, undefined, {
          ...row.attrs,
          rowHeight,
        }),
      ),
    );
    return true;
  } catch (error) {
    logDevError('Row height commit failed:', error);
    return false;
  }
}

function setRowResizeCursor(view: EditorView, active: boolean): void {
  view.dom.classList.toggle('resize-cursor-row', active);
}

function hideRowResizeHandles(view: EditorView): void {
  view.dom
    .querySelectorAll<HTMLElement>('.row-resize-handle')
    .forEach((handle) => {
      handle.hidden = true;
    });
}

export function RowResizePlugin() {
  let activeSession: MouseDragSession | null = null;
  let destroying = false;
  let resizeObserver: ResizeObserver | null = null;
  let observedActive: ActiveRow | null = null;

  const clearResizeObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedActive = null;
  };

  const clearActiveState = (view: EditorView) => {
    if (destroying || view.isDestroyed) return;
    clearResizeObserver();
    view.dispatch(
      view.state.tr.setMeta(rowResizePluginKey, {
        active: null,
      } satisfies RowResizeState),
    );
  };

  const observeActiveRow = (view: EditorView, active: ActiveRow | null) => {
    if (!active) {
      clearResizeObserver();
      return;
    }

    if (
      observedActive?.tablePos === active.tablePos &&
      observedActive?.rowIndex === active.rowIndex &&
      resizeObserver
    ) {
      return;
    }

    clearResizeObserver();

    const ResizeObserverConstructor = getOwnerWindow(view).ResizeObserver;
    if (typeof ResizeObserverConstructor !== 'function') return;

    const table = getTableAtPos(view, active.tablePos);
    const row = table?.rows[active.rowIndex];
    if (!table || !row) return;

    resizeObserver = new ResizeObserverConstructor(() => {
      requestViewAnimationFrame(view, () =>
        positionRowResizeHandle(view, active.tablePos, active.rowIndex),
      );
    });
    resizeObserver.observe(table);
    resizeObserver.observe(row);
    resizeObserver.observe(view.dom);
    observedActive = active;
  };

  const startRowResize = (
    view: EditorView,
    hit: NonNullable<ReturnType<typeof detectRowAtCoords>>,
    event: MouseEvent,
  ): boolean => {
    if (!view.editable || event.button !== 0 || activeSession) return false;

    const drag: RowDrag = {
      tablePos: hit.tablePos,
      rowIndex: hit.rowIndex,
      startY: event.clientY,
      startHeight: hit.row.getBoundingClientRect().height,
    };
    let latestHeight = drag.startHeight;
    const previews = new Map<HTMLTableRowElement, RowHeightPreview>();

    const getCurrentPreview = () => {
      const row = getTableAtPos(view, drag.tablePos)?.rows[drag.rowIndex];
      if (!row) return null;

      const preview = previews.get(row) ?? createRowHeightPreview(row);
      if (!preview) return null;
      previews.set(row, preview);
      return preview;
    };

    const finish = (commit: boolean) => {
      activeSession = null;
      setRowResizeCursor(view, false);

      const didCommit =
        commit &&
        latestHeight !== drag.startHeight &&
        commitRowHeight(view, drag.tablePos, drag.rowIndex, latestHeight);

      if (didCommit) {
        requestViewAnimationFrame(view, () => {
          previews.forEach(restoreRowHeightPreview);
        });
      } else {
        previews.forEach(restoreRowHeightPreview);
      }
      clearActiveState(view);
    };

    const initialPreview = getCurrentPreview();
    if (!initialPreview) return false;

    setRowResizeCursor(view, true);

    activeSession = startMouseDragSession({
      window: getOwnerWindow(view),
      cancelOnWindowBlur: false,
      onMove: (moveEvent) => {
        latestHeight = clampRowHeight(
          drag.startHeight + moveEvent.clientY - drag.startY,
        );
        const preview = getCurrentPreview();
        if (preview) applyRowHeightPreview(preview, latestHeight);
        positionRowResizeHandle(view, drag.tablePos, drag.rowIndex);
      },
      onCommit: () => finish(true),
      onCancel: () => finish(false),
    });

    return true;
  };

  return new Plugin<RowResizeState>({
    key: rowResizePluginKey,
    state: {
      init: () => ({ active: null }),
      apply: (tr, previous) => {
        const meta = tr.getMeta(rowResizePluginKey);
        if (meta) return meta as RowResizeState;

        const tablePos = mapTablePos(tr, previous.active?.tablePos ?? null);
        if (tablePos == null || !previous.active) return { active: null };

        return {
          active: { ...previous.active, tablePos },
        };
      },
    },
    appendTransaction: (transactions, _oldState, newState) =>
      transactions.some((transaction) => transaction.docChanged)
        ? createLegacyRowHeightMigration(newState)
        : null,
    props: {
      decorations(state) {
        const active = rowResizePluginKey.getState(state)?.active;
        if (!active) return null;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            active.tablePos,
            (view) => {
              const element = view.dom.ownerDocument.createElement('div');
              element.className = 'row-resize-handle';
              element.contentEditable = 'false';
              element.draggable = false;
              element.dataset.tablePos = String(active.tablePos);
              element.dataset.rowIndex = String(active.rowIndex);
              element.setAttribute('aria-hidden', 'true');
              element.addEventListener('mousedown', (event) => {
                const hit = detectRowAtCoords(view, event);
                if (hit && startRowResize(view, hit, event)) {
                  stopResizeStartEvent(event);
                }
              }, { capture: true });
              element.addEventListener('dragstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
              });
              requestViewAnimationFrame(view, () =>
                positionRowResizeHandle(view, active.tablePos, active.rowIndex),
              );
              return element;
            },
            { side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (!view.editable || activeSession) return false;

          const hit = detectRowAtCoords(view, event);
          const active = hit ? { tablePos: hit.tablePos, rowIndex: hit.rowIndex } : null;
          setRowResizeCursor(view, Boolean(hit));

          const previous = rowResizePluginKey.getState(view.state)?.active;
          if (
            previous?.tablePos !== active?.tablePos ||
            previous?.rowIndex !== active?.rowIndex
          ) {
            view.dispatch(
              view.state.tr.setMeta(rowResizePluginKey, {
                active,
              } satisfies RowResizeState),
            );
          }

          return false;
        },
        mouseleave(view) {
          if (activeSession) return false;
          setRowResizeCursor(view, false);
          clearActiveState(view);
          return false;
        },
        mousedown(view, event) {
          if (!view.editable || event.button !== 0 || activeSession) return false;

          const hit = detectRowAtCoords(view, event);
          if (!hit) return false;
          if (!startRowResize(view, hit, event)) return false;

          stopResizeStartEvent(event);
          return true;
        },
      },
    },
    view: (view) => {
      const handleNativeMouseDown = (event: MouseEvent) => {
        if (
          !(event.target instanceof getOwnerWindow(view).Node) ||
          !view.dom.contains(event.target)
        ) {
          return;
        }

        const hit = detectRowAtCoords(view, event);
        if (hit && startRowResize(view, hit, event)) {
          stopResizeStartEvent(event);
        }
      };

      view.dom.ownerDocument.addEventListener('mousedown', handleNativeMouseDown, true);

      requestViewAnimationFrame(view, () => {
        if (!view.editable) return;
        const migration = createLegacyRowHeightMigration(view.state);
        if (migration) view.dispatch(migration);
      });

      return {
        update(nextView, previousState) {
          if (activeSession && previousState.doc !== nextView.state.doc) {
            activeSession.cancel();
          }
          if (!nextView.editable) {
            activeSession?.cancel();
            setRowResizeCursor(nextView, false);
            hideRowResizeHandles(nextView);
            clearResizeObserver();
            return;
          }

          const active = rowResizePluginKey.getState(nextView.state)?.active ?? null;
          observeActiveRow(nextView, active);
        },
        destroy() {
          const preserveActiveSession = activeSession && !view.isDestroyed;
          destroying = !preserveActiveSession;
          if (!preserveActiveSession) activeSession?.cancel();
          clearResizeObserver();
          view.dom.ownerDocument.removeEventListener(
            'mousedown',
            handleNativeMouseDown,
            true,
          );
          if (!preserveActiveSession) setRowResizeCursor(view, false);
        },
      };
    },
  });
}
