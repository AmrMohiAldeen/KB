import { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEditorExtensions } from '../../../extensions';
import { getActiveTable } from '../dom/tableDom';
import {
  canRunTableCommand,
  getTableHeaderState,
  insertTable,
  reorderTableRow,
  runTableActionCommand,
  runTableStructureCommand,
  updateTableBorders,
} from './tableCommands';

function cellTypeMatrix(table: ProseMirrorNode): string[][] {
  const map = TableMap.get(table);
  return Array.from({ length: map.height }, (_, row) =>
    Array.from({ length: map.width }, (_, column) => {
      const cell = table.nodeAt(map.map[row * map.width + column]);
      return cell?.type.name ?? 'missing';
    }),
  );
}

describe('table structure commands', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const createEditor = () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    return editor;
  };

  const createEditorWithRowAndColumnHeaders = () => {
    const currentEditor = createEditor();
    currentEditor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    currentEditor.commands.toggleHeaderColumn();
    currentEditor.view.dispatch(closeHistory(currentEditor.state.tr));
    return currentEditor;
  };

  const selectCells = (
    currentEditor: Editor,
    anchorRow: number,
    anchorColumn: number,
    headRow: number,
    headColumn: number,
  ) => {
    const activeTable = getActiveTable(currentEditor.state);
    if (!activeTable) throw new Error('Expected an active table');

    const map = TableMap.get(activeTable.node);
    const tableStart = activeTable.pos + 1;
    currentEditor.view.dispatch(
      currentEditor.state.tr.setSelection(
        CellSelection.create(
          currentEditor.state.doc,
          tableStart + map.map[anchorRow * map.width + anchorColumn],
          tableStart + map.map[headRow * map.width + headColumn],
        ),
      ),
    );
  };

  it('fails safely without an active, editable table editor', () => {
    const currentEditor = createEditor();
    const before = currentEditor.getJSON();

    expect(runTableStructureCommand(null, 'addRowBefore')).toBe(false);
    expect(runTableActionCommand(undefined, 'deleteTable')).toBe(false);
    expect(insertTable(null, 2, 2)).toBe(false);
    expect(insertTable(currentEditor, 0, 2)).toBe(false);
    expect(canRunTableCommand(currentEditor, 'deleteRow')).toBe(false);
    expect(runTableStructureCommand(currentEditor, 'deleteRow')).toBe(false);
    expect(runTableActionCommand(currentEditor, 'mergeCells')).toBe(false);
    expect(updateTableBorders(currentEditor, { borderTopEnabled: false })).toBe(false);
    expect(currentEditor.getJSON()).toEqual(before);

    currentEditor.destroy();
    expect(insertTable(currentEditor, 2, 2)).toBe(false);
    expect(runTableActionCommand(currentEditor, 'deleteTable')).toBe(false);
    editor = null;
  });

  it('logs unexpected table command errors in development and still fails safely', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const currentEditor = createEditor();
    currentEditor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const error = new Error('Unexpected command failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(currentEditor, 'can').mockImplementation(() => {
      throw error;
    });

    expect(canRunTableCommand(currentEditor, 'mergeCells')).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('Table command failed:', error);
  });

  it('inserts valid tables through the safe command boundary', () => {
    const currentEditor = createEditor();

    expect(insertTable(currentEditor, 2, 2)).toBe(true);
    expect(getTableHeaderState(currentEditor.state).hasHeaderRow).toBe(true);
  });

  it('keeps an inserted row below the header as normal cells', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();

    expect(runTableStructureCommand(currentEditor, 'addRowAfter')).toBe(true);
    const table = getActiveTable(currentEditor.state)?.node;
    expect(table).toBeDefined();
    expect(cellTypeMatrix(table!)[1]).toEqual([
      'tableHeader',
      'tableCell',
      'tableCell',
    ]);
  });

  it('keeps edge headers in place when rows are reordered', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();

    expect(reorderTableRow(currentEditor, 0, 2)).toBe(true);
    let table = getActiveTable(currentEditor.state)?.node;
    expect(table).toBeDefined();
    expect(cellTypeMatrix(table!)[0]).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    expect(cellTypeMatrix(table!)[2]).toEqual([
      'tableHeader',
      'tableCell',
      'tableCell',
    ]);

    currentEditor.commands.undo();
    table = getActiveTable(currentEditor.state)?.node;
    expect(cellTypeMatrix(table!)[0]).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    expect(reorderTableRow(currentEditor, -1, 2)).toBe(false);
  });

  it('promotes the next row when deleting the header row through a cell selection', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();
    selectCells(currentEditor, 0, 0, 0, 2);

    expect(runTableStructureCommand(currentEditor, 'deleteRow')).toBe(true);
    const table = getActiveTable(currentEditor.state)?.node;
    expect(table).toBeDefined();
    expect(TableMap.get(table!).height).toBe(2);
    expect(cellTypeMatrix(table!)[0]).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    expect(cellTypeMatrix(table!)[1]).toEqual([
      'tableHeader',
      'tableCell',
      'tableCell',
    ]);
  });

  it('disables row deletion when selected cells cover every row', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();
    selectCells(currentEditor, 0, 0, 2, 2);
    const before = currentEditor.getJSON();

    expect(canRunTableCommand(currentEditor, 'deleteRow')).toBe(false);
    expect(runTableStructureCommand(currentEditor, 'deleteRow')).toBe(false);
    expect(currentEditor.getJSON()).toEqual(before);
  });

  it('disables column deletion when selected cells cover every column', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();
    selectCells(currentEditor, 0, 0, 2, 2);

    expect(canRunTableCommand(currentEditor, 'deleteColumn')).toBe(false);
  });

  it('updates borders only for an active table', () => {
    const currentEditor = createEditor();
    currentEditor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    expect(updateTableBorders(currentEditor, { borderTopEnabled: false })).toBe(true);
    expect(currentEditor.getAttributes('table').borderTopEnabled).toBe(false);
  });

  it('keeps edge headers consistent when inserting before and undoing or redoing', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();

    expect(runTableStructureCommand(currentEditor, 'addRowBefore')).toBe(true);
    let table = getActiveTable(currentEditor.state)?.node;
    expect(table).toBeDefined();
    expect(getTableHeaderState(currentEditor.state)).toEqual({
      hasHeaderRow: true,
      hasHeaderColumn: true,
    });
    expect(cellTypeMatrix(table!)[1]).toEqual([
      'tableHeader',
      'tableCell',
      'tableCell',
    ]);

    currentEditor.commands.undo();
    table = getActiveTable(currentEditor.state)?.node;
    expect(TableMap.get(table!).height).toBe(3);

    currentEditor.commands.redo();
    table = getActiveTable(currentEditor.state)?.node;
    expect(TableMap.get(table!).height).toBe(4);
    expect(getTableHeaderState(currentEditor.state)).toEqual({
      hasHeaderRow: true,
      hasHeaderColumn: true,
    });
  });

  it('promotes the new first column to a header after deleting the old one', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();

    expect(runTableStructureCommand(currentEditor, 'deleteColumn')).toBe(true);
    let table = getActiveTable(currentEditor.state)?.node;
    expect(table).toBeDefined();
    expect(TableMap.get(table!).width).toBe(2);
    expect(getTableHeaderState(currentEditor.state)).toEqual({
      hasHeaderRow: true,
      hasHeaderColumn: true,
    });
    expect(cellTypeMatrix(table!)[1][0]).toBe('tableHeader');

    currentEditor.commands.undo();
    table = getActiveTable(currentEditor.state)?.node;
    expect(TableMap.get(table!).width).toBe(3);

    currentEditor.commands.redo();
    table = getActiveTable(currentEditor.state)?.node;
    expect(TableMap.get(table!).width).toBe(2);
    expect(getTableHeaderState(currentEditor.state).hasHeaderColumn).toBe(true);
  });

  it('does not run structure commands while the editor is read-only', () => {
    const currentEditor = createEditorWithRowAndColumnHeaders();
    currentEditor.setEditable(false, false);
    const before = currentEditor.getJSON();

    expect(runTableStructureCommand(currentEditor, 'addRowBefore')).toBe(false);
    expect(currentEditor.getJSON()).toEqual(before);
  });
});
