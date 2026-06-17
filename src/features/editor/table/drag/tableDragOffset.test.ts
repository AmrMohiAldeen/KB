import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import {
  commitTableDragOffset,
  createTableDragOffsetSession,
  updateTableDragOffsetPreview,
} from './tableDragOffset';

const tableContent: JSONContent = {
  type: 'table',
  attrs: {
    tableWidthPct: 60,
    tableOffsetPct: 10,
  },
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
};

function createEditor(content: JSONContent): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  return new Editor({
    element,
    extensions: getEditorExtensions(),
    content,
  });
}

function tablePos(editor: Editor): number {
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      foundPos = pos;
      return false;
    }

    return true;
  });

  expect(foundPos).not.toBeNull();
  return foundPos!;
}

function setEditorWidth(editor: Editor, width: number): void {
  editor.view.dom.getBoundingClientRect = () => ({ width }) as DOMRect;
}

describe('table drag offset', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('previews and commits horizontal table movement as tableOffsetPct', () => {
    editor = createEditor({
      type: 'doc',
      content: [tableContent],
    });
    setEditorWidth(editor, 500);

    const pos = tablePos(editor);
    const session = createTableDragOffsetSession(editor, pos, 100);
    expect(session).not.toBeNull();

    expect(updateTableDragOffsetPreview(session!, 150)).toBe(20);
    expect(editor.view.dom.querySelector('table')?.dataset.tableOffsetPct).toBe(
      '20',
    );
    expect(commitTableDragOffset(editor, session!)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)?.attrs.tableOffsetPct).toBe(20);
  });

  it('commits the horizontal offset to the moved table after vertical drag reorder', () => {
    editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        tableContent,
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    });
    setEditorWidth(editor, 500);

    const originalTablePos = tablePos(editor);
    const table = editor.state.doc.nodeAt(originalTablePos)!;
    const session = createTableDragOffsetSession(editor, originalTablePos, 100);
    expect(session).not.toBeNull();
    updateTableDragOffsetPreview(session!, 150);

    const deleteTo = originalTablePos + table.nodeSize;
    let transaction = editor.state.tr.delete(originalTablePos, deleteTo);
    const insertPos = transaction.doc.content.size;
    transaction = transaction.insert(insertPos, table);
    transaction = transaction.setSelection(
      NodeSelection.create(transaction.doc, insertPos),
    );
    editor.view.dispatch(transaction);
    const movedTablePos = tablePos(editor);

    expect(commitTableDragOffset(editor, session!)).toBe(true);
    expect(movedTablePos).toBe(insertPos);
    expect(editor.state.doc.nodeAt(movedTablePos)?.attrs.tableOffsetPct).toBe(20);
  });

  it('does not start horizontal table dragging in read-only editors', () => {
    editor = createEditor({
      type: 'doc',
      content: [tableContent],
    });
    editor.setEditable(false);

    expect(createTableDragOffsetSession(editor, tablePos(editor), 100)).toBeNull();
  });
});
