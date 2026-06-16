import { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Plugin } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import {
  createTableMoveTransaction,
  getTableDragIntent,
} from '../plugins/TableDragHandlePlugin';
import { rowResizePluginKey } from '../plugins/RowResizePlugin';
import { tableOuterResizePluginKey } from '../plugins/TableOuterResizePlugin';

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

function pluginMouseEvent(
  type: 'mousedown' | 'mousemove',
  target: HTMLElement,
  clientX: number,
  clientY: number,
): MouseEvent {
  const event = new MouseEvent(type, {
    button: 0,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function callPluginMouseEvent(
  editor: Editor,
  plugin: Plugin | undefined,
  type: 'mousedown' | 'mousemove',
  event: MouseEvent,
): void {
  const handler = plugin?.props.handleDOMEvents?.[type] as
    | ((view: typeof editor.view, mouseEvent: MouseEvent) => boolean | void)
    | undefined;
  handler?.(editor.view, event);
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
    expect(handle?.draggable).toBe(false);
  });

  it('activates horizontal and vertical table drag intent independently', () => {
    expect(getTableDragIntent(2, 3)).toEqual({
      horizontal: false,
      vertical: false,
    });
    expect(getTableDragIntent(8, 3)).toEqual({
      horizontal: true,
      vertical: false,
    });
    expect(getTableDragIntent(30, -9)).toEqual({
      horizontal: true,
      vertical: true,
    });
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

  it.each([
    ['columns', 1, 2],
    ['rows', 2, 1],
  ] as const)('redistributes merged content across split %s', (_label, rows, cols) => {
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
            content: Array.from({ length: rows }, (_, row) => ({
              type: 'tableRow',
              content: Array.from({ length: cols }, (_, column) => ({
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: `${row},${column}` }],
                  },
                ],
              })),
            })),
          },
        ],
      },
    });

    const table = editor.state.doc.firstChild!;
    const map = TableMap.get(table);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(
          editor.state.doc,
          1 + map.map[0],
          1 + map.map[map.map.length - 1],
        ),
      ),
    );
    expect(editor.commands.mergeCells()).toBe(true);
    expect(editor.commands.splitCell()).toBe(true);

    const splitTable = editor.state.doc.firstChild!;
    const splitMap = TableMap.get(splitTable);
    const values = splitMap.map.map((pos) => splitTable.nodeAt(pos)?.textContent);
    expect(values).toEqual(
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, column) => `${row},${column}`),
      ).flat(),
    );
  });

  it('persists cell background colors and formatting defaults for empty cells', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 1, cols: 2, withHeaderRow: false });

    const table = editor.state.doc.firstChild!;
    const map = TableMap.get(table);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, 1 + map.map[0], 1 + map.map[1]),
      ),
    );

    expect(
      editor
        .chain()
        .setCellAttribute('backgroundColor', '#bfdbfe')
        .setEmptyCellDefaultMark('textStyle', {
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
        })
        .run(),
    ).toBe(true);

    const formattedTable = editor.state.doc.firstChild!;
    expect(formattedTable.firstChild?.firstChild?.attrs.backgroundColor).toBe(
      '#bfdbfe',
    );
    expect(formattedTable.firstChild?.firstChild?.attrs.defaultMarks).toEqual({
      textStyle: {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
      },
    });
    expect(editor.getHTML()).toContain('data-cell-background-color="#bfdbfe"');
    expect(editor.getHTML()).toContain('data-cell-default-marks=');

    const updatedMap = TableMap.get(formattedTable);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 1 + updatedMap.map[1] + 2),
      ),
    );
    editor.commands.insertContent('Later');

    const inserted = editor.state.doc.firstChild?.firstChild?.child(1).textContent;
    const insertedText = editor.state.doc.firstChild?.firstChild?.child(1).firstChild
      ?.firstChild;
    expect(inserted).toBe('Later');
    expect(insertedText?.marks[0]?.type.name).toBe('textStyle');
    expect(insertedText?.marks[0]?.attrs).toMatchObject({
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
    });

    expect(editor.commands.clearEmptyCellDefaultMarks()).toBe(true);
    expect(
      editor.state.doc.firstChild?.firstChild?.child(1).attrs.defaultMarks,
    ).toBeNull();
  });

  it('stores row heights once on rows and preserves row spans through reload', () => {
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
                attrs: { rowHeight: 48 },
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { rowspan: 2 },
                    content: [{ type: 'paragraph' }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
              {
                type: 'tableRow',
                attrs: { rowHeight: 36 },
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

    const table = editor.state.doc.firstChild!;
    expect(table.child(0).attrs.rowHeight).toBe(48);
    expect(table.child(1).attrs.rowHeight).toBe(36);
    expect(table.child(0).child(0).attrs).toMatchObject({
      rowspan: 2,
      rowHeight: null,
    });
    expect(editor.getHTML()).toContain('data-row-height="48"');
    expect(element.querySelector('tr')?.style.height).toBe('48px');
    expect(element.querySelector('th')?.hasAttribute('data-row-height')).toBe(false);

    const restored = new Editor({
      extensions: getEditorExtensions(),
      content: editor.getJSON(),
    });
    expect(restored.state.doc.firstChild?.child(0).attrs.rowHeight).toBe(48);
    expect(restored.state.doc.firstChild?.child(0).child(0).attrs.rowspan).toBe(2);
    restored.destroy();
  });

  it('detects a row edge inside a cell that spans multiple rows', () => {
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
                    type: 'tableHeader',
                    attrs: { rowspan: 2 },
                    content: [{ type: 'paragraph' }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
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

    const rows = element.querySelectorAll<HTMLTableRowElement>('tr');
    const spanningCell = element.querySelector<HTMLTableCellElement>('th')!;
    rows[0].getBoundingClientRect = () => ({ bottom: 30 }) as DOMRect;
    rows[1].getBoundingClientRect = () => ({ bottom: 60 }) as DOMRect;
    spanningCell.getBoundingClientRect = () => ({ bottom: 60 }) as DOMRect;

    callPluginMouseEvent(
      editor,
      rowResizePluginKey.get(editor.state),
      'mousemove',
      pluginMouseEvent('mousemove', spanningCell, 10, 30),
    );

    expect(rowResizePluginKey.getState(editor.state)?.active?.rowIndex).toBe(0);
  });

  it('migrates legacy cell row heights to row attrs outside history', async () => {
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
                    attrs: { rowHeight: 52 },
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(editor.state.doc.firstChild?.firstChild?.attrs.rowHeight).toBe(52);
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs.rowHeight).toBeNull();
    expect(editor.commands.undo()).toBe(false);
  });

  it('renders legacy row heights without mutating a read-only document', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({
      element,
      editable: false,
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
                    attrs: { rowHeight: 46 },
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const before = editor.getJSON();

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(editor.getJSON()).toEqual(before);
    expect(element.querySelector('td')?.style.height).toBe('46px');
  });

  it('keeps a normal row height through cell merging and undo/redo', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const table = editor.state.doc.firstChild!;
    const secondRowPos = 1 + table.child(0).nodeSize;
    const secondRow = editor.state.doc.nodeAt(secondRowPos)!;
    editor.view.dispatch(
      closeHistory(
        editor.state.tr.setNodeMarkup(secondRowPos, undefined, {
          ...secondRow.attrs,
          rowHeight: 54,
        }),
      ),
    );

    const updatedTable = editor.state.doc.firstChild!;
    const map = TableMap.get(updatedTable);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(
          editor.state.doc,
          1 + map.map[map.width],
          1 + map.map[map.width + 1],
        ),
      ),
    );
    expect(editor.commands.mergeCells()).toBe(true);
    expect(editor.state.doc.nodeAt(secondRowPos)?.attrs.rowHeight).toBe(54);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.nodeAt(secondRowPos)?.attrs.rowHeight).toBeNull();
    expect(editor.commands.redo()).toBe(true);
    expect(editor.state.doc.nodeAt(secondRowPos)?.attrs.rowHeight).toBe(54);
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

  it('prevents native drag sessions without detaching the controlled handle', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const handle = element.querySelector<HTMLButtonElement>('.table-drag-handle');
    const dataTransfer = createDataTransfer();
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });

    handle?.dispatchEvent(dragStart);

    expect(dragStart.defaultPrevented).toBe(true);
    expect(dataTransfer.effectAllowed).toBe('none');
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
    handle?.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 10,
        clientY: 10,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    callPluginMouseEvent(
      editor,
      rowResizePluginKey.get(editor.state),
      'mousedown',
      pluginMouseEvent('mousedown', element.querySelector('th')!, 0, 0),
    );
    callPluginMouseEvent(
      editor,
      tableOuterResizePluginKey.get(editor.state),
      'mousedown',
      pluginMouseEvent('mousedown', element.querySelector('table')!, 0, 0),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(editor.view.editable).toBe(false);
    expect(handle?.hidden).toBe(true);
    expect(handle?.draggable).toBe(false);
    expect(dataTransfer.effectAllowed).toBe('none');
    expect(editor.getJSON()).toEqual(before);
  });

  it('cancels a controlled table drag when the table is deleted', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const handle = element.querySelector<HTMLButtonElement>('.table-drag-handle')!;
    handle.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 10,
        clientY: 10,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));

    expect(editor.commands.deleteTable()).toBe(true);
    expect(() => window.dispatchEvent(new MouseEvent('mouseup'))).not.toThrow();
    expect(editor.state.doc.firstChild?.type.name).not.toBe('table');
    expect(document.querySelector('.kb-block-drop-indicator')).toBeNull();
  });

  it.each([
    ['row resize', 'th', 10, 0],
    ['outer resize', 'table', 0, 0],
  ] as const)('cancels an active %s session when the table is deleted', (
    _name,
    selector,
    clientX,
    clientY,
  ) => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const target = element.querySelector<HTMLElement>(selector)!;
    const key = selector === 'th' ? rowResizePluginKey : tableOuterResizePluginKey;
    callPluginMouseEvent(
      editor,
      key.get(editor.state),
      'mousedown',
      pluginMouseEvent('mousedown', target, clientX, clientY),
    );

    expect(editor.commands.deleteTable()).toBe(true);
    expect(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    }).not.toThrow();
    expect(editor.state.doc.firstChild?.type.name).not.toBe('table');
  });
});
