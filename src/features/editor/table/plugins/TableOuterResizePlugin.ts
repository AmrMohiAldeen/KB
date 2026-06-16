import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { logDevError } from '../../utils/logDevError';
import {
  getActiveTablePos,
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
} from '../utils/mouseDragSession';

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

export const tableOuterResizePluginKey = new PluginKey<OuterResizeState>(
  'tableOuterResizePlugin',
);

const EDGE_DETECT_PX = 8;

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
  const width = (wrapper.parentElement ?? wrapper).getBoundingClientRect().width;
  return Number.isFinite(width) && width > 0 ? width : 1;
}

function positionResizeHandle(view: EditorView, table: HTMLTableElement): void {
  const handle = view.dom.querySelector<HTMLElement>('.table-outer-resize-handle');
  if (!handle) return;

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
    return false;
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

export function TableOuterResizePlugin() {
  let activeSession: MouseDragSession | null = null;
  let destroying = false;

  const clearActiveState = (view: EditorView) => {
    if (destroying || view.isDestroyed) return;
    view.dispatch(
      view.state.tr.setMeta(tableOuterResizePluginKey, {
        activeTablePos: null,
      } satisfies OuterResizeState),
    );
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
              element.setAttribute('aria-hidden', 'true');
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

          const tablePos = getActiveTablePos(view.state);
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

          const tablePos = getActiveTablePos(view.state);
          if (tablePos == null) return false;

          const wrapper = getTableWrapperAtPos(view, tablePos);
          const table = getTableAtPos(view, tablePos);
          if (
            !wrapper ||
            !table ||
            !isNearTableRightEdge(table, event.clientX, event.clientY)
          ) {
            return false;
          }
          event.preventDefault();

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
            restoreTablePreview(drag);
            if (commit && latestWidth !== drag.startWidthPct) {
              commitTableWidth(view, drag.tablePos, latestWidth);
            }
            clearActiveState(view);
          };

          activeSession = startMouseDragSession({
            window: getOwnerWindow(view),
            onMove: (moveEvent) => {
              const currentTable = getTableAtPos(view, drag.tablePos);
              if (!currentTable) {
                activeSession?.cancel();
                return;
              }

              const deltaPct =
                ((moveEvent.clientX - drag.startX) / drag.containerWidthPx) * 100;
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
        },
      },
    },
    view: (view) => ({
      update(nextView, previousState) {
        if (activeSession && previousState.doc !== nextView.state.doc) {
          activeSession.cancel();
        }
        if (!nextView.editable) {
          activeSession?.cancel();
          setOuterResizeCursor(nextView, false);
          hideOuterResizeHandles(nextView);
        }

        const tablePos = tableOuterResizePluginKey.getState(nextView.state)?.activeTablePos;
        if (tablePos != null) {
          requestViewAnimationFrame(nextView, () => {
            const table = getTableAtPos(nextView, tablePos);
            if (table) positionResizeHandle(nextView, table);
          });
        }
      },
      destroy() {
        destroying = true;
        activeSession?.cancel();
        setOuterResizeCursor(view, false);
      },
    }),
  });
}
