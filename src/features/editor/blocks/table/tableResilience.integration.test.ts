import { Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { createAccordionContent, createTabsContent } from '../model';
import { getEditorExtensions } from '../../extensions';

const editors: Editor[] = [];

function createEditor(content?: JSONContent): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    content,
  });
  editors.push(editor);
  return editor;
}

function paragraph(text = '', marks?: JSONContent['marks']): JSONContent {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text, marks }] : undefined,
  };
}

function formattedTable(): JSONContent {
  return {
    type: 'table',
    attrs: {
      tableWidthPct: 80,
      tableOffsetPct: 10,
      borderTopEnabled: true,
      borderRightEnabled: false,
      borderBottomEnabled: true,
      borderLeftEnabled: false,
      borderInnerEnabled: true,
    },
    content: Array.from({ length: 3 }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: 3 }, (_, column) => ({
        type: row === 0 ? 'tableHeader' : 'tableCell',
        content: [
          paragraph(`R${row + 1}C${column + 1}`, [
            column === 1 ? { type: 'italic' } : { type: 'bold' },
          ]),
        ],
      })),
    })),
  };
}

function findNode(
  editor: Editor,
  typeName: string,
  occurrence = 0,
): { node: ProseMirrorNode; position: number } | null {
  let currentOccurrence = 0;
  let result: { node: ProseMirrorNode; position: number } | null = null;

  editor.state.doc.descendants((node, position) => {
    if (result || node.type.name !== typeName) return;
    if (currentOccurrence === occurrence) {
      result = { node, position };
      return false;
    }
    currentOccurrence += 1;
  });

  return result;
}

function selectCell(
  editor: Editor,
  row: number,
  column: number,
  headRow = row,
  headColumn = column,
): void {
  const table = findNode(editor, 'table');
  if (!table) throw new Error('Expected a table');
  const map = TableMap.get(table.node);
  const start = table.position + 1;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(
        editor.state.doc,
        start + map.map[row * map.width + column],
        start + map.map[headRow * map.width + headColumn],
      ),
    ),
  );
}

function countNodes(editor: Editor, typeName: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1;
  });
  return count;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('table resilience', () => {
  it.each(['tabItem', 'accordionItem'])(
    'inserts a table inside a %s body',
    (itemType) => {
      const editor = createEditor({
        type: 'doc',
        content: [
          createTabsContent(),
          createAccordionContent(),
          paragraph('Trailing paragraph'),
        ],
      });
      const item = findNode(editor, itemType);
      expect(item).not.toBeNull();

      editor.commands.setTextSelection(item!.position + 2);
      expect(
        editor.commands.insertTable({
          rows: 2,
          cols: 2,
          withHeaderRow: true,
        }),
      ).toBe(true);

      const updatedItem = findNode(editor, itemType);
      let nestedTables = 0;
      updatedItem?.node.descendants((node) => {
        if (node.type.name === 'table') nestedTables += 1;
      });
      expect(nestedTables).toBe(1);
    },
  );

  it.each([
    ['row', 'deleteRow', 'R2C1'],
    ['column', 'deleteColumn', 'R1C2'],
  ] as const)(
    'undoes deletion of a formatted %s without losing content or table attrs',
    (_kind, command, removedText) => {
      const editor = createEditor({
        type: 'doc',
        content: [formattedTable(), paragraph('Trailing paragraph')],
      });
      const before = editor.getJSON();
      selectCell(editor, 1, 1);

      expect(editor.commands[command]()).toBe(true);
      expect(editor.state.doc.textContent).not.toContain(removedText);

      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(before);
      expect(findNode(editor, 'table')?.node.attrs).toMatchObject({
        tableWidthPct: 80,
        tableOffsetPct: 10,
        borderRightEnabled: false,
        borderLeftEnabled: false,
      });

      expect(editor.commands.redo()).toBe(true);
      expect(editor.state.doc.textContent).not.toContain(removedText);
    },
  );

  it('preserves merged cells through save/load and can split them after restore', () => {
    const editor = createEditor({
      type: 'doc',
      content: [formattedTable(), paragraph('Trailing paragraph')],
    });
    selectCell(editor, 1, 0, 1, 1);

    expect(editor.commands.mergeCells()).toBe(true);
    const merged = findNode(editor, 'table')!;
    expect(TableMap.get(merged.node).width).toBe(3);
    expect(merged.node.child(1).child(0).attrs.colspan).toBe(2);
    expect(merged.node.child(1).child(0).textContent).toContain('R2C1');
    expect(merged.node.child(1).child(0).textContent).toContain('R2C2');

    const restored = createEditor(editor.getJSON());
    const restoredTable = findNode(restored, 'table')!;
    expect(restoredTable.node.child(1).child(0).attrs.colspan).toBe(2);
    selectCell(restored, 1, 0);
    expect(restored.commands.splitCell()).toBe(true);
    expect(restoredTable.node.attrs).toMatchObject({
      tableWidthPct: 80,
      tableOffsetPct: 10,
    });
    expect(TableMap.get(findNode(restored, 'table')!.node).width).toBe(3);
  });

  it('moves between table cells with Tab and Shift+Tab without changing structure', () => {
    const editor = createEditor({
      type: 'doc',
      content: [formattedTable(), paragraph('Trailing paragraph')],
    });
    const table = findNode(editor, 'table')!;
    const map = TableMap.get(table.node);
    const firstCellTextPosition = table.position + 1 + map.map[0] + 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, firstCellTextPosition),
      ),
    );
    const initialPosition = editor.state.selection.from;
    const initialJson = editor.getJSON();

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.state.selection.from).not.toBe(initialPosition);
    expect(countNodes(editor, 'table')).toBe(1);

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.state.selection.from).toBe(initialPosition);
    expect(editor.getJSON()).toEqual(initialJson);
  });
});
