import { Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { createTabsContent } from '../contentBlocks/model';
import { getEditorExtensions } from '../extensions';
import { createBlockMove } from './blockDrag';

const editors: Editor[] = [];
const isTable = (node: ProseMirrorNode) => node.type.name === 'table';

function paragraph(text = ''): JSONContent {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : undefined,
  };
}

function table(): JSONContent {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            content: [paragraph('Nested table')],
          },
        ],
      },
    ],
  };
}

function createEditor(content: JSONContent): Editor {
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

function findTablePos(editor: Editor): number {
  let result = -1;
  editor.state.doc.descendants((node, position) => {
    if (result < 0 && node.type.name === 'table') result = position;
  });
  return result;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('controlled block moves', () => {
  it('returns the mapped position after moving a nested table among siblings', () => {
    const tabs = createTabsContent();
    tabs.content![0].content = [paragraph('Before'), table(), paragraph('After')];
    const editor = createEditor({
      type: 'doc',
      content: [tabs, paragraph('Trailing')],
    });
    const tablePos = findTablePos(editor);
    const $tablePos = editor.state.doc.resolve(tablePos);
    const parentEnd = $tablePos.start() + $tablePos.parent.content.size;

    const move = createBlockMove(editor.state, tablePos, parentEnd, isTable);
    expect(move).not.toBeNull();
    expect(move?.transaction.doc.nodeAt(move.newBlockPos)?.type.name).toBe('table');

    editor.view.dispatch(move!.transaction);
    const item = editor.state.doc.nodeAt($tablePos.before($tablePos.depth));
    expect(item?.lastChild?.type.name).toBe('table');
  });

  it('rejects drop positions outside the dragged block parent', () => {
    const tabs = createTabsContent();
    tabs.content![0].content = [paragraph('Before'), table(), paragraph('After')];
    const editor = createEditor({
      type: 'doc',
      content: [tabs, paragraph('Trailing')],
    });

    expect(
      createBlockMove(editor.state, findTablePos(editor), editor.state.doc.content.size, isTable),
    ).toBeNull();
  });
});
