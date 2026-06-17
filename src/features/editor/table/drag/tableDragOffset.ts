import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  getActiveTablePos,
  getTableAtPos,
  getTableNodeAt,
  getTableWrapperAtPos,
} from '../dom/tableDom';
import {
  applyTableOffsetPct,
  normalizeTableOffsetPct,
  normalizeTableWidthPct,
  readTableOffsetPct,
  readTableWidthPct,
} from '../resizing/tableDimensions';

export type TableDragOffsetSession = {
  tablePos: number;
  tableNode: ProseMirrorNode;
  table: HTMLTableElement;
  startX: number;
  startOffsetPct: number;
  latestOffsetPct: number;
  tableWidthPct: number;
  containerWidthPx: number;
};

function readContainerWidthPx(editor: Editor, tablePos: number): number {
  const wrapper = getTableWrapperAtPos(editor.view, tablePos);
  const container = wrapper?.parentElement ?? wrapper;
  const width = container?.getBoundingClientRect().width;

  return typeof width === 'number' && Number.isFinite(width) && width > 0
    ? width
    : 1;
}

export function createTableDragOffsetSession(
  editor: Editor,
  tablePos: number,
  startX: number,
): TableDragOffsetSession | null {
  if (!editor.isEditable) return null;

  const tableNode = getTableNodeAt(editor.state.doc, tablePos);
  const table = getTableAtPos(editor.view, tablePos);
  if (!tableNode || !table) return null;

  const tableWidthPct = readTableWidthPct(table);
  const startOffsetPct = readTableOffsetPct(table, tableWidthPct);

  return {
    tablePos,
    tableNode,
    table,
    startX,
    startOffsetPct,
    latestOffsetPct: startOffsetPct,
    tableWidthPct,
    containerWidthPx: readContainerWidthPx(editor, tablePos),
  };
}

export function updateTableDragOffsetPreview(
  session: TableDragOffsetSession,
  clientX: number,
): number {
  const deltaPct =
    ((clientX - session.startX) / session.containerWidthPx) * 100;
  session.latestOffsetPct = applyTableOffsetPct(
    session.table,
    session.startOffsetPct + deltaPct,
    session.tableWidthPct,
  );

  return session.latestOffsetPct;
}

function findMatchingTablePos(
  editor: Editor,
  session: TableDragOffsetSession,
): number | null {
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && node.eq(session.tableNode)) {
      foundPos = pos;
      return false;
    }

    return true;
  });

  return foundPos;
}

export function resolveTableDragOffsetCommitPos(
  editor: Editor,
  session: TableDragOffsetSession,
): number | null {
  const activeTablePos = getActiveTablePos(editor.state);
  if (
    activeTablePos != null &&
    getTableNodeAt(editor.state.doc, activeTablePos)
  ) {
    return activeTablePos;
  }

  if (getTableNodeAt(editor.state.doc, session.tablePos)) {
    return session.tablePos;
  }

  return findMatchingTablePos(editor, session);
}

export function commitTableDragOffset(
  editor: Editor,
  session: TableDragOffsetSession,
): boolean {
  if (!editor.isEditable) return false;

  const tablePos = resolveTableDragOffsetCommitPos(editor, session);
  if (tablePos == null) return false;

  const tableNode = getTableNodeAt(editor.state.doc, tablePos);
  if (!tableNode) return false;

  const tableWidthPct = normalizeTableWidthPct(tableNode.attrs.tableWidthPct);
  const tableOffsetPct = normalizeTableOffsetPct(
    session.latestOffsetPct,
    tableWidthPct,
  );

  if (tableNode.attrs.tableOffsetPct === tableOffsetPct) return false;

  const transaction = editor.state.tr.setNodeMarkup(tablePos, undefined, {
    ...tableNode.attrs,
    tableOffsetPct,
  });

  editor.view.dispatch(transaction);
  return true;
}

export function restoreTableDragOffsetPreview(
  session: TableDragOffsetSession,
): void {
  applyTableOffsetPct(
    session.table,
    session.startOffsetPct,
    session.tableWidthPct,
  );
}
