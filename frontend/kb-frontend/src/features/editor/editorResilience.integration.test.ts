import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccordionContent, createTabsContent } from './blocks/model';
import { getEditorExtensions } from './extensions';

const editors: Editor[] = [];

function createEditor(options: {
  content?: JSONContent | string;
  editable?: boolean;
} = {}): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    ...options,
  });
  editors.push(editor);
  return editor;
}

function paragraph(text: string, marks?: JSONContent['marks']): JSONContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text, marks }],
  };
}

function table(text: string): JSONContent {
  return {
    type: 'table',
    attrs: {
      tableWidthPct: 72,
      tableOffsetPct: 14,
      borderTopEnabled: false,
      borderRightEnabled: true,
      borderBottomEnabled: false,
      borderLeftEnabled: true,
      borderInnerEnabled: false,
    },
    content: [
      {
        type: 'tableRow',
        attrs: { rowHeight: 48 },
        content: [
          {
            type: 'tableHeader',
            content: [
              paragraph(text, [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'underline' },
              ]),
            ],
          },
          {
            type: 'tableHeader',
            content: [paragraph('Header two')],
          },
        ],
      },
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            content: [paragraph('Cell one')],
          },
          {
            type: 'tableCell',
            content: [paragraph('Cell two')],
          },
        ],
      },
    ],
  };
}

function tabs(
  id: string,
  label: string,
  content: JSONContent[],
): JSONContent {
  return {
    type: 'tabs',
    content: [
      {
        type: 'tabItem',
        attrs: { itemId: `${id}-one`, label },
        content,
      },
      {
        type: 'tabItem',
        attrs: { itemId: `${id}-two`, label: 'Second tab' },
        content: [paragraph('Second tab body')],
      },
    ],
  };
}

function accordion(
  id: string,
  title: string,
  content: JSONContent[],
): JSONContent {
  return {
    type: 'accordion',
    content: [
      {
        type: 'accordionItem',
        attrs: { itemId: `${id}-one`, open: true, title },
        content,
      },
      {
        type: 'accordionItem',
        attrs: { itemId: `${id}-two`, open: false, title: 'Second section' },
        content: [paragraph('Second accordion body')],
      },
    ],
  };
}

function complexDocument(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Round-trip heading' }],
      },
      paragraph('Marked paragraph', [
        { type: 'bold' },
        { type: 'italic' },
        { type: 'underline' },
      ]),
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('Outer list item', [{ type: 'bold' }]),
              {
                type: 'orderedList',
                attrs: { start: 1, type: null },
                content: [
                  {
                    type: 'listItem',
                    content: [
                      paragraph('Nested list item', [{ type: 'italic' }]),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      table('Top-level table'),
      tabs('outer-tab', 'Table and accordion', [
        table('Table inside tab'),
        accordion('accordion-in-tab', 'Accordion inside tab', [
          table('Table inside accordion inside tab'),
        ]),
      ]),
      accordion('outer-accordion', 'Tabs and table', [
        table('Table inside accordion'),
        tabs('tabs-in-accordion', 'Tabs inside accordion', [
          table('Table inside tab inside accordion'),
        ]),
      ]),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  tabs('tabs-in-cell', 'Tabs in cell', [
                    accordion('accordion-in-tab-in-cell', 'Nested section', [
                      paragraph('Deeply nested body'),
                    ]),
                  ]),
                ],
              },
              {
                type: 'tableCell',
                content: [
                  accordion('accordion-in-cell', 'Accordion in cell', [
                    tabs('tabs-in-accordion-in-cell', 'Nested tab', [
                      paragraph('Other deeply nested body'),
                    ]),
                  ]),
                ],
              },
            ],
          },
        ],
      },
      paragraph('Trailing paragraph'),
    ],
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

function itemIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (
      (node.type.name === 'tabItem' || node.type.name === 'accordionItem') &&
      typeof node.attrs.itemId === 'string'
    ) {
      ids.push(node.attrs.itemId);
    }
  });
  return ids;
}

