import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { findParentNodeClosestToPos } from 'prosemirror-utils';
import {
  clampTableWidthPct,
  MAX_TABLE_WIDTH_PCT,
} from '../TableWidthPct';

type DragState = {
  tablePos: number;
  startX: number;
  startPct: number;
  containerWidthPx: number;
};

type OuterResizeState = {
  activeTablePos: number | null;
  dragging: DragState | null;
};

export const tableOuterResizePluginKey = new PluginKey<OuterResizeState>(
  'tableOuterResizePlugin',
);

const EDGE_DETECT_PX = 8;

function getClosestTablePos(state: EditorView['state']): number | null {
  const { $from } = state.selection;
  const table = findParentNodeClosestToPos($from, (node) => node.type.name === 'table');
  return table ? table.pos : null;
}

function getTableWrapperFromTablePos(view: EditorView, tablePos: number): HTMLElement | null {
  const dom = view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return null;

  return (dom.closest('.tableWrapper') as HTMLElement) ?? null;
}

function isNearRightEdge(table: HTMLTableElement, clientX: number) {
  const rect = table.getBoundingClientRect();
  return Math.abs(rect.right - clientX) <= EDGE_DETECT_PX;
}

function getContainerWidthPx(wrapper: HTMLElement): number {
  const parent = wrapper.parentElement;
  return (parent ?? wrapper).getBoundingClientRect().width || 1;
}

function readCurrentWidthPct(table: HTMLTableElement): number | null {
  const data = table.dataset.tableWidthPct;
  if (data) {
    const value = Number(data);
    return Number.isFinite(value) ? value : null;
  }

  const match = table.style.width.match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function previewTableWidth(table: HTMLTableElement, pct: number) {
  const width = clampTableWidthPct(Math.round(pct * 10) / 10);
  table.dataset.tableWidthPct = String(width);
  table.style.width = `${width}%`;
  table.style.minWidth = '';
}

function positionResizeHandle(view: EditorView, table: HTMLTableElement) {
  const handle = view.dom.querySelector('.table-outer-resize-handle') as HTMLElement | null;
  if (!handle) return;

  const editorRect = view.dom.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();

  handle.style.left = `${tableRect.right - editorRect.left - 4}px`;
  handle.style.top = `${tableRect.top - editorRect.top}px`;
  handle.style.height = `${tableRect.height}px`;
}

function setTableWidthPct(view: EditorView, tablePos: number, pct: number) {
  const { state } = view;
  const tableNode = state.doc.nodeAt(tablePos);
  if (!tableNode) return false;

  const nextPct = clampTableWidthPct(Math.round(pct * 10) / 10);
  if (tableNode.attrs.tableWidthPct === nextPct) return false;

  const nextAttrs = { ...tableNode.attrs, tableWidthPct: nextPct };
  const tr = closeHistory(state.tr.setNodeMarkup(tablePos, undefined, nextAttrs));

  view.dispatch(tr);
  return true;
}

export function TableOuterResizePlugin() {
  return new Plugin<OuterResizeState>({
    key: tableOuterResizePluginKey,

    state: {
      init: () => ({ activeTablePos: null, dragging: null }),
      apply: (tr, previous) => {
        const meta = tr.getMeta(tableOuterResizePluginKey);
        if (meta) return meta as OuterResizeState;

        const activeTablePos =
          previous.activeTablePos != null ? tr.mapping.map(previous.activeTablePos) : null;

        const dragging = previous.dragging
          ? {
              ...previous.dragging,
              tablePos: tr.mapping.map(previous.dragging.tablePos),
            }
          : null;

        return { activeTablePos, dragging };
      },
    },

    props: {
      decorations(state) {
        const pluginState = tableOuterResizePluginKey.getState(state);
        if (pluginState?.activeTablePos == null) return null;

        const tablePos = pluginState.activeTablePos;
        const handle = Decoration.widget(
          tablePos,
          (view) => {
            const element = document.createElement('div');
            element.className = 'table-outer-resize-handle';
            element.setAttribute('aria-hidden', 'true');

            const table = getTableWrapperFromTablePos(view, tablePos)?.querySelector('table');
            if (table) {
              requestAnimationFrame(() => positionResizeHandle(view, table));
            }

            return element;
          },
          { side: -1 },
        );

        return DecorationSet.create(state.doc, [handle]);
      },

      handleDOMEvents: {
        mousemove(view, event) {
          const pluginState = tableOuterResizePluginKey.getState(view.state);
          if (pluginState?.dragging) return false;

          const tablePos = getClosestTablePos(view.state);
          if (tablePos == null) {
            if (pluginState?.activeTablePos !== null) {
              view.dispatch(
                view.state.tr.setMeta(tableOuterResizePluginKey, {
                  activeTablePos: null,
                  dragging: null,
                } satisfies OuterResizeState),
              );
            }
            return false;
          }

          const table = getTableWrapperFromTablePos(view, tablePos)?.querySelector('table');
          if (!table) return false;

          const nearEdge = isNearRightEdge(table, event.clientX);
          const nextActiveTablePos = nearEdge ? tablePos : null;

          if (nearEdge) {
            view.dom.classList.add('resize-cursor-table-outer');
          } else {
            view.dom.classList.remove('resize-cursor-table-outer');
          }

          if (pluginState?.activeTablePos !== nextActiveTablePos) {
            view.dispatch(
              view.state.tr.setMeta(tableOuterResizePluginKey, {
                activeTablePos: nextActiveTablePos,
                dragging: null,
              } satisfies OuterResizeState),
            );
          }

          return false;
        },

        mousedown(view, event) {
          const tablePos = getClosestTablePos(view.state);
          if (tablePos == null) return false;

          const wrapper = getTableWrapperFromTablePos(view, tablePos);
          const table = wrapper?.querySelector('table');
          if (!wrapper || !table || !isNearRightEdge(table, event.clientX)) return false;

          event.preventDefault();

          const dragging: DragState = {
            tablePos,
            startX: event.clientX,
            startPct: clampTableWidthPct(readCurrentWidthPct(table) ?? MAX_TABLE_WIDTH_PCT),
            containerWidthPx: getContainerWidthPx(wrapper),
          };
          let latestPct = dragging.startPct;

          view.dispatch(
            view.state.tr.setMeta(tableOuterResizePluginKey, {
              activeTablePos: tablePos,
              dragging,
            } satisfies OuterResizeState),
          );

          const onMove = (moveEvent: MouseEvent) => {
            const deltaPct =
              ((moveEvent.clientX - dragging.startX) / dragging.containerWidthPx) * 100;
            latestPct = clampTableWidthPct(dragging.startPct + deltaPct);
            previewTableWidth(table, latestPct);
            positionResizeHandle(view, table);
          };

          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            view.dom.classList.remove('resize-cursor-table-outer');

            setTableWidthPct(view, dragging.tablePos, latestPct);

            view.dispatch(
              view.state.tr.setMeta(tableOuterResizePluginKey, {
                activeTablePos: null,
                dragging: null,
              } satisfies OuterResizeState),
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
