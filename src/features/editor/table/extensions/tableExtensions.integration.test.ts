import { Editor } from '@tiptap/core';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import {
  createTableMoveTransaction,
  resolveTableDragAxis,
} from '../plugins/TableDragHandlePlugin';

type DataTransferStub = {
  values: Map<string, string>;
  clearData: () => void;
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
  effectAllowed: string;
};

function createDataTransfer(): DataTransferStub {
  const values = new Map<string, string>();

  return {
    values,
    clearData: () => values.clear(),
    setData: (type, value) => values.set(type, value),
    getData: (type) => values.get(type) ?? '',
    effectAllowed: 'none',
  };
}

describe('table extensions integration', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('creates a full-width table with a visible drag handle', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });

    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });

    const table = element.querySelector<HTMLTableElement>('table');
    const handle = element.querySelector<HTMLButtonElement>('.table-drag-handle');

    expect(table?.dataset.tableWidthPct).toBe('100');
    expect(table?.style.getPropertyValue('--table-width-pct')).toBe('100%');
    expect(table?.dataset.tableOffsetPct).toBe('0');
    expect(handle?.draggable).toBe(true);
  });

  it('locks table dragging to the dominant axis after a small movement', () => {
    expect(resolveTableDragAxis(2, 3, null)).toBeNull();
    expect(resolveTableDragAxis(8, 3, null)).toBe('horizontal');
    expect(resolveTableDragAxis(30, -6, null)).toBe('vertical');
    expect(resolveTableDragAxis(30, 1, 'vertical')).toBe('vertical');
  });

  it('persists border settings through JSON and HTML rendering', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    editor.commands.updateAttributes('table', {
      borderTopEnabled: false,
      borderRightEnabled: true,
      borderBottomEnabled: false,
      borderLeftEnabled: true,
      borderInnerEnabled: false,
    });

    const json = editor.getJSON();
    const tableJson = json.content?.find((node) => node.type === 'table');
    expect(tableJson?.attrs).toMatchObject({
      borderTopEnabled: false,
      borderRightEnabled: true,
      borderBottomEnabled: false,
      borderLeftEnabled: true,
      borderInnerEnabled: false,
    });
    expect(editor.getHTML()).toContain('data-table-border-top="false"');
    expect(editor.getHTML()).toContain('data-table-border-inner="false"');

    const restoredElement = document.createElement('div');
    document.body.append(restoredElement);
    const restoredEditor = new Editor({
      element: restoredElement,
      extensions: getEditorExtensions(),
      content: json,
    });

    expect(restoredEditor.getAttributes('table')).toMatchObject({
      borderTopEnabled: false,
      borderBottomEnabled: false,
      borderInnerEnabled: false,
    });
    restoredEditor.destroy();
  });

  it('loads existing tables without border attributes with all borders enabled', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({
      element,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(editor.getAttributes('table')).toMatchObject({
      borderTopEnabled: true,
      borderRightEnabled: true,
      borderBottomEnabled: true,
      borderLeftEnabled: true,
      borderInnerEnabled: true,
    });
    expect(element.querySelector('table')?.dataset.tableBorderTop).toBe('true');
    expect(element.querySelector('table')?.dataset.tableBorderInner).toBe('true');
  });

  it('merges and splits cells without corrupting the table map', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const table = editor.state.doc.firstChild;
    const map = TableMap.get(table!);
    const tableStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(
          editor.state.doc,
          tableStart + map.map[0],
          tableStart + map.map[1],
        ),
      ),
    );

    expect(editor.commands.mergeCells()).toBe(true);
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs.colspan).toBe(2);
    expect(TableMap.get(editor.state.doc.firstChild!).width).toBe(2);

    expect(editor.commands.splitCell()).toBe(true);
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs.colspan).toBe(1);
    expect(TableMap.get(editor.state.doc.firstChild!).width).toBe(2);
  });

  it.each(['Delete', 'Backspace'])(
    'clears selected cell content with %s without deleting the table structure',
    (key) => {
      const element = document.createElement('div');
      document.body.append(element);
      editor = new Editor({ element, extensions: getEditorExtensions() });
      editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      editor.commands.insertContent('Selected content');

      const table = editor.state.doc.firstChild;
      const map = TableMap.get(table!);
      const tableStart = 1;
      editor.view.dispatch(
        editor.state.tr.setSelection(
          CellSelection.create(
            editor.state.doc,
            tableStart + map.map[0],
            tableStart + map.map[map.map.length - 1],
          ),
        ),
      );

      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );

      const updatedTable = editor.state.doc.firstChild;
      expect(updatedTable?.type.name).toBe('table');
      expect(TableMap.get(updatedTable!).width).toBe(2);
      expect(TableMap.get(updatedTable!).height).toBe(2);
      expect(updatedTable?.textContent).toBe('');
    },
  );

  it('moves a table one block down with a single transaction', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const tr = createTableMoveTransaction(editor.state, 0, editor.state.doc.content.size);
    expect(tr).not.toBeNull();

    editor.view.dispatch(tr!);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).type.name).toBe('table');
  });

  it('serializes the table drag payload without detaching the handle', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const handle = element.querySelector<HTMLButtonElement>('.table-drag-handle');
    const dataTransfer = createDataTransfer();
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });

    handle?.dispatchEvent(dragStart);

    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.getData('text/html')).toContain('<table');
    expect(handle?.isConnected).toBe(true);
  });

  it('keeps table mutation handles inert while the editor is read-only', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({
      element,
      editable: false,
      extensions: getEditorExtensions(),
    });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const before = editor.getJSON();
    const handle = element.querySelector<HTMLButtonElement>('.table-drag-handle');
    const dataTransfer = createDataTransfer();
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
    handle?.dispatchEvent(dragStart);

    expect(editor.view.editable).toBe(false);
    expect(handle?.hidden).toBe(true);
    expect(handle?.draggable).toBe(false);
    expect(dataTransfer.effectAllowed).toBe('none');
    expect(editor.getJSON()).toEqual(before);
  });
});
