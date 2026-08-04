import { closeHistory } from '@tiptap/pm/history';
import {
  cellAround,
  columnResizingPluginKey,
  TableMap,
} from '@tiptap/pm/tables';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { logDevError } from '../../../lib/utils/logDevError';
import {
  getActiveTablePos,
  getClosestHTMLElement,
  getOwnerWindow,
  getTableAtPos,
  getTableNodeAt,
  getTableWrapperAtPos,
  mapTablePos,
  positionOverlayAtRect,
  requestViewAnimationFrame,
} from '../dom/tableDom';
import {
  applyTableOffsetPct,
  applyTableWidthPct,
  clampTableWidthPct,
  normalizeTableOffsetPct,
  readTableOffsetPct,
  readTableWidthPct,
} from '../resizing/tableDimensions';
import {
  startMouseDragSession,
  type MouseDragSession,
} from '../../../lib/dom/mouseDragSession';
import {
  getElementContentWidthPx,
  isVisibleResizeElement,
  stopResizeStartEvent,
} from '../../../lib/dom/resizeDom';

type OuterResizeState = {
  activeTablePos: number | null;
};

type OuterResizeDrag = {
  tablePos: number;
  table: HTMLTableElement;
  startX: number;
  startWidthPct: number;
  startOffsetPct: number;
  containerWidthPx: number;
};

type OuterResizeStartOptions = {
  requireEdgeHit?: boolean;
};

export const tableOuterResizePluginKey = new PluginKey<OuterResizeState>(
  'tableOuterResizePlugin',
);

const EDGE_DETECT_PX = 8;
const COLUMN_EDGE_DETECT_PX = 5;

export function isNearTableRightEdge(
  table: HTMLTableElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = table.getBoundingClientRect();
  return (
    clientY >= rect.top &&
    clientY <= rect.bottom &&
    Math.abs(rect.right - clientX) <= EDGE_DETECT_PX
  );
}

function getContainerWidthPx(wrapper: HTMLElement): number {
  const width = getElementContentWidthPx(wrapper);
  return Number.isFinite(width) && width > 0 ? width : 1;
}

function positionResizeHandle(view: EditorView, table: HTMLTableElement): void {
  const handle = view.dom.querySelector<HTMLElement>('.table-outer-resize-handle');
  if (!handle) return;

  if (!isVisibleResizeElement(table)) {
    handle.hidden = true;
    return;
  }

  handle.hidden = false;
  const tableRect = table.getBoundingClientRect();
  positionOverlayAtRect(view, handle, {
    left: tableRect.right - 4,
    top: tableRect.top,
    width: 8,
    height: tableRect.height,
  });
}

function restoreTablePreview(drag: OuterResizeDrag): void {
  const width = applyTableWidthPct(drag.table, drag.startWidthPct);
  applyTableOffsetPct(drag.table, drag.startOffsetPct, width);
}

function commitTableWidth(view: EditorView, tablePos: number, width: number): boolean {
  if (!view.editable) return false;

  const tableNode = getTableNodeAt(view.state.doc, tablePos);
  if (!tableNode) return false;

  const nextWidth = clampTableWidthPct(Math.round(width * 10) / 10);
  const nextOffset = normalizeTableOffsetPct(tableNode.attrs.tableOffsetPct, nextWidth);
  if (
    tableNode.attrs.tableWidthPct === nextWidth &&
    tableNode.attrs.tableOffsetPct === nextOffset
  ) {
    return true;
  }

  try {
    view.dispatch(
      closeHistory(
        view.state.tr.setNodeMarkup(tablePos, undefined, {
          ...tableNode.attrs,
          tableWidthPct: nextWidth,
          tableOffsetPct: nextOffset,
        }),
      ),
    );
    return true;
  } catch (error) {
    logDevError('Table width commit failed:', error);
    return false;
  }
}

function setOuterResizeCursor(view: EditorView, active: boolean): void {
  view.dom.classList.toggle('resize-cursor-table-outer', active);
}

function hideOuterResizeHandles(view: EditorView): void {
  view.dom
    .querySelectorAll<HTMLElement>('.table-outer-resize-handle')
    .forEach((handle) => {
      handle.hidden = true;
    });
}