function dispatchShortcut(
  target: EventTarget,
  key: string,
  options: { shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    shiftKey: options.shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function selectDocumentEnd(editor: Editor): void {
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
}

function paste(
  editor: Editor,
  values: { html?: string; text?: string },
): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) =>
        type === 'text/html'
          ? values.html ?? ''
          : type === 'text/plain'
            ? values.text ?? ''
            : '',
    },
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => {
    if (!editor.isDestroyed) editor.destroy();
  });
});

describe('editor document resilience', () => {
  it('round-trips rich and deeply nested JSON without serializing node-view UI state', () => {
    const editor = createEditor({ content: complexDocument() });
    const beforeUiInteraction = editor.getJSON();

    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Collapse tab body"]')
      ?.click();

    expect(editor.getJSON()).toEqual(beforeUiInteraction);
    const originalHtml = generateHTML(beforeUiInteraction, getEditorExtensions());
    const restored = createEditor({ content: beforeUiInteraction });

    expect(restored.getJSON()).toEqual(beforeUiInteraction);
    expect(generateHTML(restored.getJSON(), getEditorExtensions())).toBe(originalHtml);

    const serialized = JSON.stringify(restored.getJSON());
    expect(serialized).not.toContain('activeTab');
    expect(serialized).not.toContain('collapsed');
    expect(serialized).not.toContain('kbActiveTab');

    const tables: ProseMirrorNode[] = [];
    restored.state.doc.descendants((node) => {
      if (node.type.name === 'table') tables.push(node);
    });
    expect(tables).toHaveLength(6);
    expect(tables[0].attrs).toMatchObject({
      tableWidthPct: 72,
      tableOffsetPct: 14,
      borderTopEnabled: false,
      borderBottomEnabled: false,
      borderInnerEnabled: false,
    });
    expect(tables[0].firstChild?.attrs.rowHeight).toBe(48);
    expect(tables[0].firstChild?.firstChild?.attrs.rowHeight).toBeNull();
  });

  it('keeps read-only tab switching as UI-only state', async () => {
    const editor = createEditor({
      content: complexDocument(),
      editable: false,
    });
    const before = editor.getJSON();
    await Promise.resolve();

    const buttons = editor.view.dom.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(buttons.length).toBeGreaterThan(1);
    buttons[1].click();

    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.commands.undo()).toBe(false);
  });

  it('emits updates for document mutations but not selection or read-only tab UI changes', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const onUpdate = vi.fn();
    const editor = new Editor({
      element,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [createTabsContent(), paragraph('Mutable paragraph')],
      },
      onUpdate,
    });
    editors.push(editor);

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(onUpdate).not.toHaveBeenCalled();

    editor.commands.insertContent(' changed');
    expect(onUpdate).toHaveBeenCalledTimes(1);

    editor.setEditable(false, false);
    await Promise.resolve();
    editor.view.dom.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['table', 0],
    ['tabs', 0],
    ['accordion', 0],
    ['table', 2],
    ['table', 4],
    ['accordion', 1],
    ['tabs', 1],
  ] as const)(
    'deletes and restores %s occurrence %i as one history action',
    (typeName, occurrence) => {
      const editor = createEditor({ content: complexDocument() });
      const original = editor.getJSON();
      const originalIds = itemIds(editor);
      const target = findNode(editor, typeName, occurrence);
      expect(target).not.toBeNull();

      editor.view.dispatch(
        closeHistory(
          editor.state.tr.delete(
            target!.position,
            target!.position + target!.node.nodeSize,
          ),
        ),
      );
      expect(editor.getJSON()).not.toEqual(original);

      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(original);
      expect(itemIds(editor)).toEqual(originalIds);
      expect(new Set(itemIds(editor)).size).toBe(itemIds(editor).length);

      expect(editor.commands.redo()).toBe(true);
      expect(editor.getJSON()).not.toEqual(original);
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(original);
    },
  );

  it.each([
    ['tabs', 'Move tab down'],
    ['accordion', 'Move accordion item down'],
  ] as const)(
    'undoes and redoes nested %s reordering without changing item IDs',
    (containerType, moveLabel) => {
      const editor = createEditor({ content: complexDocument() });
      const container = findNode(editor, containerType);
      const firstItemId = container?.node.child(0).attrs.itemId;
      const originalIds = itemIds(editor);
      expect(firstItemId).toBeTypeOf('string');

      editor.view.dom
        .querySelectorAll<HTMLButtonElement>(`[aria-label="${moveLabel}"]`)[0]
        .click();
      expect(findNode(editor, containerType)?.node.child(1).attrs.itemId).toBe(
        firstItemId,
      );
      expect(new Set(itemIds(editor)).size).toBe(itemIds(editor).length);

      expect(editor.commands.undo()).toBe(true);
      expect(findNode(editor, containerType)?.node.child(0).attrs.itemId).toBe(
        firstItemId,
      );
      expect(itemIds(editor)).toEqual(originalIds);

      expect(editor.commands.redo()).toBe(true);
      expect(findNode(editor, containerType)?.node.child(1).attrs.itemId).toBe(
        firstItemId,
      );
      expect(new Set(itemIds(editor)).size).toBe(itemIds(editor).length);
    },
  );

  it('preserves marks in list items, table cells, tab bodies, and accordion bodies', () => {
    const marked = [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }];
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [paragraph('List marks', marked)],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [paragraph('Cell marks', marked)],
                },
              ],
            },
          ],
        },
        tabs('marked-tabs', 'Marked tab', [paragraph('Tab marks', marked)]),
        accordion('marked-accordion', 'Marked accordion', [
          paragraph('Accordion marks', marked),
        ]),
      ],
    };
    const editor = createEditor({ content });
    const restored = createEditor({ content: editor.getJSON() });
    const markedTexts: string[] = [];

    restored.state.doc.descendants((node) => {
      if (node.isText && node.marks.length === 3) markedTexts.push(node.text ?? '');
    });

    expect(markedTexts).toEqual([
      'List marks',
      'Cell marks',
      'Tab marks',
      'Accordion marks',
    ]);
    expect(restored.getHTML()).toContain('<strong><em><u>Cell marks</u></em></strong>');
  });

  it('handles formatting and undo/redo keyboard shortcuts', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [paragraph('Shortcut text')],
      },
    });
    editor.commands.setTextSelection({ from: 1, to: 'Shortcut text'.length + 1 });

    dispatchShortcut(editor.view.dom, 'b');
    dispatchShortcut(editor.view.dom, 'i');
    dispatchShortcut(editor.view.dom, 'u');

    const text = editor.state.doc.firstChild?.firstChild;
    expect(text?.marks.map((mark) => mark.type.name).sort()).toEqual([
      'bold',
      'italic',
      'underline',
    ]);

    selectDocumentEnd(editor);
    editor.commands.insertContent(' changed');
    expect(editor.state.doc.textContent).toContain('changed');

    dispatchShortcut(editor.view.dom, 'z');
    expect(editor.state.doc.textContent).toBe('Shortcut text');
    dispatchShortcut(editor.view.dom, 'y');
    expect(editor.state.doc.textContent).toContain('changed');
    dispatchShortcut(editor.view.dom, 'z');
    dispatchShortcut(editor.view.dom, 'z', { shiftKey: true });
    expect(editor.state.doc.textContent).toContain('changed');
  });

  it('keeps editor shortcuts out of label inputs and exits label editing cleanly', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          createTabsContent(),
          createAccordionContent(),
          paragraph('Trailing paragraph'),
        ],
      },
    });
    const before = editor.getJSON();
    const tabLabel = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    const accordionTitle = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-accordion__title-input',
    );

    tabLabel?.focus();
    dispatchShortcut(tabLabel!, 'b');
    dispatchShortcut(tabLabel!, 'i');
    dispatchShortcut(tabLabel!, 'u');
    expect(editor.getJSON()).toEqual(before);

    tabLabel!.value = 'Unsaved label';
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    tabLabel!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);

    accordionTitle!.value = 'Committed title';
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    accordionTitle!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(editor.state.doc.textContent).not.toContain('\n');
  });

  it('sanitizes pasted HTML and undo restores the previous document', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [paragraph('Before paste')],
      },
    });
    const before = editor.getJSON();
    editor.commands.selectAll();

    const event = paste(editor, {
      html: [
        '<h2 onclick="alert(1)">Pasted heading</h2>',
        '<p><strong>Bold</strong> and <em>italic</em> text ',
        '<a href="javascript:alert(1)" onclick="alert(1)">unsafe link</a></p>',
        '<ul><li>Outer<ul><li>Nested</li></ul></li></ul>',
        '<table><tbody><tr><td>Cell</td></tr></tbody></table>',
        '<script>alert(1)</script>',
      ].join(''),
      text: 'Paste fallback',
    });

    expect(event.defaultPrevented).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('<h2>Pasted heading</h2>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<table');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it('pastes plain text as multiple paragraphs and supports undo', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [paragraph('Before paste')],
      },
    });
    const before = editor.getJSON();
    editor.commands.selectAll();

    paste(editor, { text: 'First pasted paragraph\n\nSecond pasted paragraph' });

    expect(editor.state.doc.textContent).toContain('First pasted paragraph');
    expect(editor.state.doc.textContent).toContain('Second pasted paragraph');
    expect(editor.getHTML()).toContain('<p>First pasted paragraph</p>');
    expect(editor.getHTML()).toContain('<p>Second pasted paragraph</p>');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it('indents and outdents nested list items with Tab and Shift+Tab', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [paragraph('First item')] },
              { type: 'listItem', content: [paragraph('Second item')] },
            ],
          },
        ],
      },
    });
    const secondParagraph = findNode(editor, 'paragraph', 1);
    expect(secondParagraph).not.toBeNull();
    editor.commands.setTextSelection(secondParagraph!.position + 1);

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(findNode(editor, 'bulletList', 1)).not.toBeNull();

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(findNode(editor, 'bulletList', 1)).toBeNull();
    expect(editor.state.doc.textContent).toBe('First itemSecond item');
  });

  it('pastes into tab and accordion bodies without damaging their wrappers', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          createTabsContent(),
          createAccordionContent(),
          table('Paste target'),
          paragraph('Trailing paragraph'),
        ],
      },
    });

    for (const itemType of ['tabItem', 'accordionItem', 'tableCell']) {
      const item = findNode(editor, itemType);
      expect(item).not.toBeNull();
      editor.commands.setTextSelection(item!.position + 2);
      paste(editor, {
        html: '<p><strong>Nested paste</strong></p>',
        text: 'Nested paste',
      });
    }

    expect(findNode(editor, 'tabs')?.node.childCount).toBe(2);
    expect(findNode(editor, 'accordion')?.node.childCount).toBe(2);
    expect(editor.getHTML().match(/<strong>Nested paste<\/strong>/g)).toHaveLength(3);
  });

  it('blocks paste and mutation controls in read-only mode, then restores them', async () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          createTabsContent(),
          createAccordionContent(),
          table('Read only'),
          paragraph('Trailing paragraph'),
        ],
      },
    });
    const before = editor.getJSON();

    editor.setEditable(false, false);
    await Promise.resolve();

    expect(editor.view.dom.querySelector('.kb-tab-card__title-input')).toBeNull();
    expect(editor.view.dom.querySelector('.kb-accordion__title-input')).toBeNull();
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).toBeNull();
    expect(editor.view.dom.querySelector('.table-drag-handle')).toBeNull();
    paste(editor, { html: '<p>Blocked paste</p>', text: 'Blocked paste' });
    expect(editor.getJSON()).toEqual(before);

    editor.setEditable(true, false);
    await Promise.resolve();
    expect(editor.view.dom.querySelector('.kb-tab-card__title-input')).not.toBeNull();
    expect(editor.view.dom.querySelector('.kb-accordion__title-input')).not.toBeNull();
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).not.toBeNull();
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).not.toBeNull();
  });

  it('loads malformed HTML safely and normalizes custom labels and dimensions', () => {
    const editor = createEditor({
      content: [
        '<section data-kb-tab-item data-kb-tab-label="Orphan tab">',
        '<div data-kb-tab-panel><p>Orphan tab body</p></div></section>',
        '<details data-kb-accordion-item data-kb-accordion-title="Orphan section">',
        '<summary>Orphan section</summary>',
        '<div data-kb-accordion-panel><p>Orphan accordion body</p></div></details>',
        '<div data-kb-tabs></div><div data-kb-accordion></div>',
        '<div data-kb-tabs>',
        '<section data-kb-tab-item data-kb-tab-label="   ">',
        '<div data-kb-tab-panel><p>Tab body</p></div>',
        '</section></div>',
        '<div data-kb-accordion>',
        '<details data-kb-accordion-item data-kb-accordion-title="   " open>',
        '<summary>   </summary><div data-kb-accordion-panel><p>Body',
        '</div></details></div>',
        '<table data-table-width-pct="500" data-table-offset-pct="-20">',
        '<tbody><tr><td data-row-height="-2">Cell</td></tr></tbody></table>',
        '<script>alert(1)</script>',
      ].join(''),
    });

    const tabLabels: string[] = [];
    const accordionTitles: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tabItem') tabLabels.push(node.attrs.label);
      if (node.type.name === 'accordionItem') accordionTitles.push(node.attrs.title);
      if (node.type.name === 'tabs') {
        expect(node.childCount).toBeGreaterThan(0);
        expect(node.firstChild?.type.name).toBe('tabItem');
      }
      if (node.type.name === 'accordion') {
        expect(node.childCount).toBeGreaterThan(0);
        expect(node.firstChild?.type.name).toBe('accordionItem');
      }
    });
    expect(tabLabels).toContain('Orphan tab');
    expect(tabLabels).toContain('Tab');
    expect(accordionTitles).toContain('Orphan section');
    expect(accordionTitles).toContain('Section');
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(editor.state.doc.textContent).toContain('Orphan tab body');
    expect(editor.state.doc.textContent).toContain('Orphan accordion body');
    expect(findNode(editor, 'table')?.node.attrs).toMatchObject({
      tableWidthPct: 100,
      tableOffsetPct: 0,
    });
    expect(editor.getHTML()).not.toContain('<script');
  });

  it('normalizes empty and unknown JSON content without crashing', () => {
    const editor = createEditor();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(editor.commands.setContent('', { emitUpdate: false })).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');

    expect(() =>
      editor.commands.setContent(
        {
          type: 'doc',
          content: [
            {
              type: 'unknownEditorNode',
              content: [paragraph('Preserved fallback text')],
            },
          ],
        },
        { emitUpdate: false, errorOnInvalidContent: false },
      ),
    ).not.toThrow();
    expect(JSON.stringify(editor.getJSON())).not.toContain('unknownEditorNode');
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');

    warning.mockRestore();
  });

  it('loads large documents and tables and survives repeated editable transitions', async () => {
    const largeText = 'x'.repeat(50_000);
    const editor = createEditor({ content: paragraph(largeText) });
    expect(editor.state.doc.textContent).toHaveLength(50_000);

    selectDocumentEnd(editor);
    editor.commands.insertContent('y');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.textContent).toHaveLength(50_000);

    const tableEditor = createEditor();
    expect(
      tableEditor.commands.insertTable({
        rows: 20,
        cols: 20,
        withHeaderRow: true,
      }),
    ).toBe(true);
    expect(findNode(tableEditor, 'table')?.node.childCount).toBe(20);

    const blocksEditor = createEditor({
      content: {
        type: 'doc',
        content: [createTabsContent(), createAccordionContent()],
      },
    });
    for (let index = 0; index < 5; index += 1) {
      blocksEditor.setEditable(false, false);
      blocksEditor.setEditable(true, false);
    }
    await Promise.resolve();

    blocksEditor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add tab"]')
      ?.click();
    expect(findNode(blocksEditor, 'tabs')?.node.childCount).toBe(3);
  });
});
