import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { findTable, TableMap } from '@tiptap/pm/tables';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

type DragState = {
  tablePos: number;
  rowIndex: number;
  startY: number;
  startHeight: number;
  domTable: HTMLTableElement;
  originalRowHeight: string;
  originalCellHeights: string[];
};

type RowResizeState = {
  active: { tablePos: number; rowIndex: number } | null;
  dragging: DragState | null;
};

export const rowResizePluginKey = new PluginKey<RowResizeState>('rowResizePlugin');

const MIN_ROW_HEIGHT_PX = 20;
const EDGE_DETECT_PX = 6;

function getDomTableFromTablePos(view: EditorView, tablePos: number): HTMLTableElement | null {
  const dom = view.nodeDOM(tablePos);
  if (!dom) return null;
  if (dom instanceof HTMLTableElement) return dom;
  if (dom instanceof HTMLElement) return dom.querySelector('table');
  return null;
}

function detectRowAtCoords(view: EditorView, event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return null;

  const cell = target.closest('td,th') as HTMLElement | null;
  if (!cell) return null;

  const rect = cell.getBoundingClientRect();
  if (rect.bottom - event.clientY > EDGE_DETECT_PX) return null;

  const pos = view.posAtDOM(cell, 0);
  const table = findTable(view.state.doc.resolve(pos));
  if (!table) return null;

  const domTable = getDomTableFromTablePos(view, table.pos);
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!domTable || !row) return null;

  const rowIndex = Array.from(domTable.querySelectorAll('tr')).indexOf(row);
  if (rowIndex < 0) return null;

  return { tablePos: table.pos, rowIndex, domTable };
}

function clampRowHeight(height: number) {
  return Math.max(MIN_ROW_HEIGHT_PX, Math.round(height));
}

function previewRowHeight(dragging: DragState, height: number) {
  const row = dragging.domTable.querySelectorAll('tr')[dragging.rowIndex] as
    | HTMLTableRowElement
    | undefined;
  if (!row) return;

  const nextHeight = `${clampRowHeight(height)}px`;
  row.style.height = nextHeight;
  Array.from(row.cells).forEach((cell) => {
    cell.style.height = nextHeight;
  });
}

function restoreRowHeightPreview(dragging: DragState) {
  const row = dragging.domTable.querySelectorAll('tr')[dragging.rowIndex] as
    | HTMLTableRowElement
    | undefined;
  if (!row) return;

  row.style.height = dragging.originalRowHeight;
  Array.from(row.cells).forEach((cell, index) => {
    cell.style.height = dragging.originalCellHeights[index] ?? '';
  });
}

function positionRowResizeHandle(view: EditorView, tablePos: number, rowIndex: number) {
  const handle = view.dom.querySelector('.row-resize-handle') as HTMLElement | null;
  const table = getDomTableFromTablePos(view, tablePos);
  const row = table?.querySelectorAll('tr')[rowIndex] as HTMLTableRowElement | undefined;
  if (!handle || !table || !row) return;

  const editorRect = view.dom.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();

  handle.style.left = `${tableRect.left - editorRect.left}px`;
  handle.style.top = `${rowRect.bottom - editorRect.top - 3}px`;
  handle.style.width = `${tableRect.width}px`;
}

function setRowHeight(view: EditorView, tablePos: number, rowIndex: number, height: number) {
  const { state } = view;
  const table = findTable(state.doc.resolve(tablePos + 1));
  if (!table) return false;

  const map = TableMap.get(table.node);
  const clampedHeight = clampRowHeight(height);
  const visitedCellPositions = new Set<number>();
  const tr = state.tr;

  for (let column = 0; column < map.width; column++) {
    const cellPosInTable = map.positionAt(rowIndex, column, table.node);
    const absoluteCellPos = table.start + cellPosInTable;
    if (visitedCellPositions.has(absoluteCellPos)) continue;
    visitedCellPositions.add(absoluteCellPos);

    const cellNode = state.doc.nodeAt(absoluteCellPos);
    if (!cellNode || cellNode.attrs.rowHeight === clampedHeight) continue;

    tr.setNodeMarkup(absoluteCellPos, undefined, {
      ...cellNode.attrs,
      rowHeight: clampedHeight,
    });
  }

  if (!tr.docChanged) return false;

  view.dispatch(closeHistory(tr));
  return true;
}

