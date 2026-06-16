import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '.';

const editors: Editor[] = [];

function listItem(text: string, nested?: JSONContent): JSONContent {
  return {
    type: 'listItem',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text }] },
      ...(nested ? [nested] : []),
    ],
  };
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('list styles', () => {
  it('persists ordered and bullet variants in JSON and rendered HTML', () => {
    const editor = new Editor({
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { listStyle: 'upper-roman' },
            content: [listItem('Roman')],
          },
          {
            type: 'bulletList',
            attrs: { listStyle: 'square' },
            content: [listItem('Square')],
          },
        ],
      },
    });
    editors.push(editor);

    expect(editor.getJSON().content?.[0].attrs?.listStyle).toBe('upper-roman');
    expect(editor.getJSON().content?.[1].attrs?.listStyle).toBe('square');
    expect(editor.getHTML()).toContain('data-list-style="upper-roman"');
    expect(editor.getHTML()).toContain('list-style-type: square');
    expect(generateHTML(editor.getJSON(), getEditorExtensions())).toBe(editor.getHTML());
  });

  it('changes only the closest nested list', () => {
    const editor = new Editor({
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { listStyle: 'decimal' },
            content: [
              listItem('Outer', {
                type: 'orderedList',
                attrs: { listStyle: 'lower-alpha' },
                content: [listItem('Inner')],
              }),
            ],
          },
        ],
      },
    });
    editors.push(editor);

    const innerTextPosition = 10;
    editor.commands.setTextSelection(innerTextPosition);
    expect(editor.commands.setListStyle('orderedList', 'upper-roman')).toBe(true);

    const outer = editor.state.doc.firstChild!;
    const inner = outer.firstChild?.lastChild;
    expect(outer.attrs.listStyle).toBe('decimal');
    expect(inner?.attrs.listStyle).toBe('upper-roman');
  });

  it('creates and styles a list in one toolbar-style chain', () => {
    const editor = new Editor({
      extensions: getEditorExtensions(),
      content: '<p>Square</p>',
    });
    editors.push(editor);
    editor.commands.selectAll();

    expect(
      editor
        .chain()
        .focus()
        .toggleBulletList()
        .setListStyle('bulletList', 'square')
        .run(),
    ).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe('bulletList');
    expect(editor.state.doc.firstChild?.attrs.listStyle).toBe('square');
  });
});