function findTablePosFromTarget(
  view: EditorView,
  target: EventTarget | null,
): number | null {
  const handle = getClosestHTMLElement(
    view,
    target,
    '.table-outer-resize-handle',
  );
  if (handle) {
    const tablePos = Number(handle.dataset.tablePos);
    if (Number.isInteger(tablePos) && getTableNodeAt(view.state.doc, tablePos)) {
      return tablePos;
    }
  }

  const table = getClosestHTMLElement(view, target, 'table');
  const wrapper = table?.closest<HTMLElement>('.tableWrapper');
  if (!wrapper) return null;

  try {
    const lookupTarget =
      getClosestHTMLElement(view, target, 'td,th') ?? table ?? wrapper;
    const $pos = view.state.doc.resolve(view.posAtDOM(lookupTarget, 0));
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'table') return $pos.before(depth);
    }

    const wrapperPos = view.posAtDOM(wrapper, 0);
    return getTableNodeAt(view.state.doc, wrapperPos) ? wrapperPos : null;
  } catch (error) {
    logDevError('Table pointer DOM lookup failed:', error);
    return null;
  }
}

function findTablePosFromPointer(
  view: EditorView,
  event: MouseEvent,
  fallbackTablePos: number | null = null,
): number | null {
  const pointerTarget =
    typeof view.dom.ownerDocument.elementFromPoint === 'function'
      ? view.dom.ownerDocument.elementFromPoint(event.clientX, event.clientY)
      : null;

  return (
    findTablePosFromTarget(view, pointerTarget) ??
    findTablePosFromTarget(view, event.target) ??
    fallbackTablePos ??
    getActiveTablePos(view.state)
  );
}

function getOuterResizeHandleFromEvent(
  view: EditorView,
  event: MouseEvent,
): HTMLElement | null {
  const targetHandle = getClosestHTMLElement(
    view,
    event.target,
    '.table-outer-resize-handle',
  );
  if (targetHandle) return targetHandle;

  const pointerTarget =
    typeof view.dom.ownerDocument.elementFromPoint === 'function'
      ? view.dom.ownerDocument.elementFromPoint(event.clientX, event.clientY)
      : null;

  return getClosestHTMLElement(view, pointerTarget, '.table-outer-resize-handle');
}

function getPointerTarget(view: EditorView, event: MouseEvent): Element | null {
  return typeof view.dom.ownerDocument.elementFromPoint === 'function'
    ? view.dom.ownerDocument.elementFromPoint(event.clientX, event.clientY)
    : null;
}

function getCellFromPointer(view: EditorView, event: MouseEvent): HTMLElement | null {
  return (
    getClosestHTMLElement(view, event.target, 'td,th') ??
    getClosestHTMLElement(view, getPointerTarget(view, event), 'td,th')
  );
}

function findColumnResizeCellPos(
  view: EditorView,
  event: MouseEvent,
): number | null {
  const cellElement = getCellFromPointer(view, event);
  if (!cellElement) return null;

  const rect = cellElement.getBoundingClientRect();
  const nearLeft = event.clientX - rect.left <= COLUMN_EDGE_DETECT_PX;
  const nearRight = rect.right - event.clientX <= COLUMN_EDGE_DETECT_PX;
  if (!nearLeft && !nearRight) return null;

  const found = view.posAtCoords({
    left: event.clientX + (nearRight ? -COLUMN_EDGE_DETECT_PX : COLUMN_EDGE_DETECT_PX),
    top: event.clientY,
  });
  if (!found) return null;

  const $cell = cellAround(view.state.doc.resolve(found.pos));
  if (!$cell) return null;

  const map = TableMap.get($cell.node(-1));
  const tableStart = $cell.start(-1);
  const cellIndex = map.map.indexOf($cell.pos - tableStart);
  if (cellIndex < 0) return null;

  if (nearRight) {
    const lastColumn =
      map.colCount($cell.pos - tableStart) + $cell.nodeAfter!.attrs.colspan - 1;
    return lastColumn === map.width - 1 ? null : $cell.pos;
  }

  return cellIndex % map.width === 0 ? null : tableStart + map.map[cellIndex - 1];
}