export function RowResizePlugin() {
  return new Plugin<RowResizeState>({
    key: rowResizePluginKey,
    state: {
      init: () => ({ active: null, dragging: null }),
      apply: (tr, previous) => {
        const meta = tr.getMeta(rowResizePluginKey);
        if (meta) return meta as RowResizeState;

        const active = previous.active
          ? {
              ...previous.active,
              tablePos: tr.mapping.map(previous.active.tablePos),
            }
          : null;
        const dragging = previous.dragging
          ? {
              ...previous.dragging,
              tablePos: tr.mapping.map(previous.dragging.tablePos),
            }
          : null;

        return { active, dragging };
      },
    },
    props: {
      decorations(state) {
        const pluginState = rowResizePluginKey.getState(state);
        if (!pluginState?.active) return null;

        const { tablePos, rowIndex } = pluginState.active;
        const decoration = Decoration.widget(
          tablePos,
          (view) => {
            const element = document.createElement('div');
            element.className = 'row-resize-handle';
            element.dataset.rowIndex = String(rowIndex);

            requestAnimationFrame(() => positionRowResizeHandle(view, tablePos, rowIndex));

            return element;
          },
          { side: -1 },
        );

        return DecorationSet.create(state.doc, [decoration]);
      },

      handleDOMEvents: {
        mousemove(view, event) {
          const pluginState = rowResizePluginKey.getState(view.state);
          if (pluginState?.dragging) return false;

          const hit = detectRowAtCoords(view, event);
          const active = hit ? { tablePos: hit.tablePos, rowIndex: hit.rowIndex } : null;

          if (hit) {
            view.dom.classList.add('resize-cursor-row');
          } else {
            view.dom.classList.remove('resize-cursor-row');
          }

          if (
            pluginState?.active?.tablePos !== active?.tablePos ||
            pluginState?.active?.rowIndex !== active?.rowIndex
          ) {
            view.dispatch(
              view.state.tr.setMeta(rowResizePluginKey, {
                active,
                dragging: null,
              } satisfies RowResizeState),
            );
          }

          return false;
        },

        mousedown(view, event) {
          const hit = detectRowAtCoords(view, event);
          if (!hit) return false;

          event.preventDefault();

          const row = hit.domTable.querySelectorAll('tr')[hit.rowIndex] as
            | HTMLTableRowElement
            | undefined;
          if (!row) return false;

          const dragging: DragState = {
            tablePos: hit.tablePos,
            rowIndex: hit.rowIndex,
            startY: event.clientY,
            startHeight: row.getBoundingClientRect().height,
            domTable: hit.domTable,
            originalRowHeight: row.style.height,
            originalCellHeights: Array.from(row.cells).map((cell) => cell.style.height),
          };
          let latestHeight = dragging.startHeight;

          view.dispatch(
            view.state.tr.setMeta(rowResizePluginKey, {
              active: { tablePos: hit.tablePos, rowIndex: hit.rowIndex },
              dragging,
            } satisfies RowResizeState),
          );

          const onMove = (moveEvent: MouseEvent) => {
            latestHeight = clampRowHeight(
              dragging.startHeight + moveEvent.clientY - dragging.startY,
            );
            previewRowHeight(dragging, latestHeight);
            positionRowResizeHandle(view, dragging.tablePos, dragging.rowIndex);
          };

          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            view.dom.classList.remove('resize-cursor-row');

            restoreRowHeightPreview(dragging);
            if (Math.round(latestHeight) !== Math.round(dragging.startHeight)) {
              setRowHeight(view, dragging.tablePos, dragging.rowIndex, latestHeight);
            }

            view.dispatch(
              view.state.tr.setMeta(rowResizePluginKey, {
                active: null,
                dragging: null,
              } satisfies RowResizeState),
            );
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);

          return true;
        },
      },
    },
  });
}
