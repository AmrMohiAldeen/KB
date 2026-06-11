import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
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
} from '../utils/mouseDragSession';

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

function getTableMapAt(view: EditorView, tablePos: number): TableMap | null {
  const table = getTableNodeAt(view.state.doc, tablePos);
  if (!table) return null;

  try {
    return TableMap.get(table);
  } catch {
    return null;
  }
}

function findTablePosFromCell(view: EditorView, cell: HTMLElement): number | null {
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'table') return $pos.before(depth);
    }
  } catch {
    return null;
  }

  return null;
}

function detectRowAtCoords(view: EditorView, event: MouseEvent) {
  const handle = getClosestHTMLElement(view, event.target, '.row-resize-handle');
  if (handle) {
    const tablePos = Number(handle.dataset.tablePos);
    const rowIndex = Number(handle.dataset.rowIndex);
    const row = getTableAtPos(view, tablePos)?.rows[rowIndex];
    return Number.isInteger(tablePos) && Number.isInteger(rowIndex) && row
      ? { tablePos, rowIndex, row }
      : null;
  }

  const cell = getClosestHTMLElement(view, event.target, 'td,th');
  if (
    !cell ||
    Math.abs(cell.getBoundingClientRect().bottom - event.clientY) > EDGE_DETECT_PX
  ) {
    return null;
  }

  const tablePos = findTablePosFromCell(view, cell);
  if (tablePos == null) return null;

  const table = getTableAtPos(view, tablePos);
  const row = cell.parentElement;
  if (!table || !(row instanceof getOwnerWindow(view).HTMLTableRowElement)) return null;

  const rowIndex = Array.from(table.rows).indexOf(row as HTMLTableRowElement);
  return rowIndex >= 0 ? { tablePos, rowIndex, row } : null;
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
  const map = getTableMapAt(view, tablePos);
  if (!table || !map || rowIndex < 0 || rowIndex >= map.height) return false;

  const rowHeight = clampRowHeight(height);
  const visitedCells = new Set<number>();
  const tr = view.state.tr;

  try {
    for (let column = 0; column < map.width; column += 1) {
      const absoluteCellPos = tablePos + 1 + map.positionAt(rowIndex, column, table);
      if (visitedCells.has(absoluteCellPos)) continue;
      visitedCells.add(absoluteCellPos);

      const cell = tr.doc.nodeAt(absoluteCellPos);
      if (!cell || cell.attrs.rowHeight === rowHeight) continue;

      tr.setNodeMarkup(absoluteCellPos, undefined, {
        ...cell.attrs,
        rowHeight,
      });
    }

    if (!tr.docChanged) return false;
    view.dispatch(closeHistory(tr));
    return true;
  } catch {
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

  const clearActiveState = (view: EditorView) => {
    if (destroying || view.isDestroyed) return;
    view.dispatch(
      view.state.tr.setMeta(rowResizePluginKey, {
        active: null,
      } satisfies RowResizeState),
    );
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
              element.dataset.tablePos = String(active.tablePos);
              element.dataset.rowIndex = String(active.rowIndex);
              element.setAttribute('aria-hidden', 'true');
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
          event.preventDefault();

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
            previews.forEach(restoreRowHeightPreview);
            setRowResizeCursor(view, false);

            if (commit && latestHeight !== drag.startHeight) {
              commitRowHeight(view, drag.tablePos, drag.rowIndex, latestHeight);
            }
            clearActiveState(view);
          };

          const initialPreview = getCurrentPreview();
          if (!initialPreview) return false;

          activeSession = startMouseDragSession({
            window: getOwnerWindow(view),
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
        },
      },
    },
    view: (view) => ({
      update(nextView) {
        if (!nextView.editable) {
          activeSession?.cancel();
          setRowResizeCursor(nextView, false);
          hideRowResizeHandles(nextView);
        }
      },
      destroy() {
        destroying = true;
        activeSession?.cancel();
        setRowResizeCursor(view, false);
      },
    }),
  });
}
