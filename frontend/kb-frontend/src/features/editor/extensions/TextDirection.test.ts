import { Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from './';

const editors: Editor[] = [];

function createEditor(content: JSONContent | string, editable = true): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    element,
    editable,
    extensions: getEditorExtensions(),
    content,
  });
  editors.push(editor);
  return editor;
}

function findTextPosition(editor: Editor, text: string): number {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (position != null || !node.isText || !node.text?.includes(text)) {
      return true;
    }

    position = pos + 1;
    return false;
  });

  if (position == null) {
    throw new Error(`Text not found: ${text}`);
  }

  return position;
}

function nodesByName(editor: Editor, name: string) {
  const nodes: Array<{ node: ProseMirrorNode; pos: number }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name) nodes.push({ node, pos });
  });

  return nodes;
}

function tableCellTexts(table: ProseMirrorNode) {
  const texts: string[] = [];

  table.descendants((node) => {
    if (
      node.type.spec.tableRole === 'cell' ||
      node.type.spec.tableRole === 'header_cell'
    ) {
      texts.push(node.textContent);
      return false;
    }

    return true;
  });

  return texts;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('TextDirectionExtension', () => {
  it('sets RTL and LTR on a paragraph in JSON and HTML', () => {
    const editor = createEditor('<p>Hello direction</p>');
    editor.commands.setTextSelection(findTextPosition(editor, 'direction'));

    expect(editor.commands.setTextDirection('rtl')).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe('rtl');
    expect(editor.getHTML()).toContain('<p dir="rtl">Hello direction</p>');

    expect(editor.commands.setTextDirection('ltr')).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe('ltr');
    expect(editor.getHTML()).toContain('<p dir="ltr">Hello direction</p>');
  });

  it('parses safe HTML dir attributes and ignores unsupported values', () => {
    const editor = createEditor(
      '<p dir="rtl">Arabic</p><p dir="auto">Auto</p><p dir="sideways">Bad</p>',
    );
    const paragraphs = nodesByName(editor, 'paragraph');

    expect(paragraphs[0].node.attrs.dir).toBe('rtl');
    expect(paragraphs[1].node.attrs.dir).toBeNull();
    expect(paragraphs[2].node.attrs.dir).toBeNull();
  });

  it('applies direction to multiple selected supported blocks', () => {
    const editor = createEditor([
      '<p>One</p>',
      '<h2>Two</h2>',
      '<blockquote><p>Three</p></blockquote>',
    ].join(''));
    editor.commands.selectAll();

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    expect(nodesByName(editor, 'paragraph').map(({ node }) => node.attrs.dir))
      .toEqual(['rtl', 'rtl', 'rtl']);
    expect(nodesByName(editor, 'heading')[0].node.attrs.dir).toBe('rtl');
    expect(nodesByName(editor, 'blockquote')[0].node.attrs.dir).toBe('rtl');
  });

  it('keeps nested ordered-list structure and styles while applying direction', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { listStyle: 'lower-alpha' },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Parent' }],
                },
                {
                  type: 'orderedList',
                  attrs: { listStyle: 'upper-roman' },
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Nested' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(findTextPosition(editor, 'Nested'));

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    const lists = nodesByName(editor, 'orderedList').map(({ node }) => node);
    expect(lists).toHaveLength(2);
    expect(lists[0].attrs.listStyle).toBe('lower-alpha');
    expect(lists[1].attrs.listStyle).toBe('upper-roman');
    expect(lists[1].attrs.dir).toBe('rtl');
    expect(editor.getText()).toContain('Nested');
  });

  it('keeps nested unordered-list structure and styles while applying direction', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          attrs: { listStyle: 'square' },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Parent' }],
                },
                {
                  type: 'bulletList',
                  attrs: { listStyle: 'circle' },
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Nested bullet' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(findTextPosition(editor, 'Nested bullet'));

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    const lists = nodesByName(editor, 'bulletList').map(({ node }) => node);
    expect(lists).toHaveLength(2);
    expect(lists[0].attrs.listStyle).toBe('square');
    expect(lists[1].attrs.listStyle).toBe('circle');
    expect(lists[1].attrs.dir).toBe('rtl');
    expect(editor.getText()).toContain('Nested bullet');
  });

  it('applies task-list direction without changing task state', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Done' }],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(findTextPosition(editor, 'Done'));

    expect(editor.commands.setTextDirection('rtl')).toBe(true);
    expect(nodesByName(editor, 'taskList')[0].node.attrs.dir).toBe('rtl');
    expect(nodesByName(editor, 'taskItem')[0].node.attrs).toMatchObject({
      checked: true,
      dir: 'rtl',
    });
  });

  it('applies direction to selected table cells only', () => {
    const editor = createEditor({
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
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'D' }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    const table = editor.state.doc.firstChild!;
    const map = TableMap.get(table);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, 1 + map.map[0], 1 + map.map[1]),
      ),
    );

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    const cells = nodesByName(editor, 'tableCell').map(({ node }) => node);
    expect(cells.map((cell) => cell.attrs.dir ?? null)).toEqual([
      'rtl',
      'rtl',
      null,
      null,
    ]);
    expect(editor.getJSON().content?.[0]?.attrs?.dir ?? null).toBeNull();
  });

  it('applies direction to a full table without reordering columns', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: ['A', 'B', 'C'].map((text) => ({
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text }],
                  },
                ],
              })),
            },
          ],
        },
      ],
    });
    const beforeOrder = tableCellTexts(editor.state.doc.firstChild!);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    const table = editor.state.doc.firstChild!;
    expect(table.attrs.dir).toBe('rtl');
    expect(tableCellTexts(table)).toEqual(beforeOrder);
    expect(nodesByName(editor, 'tableCell').map(({ node }) => node.attrs.dir))
      .toEqual(['rtl', 'rtl', 'rtl']);
  });

  it('supports undo and redo after changing direction', () => {
    const editor = createEditor('<p>Undo direction</p>');
    editor.commands.setTextSelection(findTextPosition(editor, 'direction'));

    expect(editor.commands.setTextDirection('rtl')).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe('rtl');

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.dir ?? null).toBeNull();

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe('rtl');
  });

  it('does not mutate read-only editors', () => {
    const editor = createEditor('<p>Read only</p>', false);
    const before = editor.getJSON();

    expect(editor.commands.setTextDirection('rtl')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('renders direction in static HTML for custom blocks', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'warning', dir: 'rtl' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Callout' }] }],
        },
        {
          type: 'tabs',
          attrs: { dir: 'rtl' },
          content: [
            {
              type: 'tabItem',
              attrs: { itemId: 'tab_1', label: 'Intro', dir: 'rtl' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tab' }] }],
            },
          ],
        },
        {
          type: 'accordion',
          attrs: { dir: 'rtl' },
          content: [
            {
              type: 'accordionItem',
              attrs: {
                itemId: 'acc_1',
                title: 'FAQ',
                open: true,
                dir: 'rtl',
              },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Accordion' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const container = document.createElement('div');
    container.innerHTML = editor.getHTML();

    expect(container.querySelector('[data-kb-callout]')?.getAttribute('dir'))
      .toBe('rtl');
    expect(container.querySelector('[data-kb-tabs]')?.getAttribute('dir'))
      .toBe('rtl');
    expect(container.querySelector('[data-kb-tab-item]')?.getAttribute('dir'))
      .toBe('rtl');
    expect(container.querySelector('[data-kb-accordion]')?.getAttribute('dir'))
      .toBe('rtl');
    expect(container.querySelector('[data-kb-accordion-item]')?.getAttribute('dir'))
      .toBe('rtl');
  });

  it('sets direction on the current table cell for a text selection inside a cell', () => {
    const editor = createEditor({
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
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, findTextPosition(editor, 'B')),
      ),
    );

    expect(editor.commands.setTextDirection('rtl')).toBe(true);

    expect(nodesByName(editor, 'tableCell').map(({ node }) => node.attrs.dir ?? null))
      .toEqual([null, 'rtl']);
  });
});
