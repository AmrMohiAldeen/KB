import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { insertContentBlock } from './commands/contentBlockCommands';

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

function topLevelNode(editor: Editor, typeName: string): ProseMirrorNode | null {
  for (let index = 0; index < editor.state.doc.childCount; index += 1) {
    const node = editor.state.doc.child(index);
    if (node.type.name === typeName) return node;
  }

  return null;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('tabs and accordions', () => {
  it('inserts valid compound nodes and refuses wrapper insertion in read-only editors', () => {
    const editor = createEditor();

    expect(insertContentBlock(editor, 'tabs')).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);

    const accordionEditor = createEditor();
    expect(insertContentBlock(accordionEditor, 'accordion')).toBe(true);
    expect(topLevelNode(accordionEditor, 'accordion')?.childCount).toBe(2);

    const readOnly = createEditor({ editable: false });
    expect(insertContentBlock(readOnly, 'tabs')).toBe(false);
    expect(readOnly.commands.insertTabs()).toBe(false);
    expect(readOnly.getJSON().content?.map((node) => node.type)).toEqual([
      'paragraph',
    ]);
  });

  it('preserves rich nested content and emits semantic static HTML', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'tabs',
          content: [
            {
              type: 'tabItem',
              attrs: { itemId: 'tab-overview', label: 'Overview' },
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Nested heading' }],
                },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Nested list item' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tabItem',
              attrs: { itemId: 'tab-details', label: 'Details' },
              content: [{ type: 'paragraph' }],
            },
          ],
        },
        {
          type: 'accordion',
          content: [
            {
              type: 'accordionItem',
              attrs: {
                itemId: 'accordion-faq',
                title: 'Frequently asked question',
                open: true,
              },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Rich answer' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const editor = createEditor({ content });
    const html = editor.getHTML();

    expect(html).toContain('data-kb-tabs');
    expect(html).toContain('<h3 data-kb-tab-label-static="">Overview</h3>');
    expect(html).toContain('<h2>Nested heading</h2>');
    expect(html).toContain('Nested list item');
    expect(html).toContain('<details');
    expect(html).toContain('open=""');
    expect(html).toContain('<summary data-kb-accordion-title-static="">Frequently asked question</summary>');
    expect(generateHTML(editor.getJSON(), getEditorExtensions())).toBe(html);

    const restored = createEditor({ content: html });
    expect(topLevelNode(restored, 'tabs')?.child(0).attrs.label).toBe('Overview');
    expect(topLevelNode(restored, 'tabs')?.child(0).textContent).toContain(
      'Nested heading',
    );
    expect(topLevelNode(restored, 'accordion')?.child(0).attrs).toMatchObject({
      open: true,
      title: 'Frequently asked question',
    });
  });

  it('edits, adds, removes, and reorders tabs through the node view controls', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    expect(editor.view.dom.querySelector('.kb-tabs--editor')).not.toBeNull();
    expect(editor.view.dom.querySelectorAll('.kb-tab-card')).toHaveLength(2);
    expect(editor.view.dom.querySelector('[role="tab"]')).toBeNull();

    const firstLabel = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    expect(firstLabel?.value).toBe('Tab 1');
    firstLabel!.value = 'Overview';
    firstLabel!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Overview');

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Move tab down"]')[0]
      .click();
    expect(topLevelNode(editor, 'tabs')?.child(1).attrs.label).toBe('Overview');

    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add tab"]')
      ?.click();
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(3);

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Remove tab"]')[0]
      .click();
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
  });

  it('preserves long labels and titles beyond the former short limit', () => {
    const editor = createEditor();
    const longLabel = `A detailed tab label ${'with useful context '.repeat(12)}`.trim();
    const longTitle = `A detailed accordion title ${'with useful context '.repeat(12)}`.trim();

    editor.commands.insertTabs();
    const firstLabel = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    firstLabel!.value = longLabel;
    firstLabel!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe(longLabel);

    const accordionEditor = createEditor();
    accordionEditor.commands.insertAccordion();
    const firstTitle = accordionEditor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-accordion__title-input',
    );
    firstTitle!.value = longTitle;
    firstTitle!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNode(accordionEditor, 'accordion')?.child(0).attrs.title).toBe(
      longTitle,
    );
  });

  it('edits accordion titles and persists open/add/reorder/remove operations', () => {
    const editor = createEditor();
    editor.commands.insertAccordion();

    expect(editor.view.dom.querySelectorAll('.kb-accordion__chevron')).toHaveLength(2);

    const firstDetails = editor.view.dom.querySelector<HTMLDetailsElement>(
      '[data-kb-accordion-item]',
    );
    firstDetails!.open = true;
    firstDetails!.dispatchEvent(new Event('toggle'));
    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.open).toBe(true);

    const firstTitle = editor.view.dom.querySelector<HTMLInputElement>(
      '.kb-accordion__title-input',
    );
    firstTitle!.value = 'FAQ';
    firstTitle!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.title).toBe('FAQ');

    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add accordion item"]')
      ?.click();
    expect(topLevelNode(editor, 'accordion')?.childCount).toBe(3);

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>(
        '[aria-label="Move accordion item down"]',
      )[0]
      .click();
    expect(topLevelNode(editor, 'accordion')?.child(1).attrs.title).toBe('FAQ');

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Remove accordion item"]')[0]
      .click();
    expect(topLevelNode(editor, 'accordion')?.childCount).toBe(2);
  });

  it('renders interactive tab switching without mutation controls when read-only', async () => {
    const editor = createEditor({
      editable: false,
      content: {
        type: 'doc',
        content: [
          {
            type: 'tabs',
            content: [
              {
                type: 'tabItem',
                attrs: { itemId: 'first', label: 'First' },
                content: [{ type: 'paragraph' }],
              },
              {
                type: 'tabItem',
                attrs: { itemId: 'second', label: 'Second' },
                content: [{ type: 'paragraph' }],
              },
            ],
          },
        ],
      },
    });
    await Promise.resolve();

    const buttons = editor.view.dom.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const visibilityRule = editor.view.dom.querySelector<HTMLStyleElement>(
      '.kb-tabs__visibility-rule',
    );

    expect(buttons).toHaveLength(2);
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).toBeNull();
    expect(editor.view.dom.querySelector('.kb-content-block__action-menu')).toBeNull();
    expect(visibilityRule?.textContent).toContain(':nth-child(1)');
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');

    buttons[1].click();
    expect(visibilityRule?.textContent).toContain(':nth-child(2)');
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
  });

  it('renders clean read-only accordions without mutation controls', () => {
    const editor = createEditor({
      editable: false,
      content: {
        type: 'doc',
        content: [
          {
            type: 'accordion',
            content: [
              {
                type: 'accordionItem',
                attrs: {
                  itemId: 'read-only-section',
                  open: true,
                  title: 'A read-only accordion title',
                },
                content: [{ type: 'paragraph' }],
              },
            ],
          },
        ],
      },
    });

    expect(editor.view.dom.querySelector('.kb-accordion__title-area')?.textContent).toBe(
      'A read-only accordion title',
    );
    expect(editor.view.dom.querySelector('.kb-accordion__title-input')).toBeNull();
    expect(editor.view.dom.querySelector('.kb-content-block__action-menu')).toBeNull();
    expect(editor.view.dom.querySelector('[aria-label="Add accordion item"]')).toBeNull();
  });

  it('removes mutation controls after switching an editor to read-only', async () => {
    const editor = createEditor();
    editor.commands.insertTabs();
    const staleAddButton = editor.view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Add tab"]',
    );

    editor.setEditable(false, false);
    staleAddButton?.click();
    await Promise.resolve();

    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
    expect(editor.commands.insertAccordion()).toBe(false);
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).toBeNull();
    expect(editor.view.dom.querySelector('.kb-content-block__action-menu')).toBeNull();
  });

  it('inserts content blocks from the slash menu with keyboard selection', () => {
    const editor = createEditor();
    editor.commands.insertContent('/ta');

    expect(
      editor.view.dom.querySelector('[role="option"]')?.textContent,
    ).toContain('Tabs');

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
    expect(editor.state.doc.textContent).not.toContain('/ta');
  });
});
