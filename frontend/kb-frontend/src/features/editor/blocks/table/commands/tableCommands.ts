import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
  columnIsHeader,
  moveTableRow,
  rowIsHeader,
  selectedRect,
  TableMap,
} from '@tiptap/pm/tables';
import { logDevError } from '../../../lib/utils/logDevError';
import {
  applyTextDirectionToActiveTable,
  readInheritedTextDirection,
} from '../../../extensions/TextDirection';
import { getActiveTable } from '../dom/tableDom';
import type { TableBorderAttributes } from '../utils/tableBorders';

export type TableHeaderState = {
  hasHeaderRow: boolean;
  hasHeaderColumn: boolean;
};

export type TableStructureCommand =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn';

export type TableActionCommand =
  | 'mergeCells'
  | 'splitCell'
  | 'deleteTable'
  | 'toggleHeaderRow'
  | 'toggleHeaderColumn';

export type TableCommand = TableStructureCommand | TableActionCommand;

const NO_HEADERS: TableHeaderState = {
  hasHeaderRow: false,
  hasHeaderColumn: false,
};

const NORMALIZED_EDGE_SIZE = 2;
type HeaderNormalizationScope = 'edge' | 'all';

function getTableMap(table: ProseMirrorNode): TableMap | null {
  try {
    return TableMap.get(table);
  } catch (error) {
    logDevError('Table map lookup failed:', error);
    return null;
  }
}

function hasUsableTableEditor(editor: Editor | null | undefined): editor is Editor {
  if (!editor || editor.isDestroyed || !editor.isEditable) return false;

  try {
    return Boolean(getActiveTable(editor.state));
  } catch (error) {
    logDevError('Table editor state check failed:', error);
    return false;
  }
}

function safelyRun(command: () => boolean): boolean {
  try {
    return command();
  } catch (error) {
    logDevError('Table command failed:', error);
    return false;
  }
}

export function getTableHeaderState(state: EditorState): TableHeaderState {
  try {
    const table = getActiveTable(state)?.node;
    if (!table) return NO_HEADERS;

    const map = getTableMap(table);
    if (!map || map.height === 0 || map.width === 0) return NO_HEADERS;

    return {
      hasHeaderRow: rowIsHeader(map, table, 0),
      hasHeaderColumn: columnIsHeader(map, table, 0),
    };
  } catch (error) {
    logDevError('Table header state lookup failed:', error);
    return NO_HEADERS;
  }
}

function canDeleteSelectedRowsOrColumns(
  state: EditorState,
  command: Extract<TableStructureCommand, 'deleteRow' | 'deleteColumn'>,
): boolean {
  try {
    const rect = selectedRect(state);
    return command === 'deleteRow'
      ? rect.top > 0 || rect.bottom < rect.map.height
      : rect.left > 0 || rect.right < rect.map.width;
  } catch (error) {
    logDevError('Table deletion availability check failed:', error);
    return false;
  }
}

function normalizeTableHeaders(
  tr: Transaction,
  headers: TableHeaderState,
  scope: HeaderNormalizationScope = 'edge',
): void {
  if (!headers.hasHeaderRow && !headers.hasHeaderColumn) return;

  const activeTable = getActiveTable(tr);
  const tableHeader = tr.doc.type.schema.nodes.tableHeader;
  const tableCell = tr.doc.type.schema.nodes.tableCell;
  if (!activeTable || !tableHeader || !tableCell) return;

  const map = getTableMap(activeTable.node);
  if (!map) return;

  const desiredTypes = new Map<number, typeof tableHeader>();
  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      // Normalize the first two edges so a displaced former header is demoted
      // after inserting before or deleting the current first row or column.
      if (
        scope === 'edge' &&
        row >= NORMALIZED_EDGE_SIZE &&
        column >= NORMALIZED_EDGE_SIZE
      ) {
        continue;
      }

      const relativeCellPos = map.map[row * map.width + column];
      const shouldBeHeader =
        (headers.hasHeaderRow && row === 0) ||
        (headers.hasHeaderColumn && column === 0);
      const current = desiredTypes.get(relativeCellPos);

      if (shouldBeHeader || !current) {
        desiredTypes.set(relativeCellPos, shouldBeHeader ? tableHeader : tableCell);
      }
    }
  }

  desiredTypes.forEach((type, relativeCellPos) => {
    const absoluteCellPos = activeTable.pos + 1 + relativeCellPos;
    const cell = tr.doc.nodeAt(absoluteCellPos);
    if (cell && cell.type !== type) {
      tr.setNodeMarkup(absoluteCellPos, type, cell.attrs);
    }
  });
}

export function runTableStructureCommand(
  editor: Editor | null | undefined,
  command: TableStructureCommand,
): boolean {
  if (!hasUsableTableEditor(editor)) return false;

  const headers = getTableHeaderState(editor.state);
  return safelyRun(() =>
    editor
      .chain()
      .focus()
      [command]()
      .command(({ tr }) => {
        normalizeTableHeaders(tr, headers);
        return true;
      })
      .run(),
  );
}

export function canRunTableCommand(
  editor: Editor | null | undefined,
  command: TableCommand,
): boolean {
  if (!hasUsableTableEditor(editor)) return false;
  if (
    (command === 'deleteRow' || command === 'deleteColumn') &&
    !canDeleteSelectedRowsOrColumns(editor.state, command)
  ) {
    return false;
  }
  return safelyRun(() => editor.can().chain().focus()[command]().run());
}

export function runTableActionCommand(
  editor: Editor | null | undefined,
  command: TableActionCommand,
): boolean {
  if (!hasUsableTableEditor(editor)) return false;

  return safelyRun(() => editor.chain().focus()[command]().run());
}

export function updateTableBorders(
  editor: Editor | null | undefined,
  attributes: Partial<TableBorderAttributes>,
): boolean {
  if (!hasUsableTableEditor(editor)) return false;

  return safelyRun(() =>
    editor.chain().focus().updateAttributes('table', attributes).run(),
  );
}

export function insertTable(
  editor: Editor | null | undefined,
  rows: number,
  cols: number,
): boolean {
  if (
    !editor ||
    editor.isDestroyed ||
    !editor.isEditable ||
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 1 ||
    cols < 1
  ) {
    return false;
  }

  const direction = readInheritedTextDirection(editor.state);

  return safelyRun(() =>
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .command(({ tr }) => {
        if (direction) applyTextDirectionToActiveTable(tr, direction);
        return true;
      })
      .run(),
  );
}

export function reorderTableRow(
  editor: Editor | null | undefined,
  from: number,
  to: number,
): boolean {
  if (
    !hasUsableTableEditor(editor) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from === to
  ) {
    return false;
  }

  const activeTable = getActiveTable(editor.state);
  const map = activeTable ? getTableMap(activeTable.node) : null;
  if (
    !activeTable ||
    !map ||
    from < 0 ||
    to < 0 ||
    from >= map.height ||
    to >= map.height
  ) {
    return false;
  }

  const headers = getTableHeaderState(editor.state);
  return safelyRun(() =>
    moveTableRow({ from, to, pos: activeTable.pos + 1 })(editor.state, (tr) => {
      normalizeTableHeaders(tr, headers, 'all');
      editor.view.dispatch(tr);
    }),
  );
}