function primeColumnResizeHandle(view: EditorView, event: MouseEvent): void {
  if (!view.editable) return;

  const pluginState = columnResizingPluginKey.getState(view.state);
  if (!pluginState || pluginState.dragging) return;

  const cellPos = findColumnResizeCellPos(view, event);
  if (cellPos == null || pluginState.activeHandle === cellPos) return;

  view.dispatch(
    view.state.tr.setMeta(columnResizingPluginKey, {
      setHandle: cellPos,
    }),
  );
}

export function TableOuterResizePlugin() {
  let activeSession: MouseDragSession | null = null;
  let destroying = false;
  let resizeObserver: ResizeObserver | null = null;
  let observedTablePos: number | null = null;

  const clearResizeObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedTablePos = null;
  };

  const clearActiveState = (view: EditorView) => {
    if (destroying || view.isDestroyed) return;
    clearResizeObserver();
    view.dispatch(
      view.state.tr.setMeta(tableOuterResizePluginKey, {
        activeTablePos: null,
      } satisfies OuterResizeState),
    );
  };

  const observeActiveTable = (view: EditorView, tablePos: number | null) => {
    if (tablePos == null) {
      clearResizeObserver();
      return;
    }

    if (observedTablePos === tablePos && resizeObserver) return;

    clearResizeObserver();

    const ResizeObserverConstructor = getOwnerWindow(view).ResizeObserver;
    if (typeof ResizeObserverConstructor !== 'function') return;

    const table = getTableAtPos(view, tablePos);
    const wrapper = getTableWrapperAtPos(view, tablePos);
    if (!table || !wrapper) return;

    resizeObserver = new ResizeObserverConstructor(() => {
      requestViewAnimationFrame(view, () => {
        const currentTable = getTableAtPos(view, tablePos);
        if (currentTable) positionResizeHandle(view, currentTable);
      });
    });
    resizeObserver.observe(table);
    resizeObserver.observe(wrapper);
    resizeObserver.observe(view.dom);
    observedTablePos = tablePos;
  };

  const startOuterResize = (
    view: EditorView,
    tablePos: number,
    event: MouseEvent,
    { requireEdgeHit = true }: OuterResizeStartOptions = {},
  ): boolean => {
    if (!view.editable || event.button !== 0 || activeSession) return false;

    const wrapper = getTableWrapperAtPos(view, tablePos);
    const table = getTableAtPos(view, tablePos);
    if (
      !wrapper ||
      !table ||
      (requireEdgeHit && !isNearTableRightEdge(table, event.clientX, event.clientY))
    ) {
      return false;
    }

    setOuterResizeCursor(view, true);

    const drag: OuterResizeDrag = {
      tablePos,
      table,
      startX: event.clientX,
      startWidthPct: readTableWidthPct(table),
      startOffsetPct: readTableOffsetPct(table),
      containerWidthPx: getContainerWidthPx(wrapper),
    };
    let latestWidth = drag.startWidthPct;

    const finish = (commit: boolean) => {
      activeSession = null;
      setOuterResizeCursor(view, false);
      if (commit && latestWidth !== drag.startWidthPct) {
        commitTableWidth(view, drag.tablePos, latestWidth);
      } else {
        restoreTablePreview(drag);
      }
      clearActiveState(view);
    };

    activeSession = startMouseDragSession({
      window: getOwnerWindow(view),
      cancelOnWindowBlur: false,
      onMove: (moveEvent) => {
        const currentTable = getTableAtPos(view, drag.tablePos);
        if (!currentTable) {
          activeSession?.cancel();
          return;
        }

        const currentWrapper = getTableWrapperAtPos(view, drag.tablePos);
        const containerWidthPx = currentWrapper
          ? getContainerWidthPx(currentWrapper)
          : drag.containerWidthPx;
        const deltaPct =
          ((moveEvent.clientX - drag.startX) / containerWidthPx) * 100;
        latestWidth = applyTableWidthPct(
          currentTable,
          drag.startWidthPct + deltaPct,
        );
        positionResizeHandle(view, currentTable);
      },
      onCommit: () => finish(true),
      onCancel: () => finish(false),
    });

    return true;
  };

  return new Plugin<OuterResizeState>({
    key: tableOuterResizePluginKey,
    state: {
      init: () => ({ activeTablePos: null }),
      apply: (tr, previous) => {
        const meta = tr.getMeta(tableOuterResizePluginKey);
        if (meta) return meta as OuterResizeState;
        return {
          activeTablePos: mapTablePos(tr, previous.activeTablePos),
        };
      },
    },
    props: {
      decorations(state) {
        const tablePos = tableOuterResizePluginKey.getState(state)?.activeTablePos;
        if (tablePos == null) return null;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            tablePos,
            (view) => {
              const element = view.dom.ownerDocument.createElement('div');
              element.className = 'table-outer-resize-handle';
              element.contentEditable = 'false';
              element.draggable = false;
              element.dataset.tablePos = String(tablePos);
              element.setAttribute('aria-hidden', 'true');
              element.addEventListener('mousedown', (event) => {
                if (
                  startOuterResize(view, tablePos, event, {
                    requireEdgeHit: false,
                  })
                ) {
                  stopResizeStartEvent(event);
                }
              }, { capture: true });
              element.addEventListener('dragstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
              });
              requestViewAnimationFrame(view, () => {
                const table = getTableAtPos(view, tablePos);
                if (table) positionResizeHandle(view, table);
              });
              return element;
            },
            { side: -1 },
          ),
        ]);
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (!view.editable || activeSession) return false;

          const tablePos = findTablePosFromPointer(view, event);
          const table = tablePos == null ? null : getTableAtPos(view, tablePos);
          const nearEdge = Boolean(
            table && isNearTableRightEdge(table, event.clientX, event.clientY),
          );
          const nextTablePos = nearEdge ? tablePos : null;
          setOuterResizeCursor(view, nearEdge);

          if (
            tableOuterResizePluginKey.getState(view.state)?.activeTablePos !== nextTablePos
          ) {
            view.dispatch(
              view.state.tr.setMeta(tableOuterResizePluginKey, {
                activeTablePos: nextTablePos,
              } satisfies OuterResizeState),
            );
          }
          return false;
        },
        mouseleave(view) {
          if (activeSession) return false;
          setOuterResizeCursor(view, false);
          clearActiveState(view);
          return false;
        },
        mousedown(view, event) {
          if (!view.editable || event.button !== 0 || activeSession) return false;

          const handle = getOuterResizeHandleFromEvent(view, event);
          const handleTablePos = handle
            ? findTablePosFromTarget(view, handle)
            : null;
          const activeTablePos =
            tableOuterResizePluginKey.getState(view.state)?.activeTablePos ?? null;
          const tablePos =
            handleTablePos ?? findTablePosFromPointer(view, event, activeTablePos);
          if (tablePos == null) return false;

          if (
            !startOuterResize(view, tablePos, event, {
              requireEdgeHit: !handle,
            })
          ) {
            return false;
          }

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

        primeColumnResizeHandle(view, event);

        const handle = getOuterResizeHandleFromEvent(view, event);
        const tablePos = handle
          ? findTablePosFromTarget(view, handle)
          : findTablePosFromPointer(view, event);
        if (
          tablePos != null &&
          startOuterResize(view, tablePos, event, {
            requireEdgeHit: !handle,
          })
        ) {
          stopResizeStartEvent(event);
        }
      };

      view.dom.ownerDocument.addEventListener('mousedown', handleNativeMouseDown, true);

      return {
        update(nextView, previousState) {
          if (activeSession && previousState.doc !== nextView.state.doc) {
            activeSession.cancel();
          }
          if (!nextView.editable) {
            activeSession?.cancel();
            setOuterResizeCursor(nextView, false);
            hideOuterResizeHandles(nextView);
            clearResizeObserver();
            return;
          }

          const tablePos =
            tableOuterResizePluginKey.getState(nextView.state)?.activeTablePos;
          if (tablePos != null) {
            observeActiveTable(nextView, tablePos);
            requestViewAnimationFrame(nextView, () => {
              const table = getTableAtPos(nextView, tablePos);
              if (table) positionResizeHandle(nextView, table);
            });
          } else {
            clearResizeObserver();
          }
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
          if (!preserveActiveSession) setOuterResizeCursor(view, false);
        },
      };
    },
  });
}
