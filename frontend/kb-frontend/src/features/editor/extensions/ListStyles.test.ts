import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from './';

/**
 * These tests cover the custom list-style extensions and commands:
 * - listStyle persistence in editor JSON and rendered HTML
 * - parsing list styles from saved HTML, pasted CSS, and native <ol type="..."> HTML
 * - safe defaults for invalid list-style values
 * - changing only the nearest selected list
 * - toolbar-style command chains
 * - Tab / Shift+Tab nested-list keyboard behavior
 * - ordered-list start attribute rendering
 */
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

function createEditor(content: string | JSONContent): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content,
  });

  editors.push(editor);

  return editor;
}

function findTextPosition(editor: Editor, text: string): number {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (position !== null) return false;

    if (node.isText && node.text?.includes(text)) {
      position = pos + 1;
      return false;
    }

    return true;
  });

  if (position === null) {
    throw new Error(`Could not find text: ${text}`);
  }

  return position;
}

function triggerKeyDown(
  editor: Editor,
  eventInit: KeyboardEventInit & { key: string },
): boolean {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });

  let handled = false;

  editor.view.someProp('handleKeyDown', (handler) => {
    if (!handled && handler(editor.view, event)) {
      handled = true;
    }
  });

  return handled;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('list styles', () => {
  it('persists ordered and bullet variants in JSON and rendered HTML', () => {
    const editor = createEditor({
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
    });

    expect(editor.getJSON().content?.[0].attrs?.listStyle).toBe('upper-roman');
    expect(editor.getJSON().content?.[1].attrs?.listStyle).toBe('square');
    expect(editor.getHTML()).toContain('data-list-style="upper-roman"');
    expect(editor.getHTML()).toContain('list-style-type: square');
    expect(generateHTML(editor.getJSON(), getEditorExtensions())).toBe(editor.getHTML());
  });

  it('parses list styles from saved HTML, inline CSS, and native ordered-list type attributes', () => {
    const editor = createEditor(`
      <ol data-list-style="lower-alpha">
        <li><p>Data attribute</p></li>
      </ol>
      <ol style="list-style-type: upper-roman;">
        <li><p>Inline style</p></li>
      </ol>
      <ol type="i">
        <li><p>Native type</p></li>
      </ol>
      <ul style="list-style-type: circle;">
        <li><p>Circle bullet</p></li>
      </ul>
    `);

    expect(editor.state.doc.child(0).attrs.listStyle).toBe('lower-alpha');
    expect(editor.state.doc.child(1).attrs.listStyle).toBe('upper-roman');
    expect(editor.state.doc.child(2).attrs.listStyle).toBe('lower-roman');
    expect(editor.state.doc.child(3).attrs.listStyle).toBe('circle');
  });

  it('falls back to safe default styles when parsed values are invalid', () => {
    const editor = createEditor(`
      <ol data-list-style="square">
        <li><p>Invalid ordered style</p></li>
      </ol>
      <ul data-list-style="upper-roman">
        <li><p>Invalid bullet style</p></li>
      </ul>
    `);

    expect(editor.state.doc.child(0).attrs.listStyle).toBe('decimal');
    expect(editor.state.doc.child(1).attrs.listStyle).toBe('disc');
  });

  it('changes only the closest nested list', () => {
    const editor = createEditor({
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
    });

    editor.commands.setTextSelection(findTextPosition(editor, 'Inner'));

    expect(editor.commands.setListStyle('orderedList', 'upper-roman')).toBe(true);

    const outer = editor.state.doc.firstChild!;
    const inner = outer.firstChild?.lastChild;

    expect(outer.attrs.listStyle).toBe('decimal');
    expect(inner?.attrs.listStyle).toBe('upper-roman');
  });

  it('rejects invalid style/type combinations without changing the list', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { listStyle: 'decimal' },
          content: [listItem('Ordered')],
        },
      ],
    });

    editor.commands.setTextSelection(findTextPosition(editor, 'Ordered'));

    expect(editor.commands.setListStyle('orderedList', 'disc')).toBe(false);
    expect(editor.state.doc.firstChild?.attrs.listStyle).toBe('decimal');
  });

  it('creates and styles a list in one toolbar-style chain', () => {
    const editor = createEditor('<p>Square</p>');

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

  it('indents list items with Tab and applies the next nested style', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { listStyle: 'decimal' },
          content: [listItem('One'), listItem('Two')],
        },
      ],
    });

    editor.commands.setTextSelection(findTextPosition(editor, 'Two'));

    expect(triggerKeyDown(editor, { key: 'Tab' })).toBe(true);

    const outerList = editor.state.doc.firstChild!;
    const firstItem = outerList.firstChild!;
    const nestedList = firstItem.lastChild!;

    expect(outerList.childCount).toBe(1);
    expect(nestedList.type.name).toBe('orderedList');
    expect(nestedList.attrs.listStyle).toBe('lower-alpha');
    expect(nestedList.textContent).toBe('Two');
  });

  it('outdents nested list items with Shift+Tab', () => {
    const editor = createEditor({
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
    });

    editor.commands.setTextSelection(findTextPosition(editor, 'Inner'));

    expect(triggerKeyDown(editor, { key: 'Tab', shiftKey: true })).toBe(true);

    const outerList = editor.state.doc.firstChild!;

    expect(outerList.type.name).toBe('orderedList');
    expect(outerList.childCount).toBe(2);
    expect(outerList.child(0).textContent).toBe('Outer');
    expect(outerList.child(1).textContent).toBe('Inner');
  });

  it('removes start="1" from rendered ordered lists but preserves non-default start values', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { listStyle: 'decimal', start: 1 },
          content: [listItem('Default start')],
        },
        {
          type: 'orderedList',
          attrs: { listStyle: 'decimal', start: 4 },
          content: [listItem('Custom start')],
        },
      ],
    });

    const html = editor.getHTML();

    expect(html).not.toContain('start="1"');
    expect(html).toContain('start="4"');
  });
});