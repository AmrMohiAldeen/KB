import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { insertContentBlock } from './commands/contentBlockCommands';
import { createAccordionContent, createTabsContent } from './model';

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

function findNodePosition(
  editor: Editor,
  typeName: string,
  occurrence = 0,
): number | null {
  let currentOccurrence = 0;
  let result: number | null = null;

  editor.state.doc.descendants((node, position) => {
    if (result != null || node.type.name !== typeName) return;

    if (currentOccurrence === occurrence) {
      result = position;
      return;
    }
    currentOccurrence += 1;
  });

  return result;
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
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain('<h2>Nested heading</h2>');
    expect(html).toContain('Nested list item');
    expect(html).toContain('<details');
    expect(html).toContain('open=""');
    expect(html).toContain(
      '<summary class="kb-accordion__summary" data-kb-accordion-title-static="">Frequently asked question</summary>',
    );
    expect(html).toContain(
      '<div class="kb-accordion__panel" data-kb-accordion-panel="">',
    );
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
    expect(editor.view.dom.querySelector('[data-kb-tab-item]')?.getAttribute(
      'data-kb-tab-label',
    )).toBe('Overview');

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

  it('refreshes action availability after sibling changes and protects the final item', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    const secondMenu = editor.view.dom.querySelectorAll<HTMLButtonElement>(
      '[aria-label^="Tab actions for"]',
    )[1];
    secondMenu.click();
    expect(
      editor.view.dom.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Move tab down"]',
      )[1].disabled,
    ).toBe(true);
    secondMenu.click();

    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add tab"]')
      ?.click();
    secondMenu.click();
    const secondMoveDown = editor.view.dom.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Move tab down"]',
    )[1];
    expect(secondMoveDown.disabled).toBe(false);
    secondMoveDown.click();
    expect(topLevelNode(editor, 'tabs')?.child(2).attrs.label).toBe('Tab 2');

    while ((topLevelNode(editor, 'tabs')?.childCount ?? 0) > 1) {
      editor.view.dom
        .querySelector<HTMLButtonElement>('[aria-label^="Tab actions for"]')
        ?.click();
      editor.view.dom
        .querySelector<HTMLButtonElement>('[aria-label="Remove tab"]:not(:disabled)')
        ?.click();
    }

    const remainingMenu = editor.view.dom.querySelector<HTMLButtonElement>(
      '[aria-label^="Tab actions for"]',
    );
    remainingMenu?.click();
    const remainingRemove = editor.view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Remove tab"]',
    );
    expect(remainingRemove?.disabled).toBe(true);
    remainingRemove?.click();
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(1);
  });

  it('keeps ordinary label arrows and boundary deletion from reordering or deleting items', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    const firstLabel = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    firstLabel?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Tab 1');

    const secondItemPos = findNodePosition(editor, 'tabItem', 1);
    expect(secondItemPos).not.toBeNull();
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, secondItemPos! + 2),
      ),
    );
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Tab 1');
    expect(topLevelNode(editor, 'tabs')?.child(1).attrs.label).toBe('Tab 2');

    const firstItemPos = findNodePosition(editor, 'tabItem');
    expect(firstItemPos).not.toBeNull();
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, firstItemPos! + 2),
      ),
    );
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
  });

  it('keeps item controls stable during nested content edits', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    const labelBefore = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    const firstItemPos = findNodePosition(editor, 'tabItem');
    expect(firstItemPos).not.toBeNull();

    editor.view.dispatch(editor.state.tr.insertText('Nested edit', firstItemPos! + 2));

    expect(
      editor.view.dom.querySelector<HTMLTextAreaElement>(
        '.kb-tab-card__title-input',
      ),
    ).toBe(labelBefore);
    expect(topLevelNode(editor, 'tabs')?.child(0).textContent).toContain(
      'Nested edit',
    );
  });

  it('reorders only the adjacent pair and preserves unaffected item controls', () => {
    const editor = createEditor();
    editor.commands.insertTabs();
    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add tab"]')
      ?.click();

    const thirdLabelBefore = editor.view.dom.querySelectorAll<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    )[2];
    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Move tab down"]')[0]
      .click();

    expect(
      Array.from({ length: topLevelNode(editor, 'tabs')?.childCount ?? 0 }, (_, index) =>
        topLevelNode(editor, 'tabs')?.child(index).attrs.label,
      ),
    ).toEqual(['Tab 2', 'Tab 1', 'Tab 3']);
    expect(
      editor.view.dom.querySelectorAll<HTMLTextAreaElement>(
        '.kb-tab-card__title-input',
      )[2],
    ).toBe(thirdLabelBefore);
  });

  it('supports keyboard navigation within item action menus', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label^="Tab actions for"]')[1]
      .click();
    expect((document.activeElement as HTMLElement).ariaLabel).toBe('Move tab up');

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect((document.activeElement as HTMLElement).ariaLabel).toBe('Remove tab');

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Home',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect((document.activeElement as HTMLElement).ariaLabel).toBe('Move tab up');
  });

  it('records labels, add/remove, and reorder in history', () => {
    const editor = createEditor();
    editor.commands.insertTabs();

    const firstLabel = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-tab-card__title-input',
    );
    firstLabel!.value = 'Overview';
    firstLabel!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.commands.undo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Tab 1');
    expect(editor.commands.redo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Overview');

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Move tab down"]')[0]
      .click();
    expect(topLevelNode(editor, 'tabs')?.child(1).attrs.label).toBe('Overview');
    expect(editor.commands.undo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.child(0).attrs.label).toBe('Overview');
    expect(editor.commands.redo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.child(1).attrs.label).toBe('Overview');

    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add tab"]')
      ?.click();
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(3);
    expect(editor.commands.undo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
    expect(editor.commands.redo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(3);

    editor.view.dom
      .querySelectorAll<HTMLButtonElement>('[aria-label="Remove tab"]')[0]
      .click();
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);
    expect(editor.commands.undo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(3);
    expect(editor.commands.redo()).toBe(true);
    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(2);

  });

  it('keeps accordion open and close state out of history', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [createAccordionContent(), { type: 'paragraph' }],
      },
    });
    const firstDetails = editor.view.dom.querySelector<HTMLDetailsElement>(
      '[data-kb-accordion-item]',
    );

    firstDetails!.open = true;
    firstDetails!.dispatchEvent(new Event('toggle'));

    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.open).toBe(true);
    expect(editor.commands.undo()).toBe(false);

    firstDetails!.open = false;
    firstDetails!.dispatchEvent(new Event('toggle'));
    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.open).toBe(false);
    expect(editor.commands.undo()).toBe(false);
  });

  it('highlights node-selected and select-all blocks consistently', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          createTabsContent(),
          createAccordionContent(),
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
    const tabsPos = findNodePosition(editor, 'tabs');
    expect(tabsPos).not.toBeNull();

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tabsPos!)),
    );
    expect(
      editor.view.dom
        .querySelector('[data-kb-tabs]')
        ?.classList.contains('kb-block-selection'),
    ).toBe(true);
    expect(
      editor.view.dom
        .querySelector('[data-kb-accordion]')
        ?.classList.contains('kb-block-selection'),
    ).toBe(false);

    editor.view.dispatch(
      editor.state.tr.setSelection(new AllSelection(editor.state.doc)),
    );

    expect(
      editor.view.dom
        .querySelector('[data-kb-tabs]')
        ?.classList.contains('kb-block-selection'),
    ).toBe(true);
    expect(
      editor.view.dom
        .querySelector('[data-kb-accordion]')
        ?.classList.contains('kb-block-selection'),
    ).toBe(true);
    expect(
      editor.view.dom
        .querySelector('.tableWrapper')
        ?.classList.contains('kb-block-selection'),
    ).toBe(true);
  });

  it('shows the shared drag handle for selected content blocks', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [createTabsContent(), createAccordionContent()],
      },
    });
    const accordionPos = findNodePosition(editor, 'accordion');
    expect(accordionPos).not.toBeNull();

    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, accordionPos!),
      ),
    );

    const handle = editor.view.dom.querySelector<HTMLButtonElement>(
      '.content-block-drag-handle',
    );
    expect(handle?.ariaLabel).toBe('Drag content block');
    expect(handle?.draggable).toBe(true);
    expect(handle?.classList.contains('kb-block-drag-handle')).toBe(true);
  });

  it('hands active table selection to content block controls before mutations', () => {
    const editor = createEditor({
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
          createTabsContent(),
        ],
      },
    });
    const tablePos = findNodePosition(editor, 'table');
    const tabsPos = findNodePosition(editor, 'tabs');
    expect(tablePos).not.toBeNull();
    expect(tabsPos).not.toBeNull();

    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, tablePos!),
      ),
    );
    editor.view.dom
      .querySelector<HTMLTextAreaElement>('.kb-tab-card__title-input')
      ?.focus();

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('tabs');

    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, tablePos!),
      ),
    );
    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label^="Tab actions for"]')
      ?.click();
    editor.view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Remove tab"]')
      ?.click();

    expect(topLevelNode(editor, 'tabs')?.childCount).toBe(1);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('tabs');

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
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
    expect(
      editor.view.dom
        .querySelector('[data-kb-accordion-item]')
        ?.getAttribute('data-kb-accordion-title'),
    ).toBe('FAQ');

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

  it('persists the final state after rapid accordion toggles without rebuilding controls', () => {
    const editor = createEditor();
    editor.commands.insertAccordion();

    const firstDetails = editor.view.dom.querySelector<HTMLDetailsElement>(
      '[data-kb-accordion-item]',
    );
    const titleBefore = editor.view.dom.querySelector<HTMLTextAreaElement>(
      '.kb-accordion__title-input',
    );

    for (const open of [true, false, true, false, true]) {
      firstDetails!.open = open;
      firstDetails!.dispatchEvent(new Event('toggle'));
    }

    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.open).toBe(true);
    expect(topLevelNode(editor, 'accordion')?.childCount).toBe(2);
    expect(
      editor.view.dom.querySelector<HTMLTextAreaElement>(
        '.kb-accordion__title-input',
      ),
    ).toBe(titleBefore);
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
    const panels = editor.view.dom.querySelectorAll<HTMLElement>(
      '[role="tabpanel"]',
    );

    expect(buttons).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(editor.view.dom.querySelector('[aria-label="Add tab"]')).toBeNull();
    expect(editor.view.dom.querySelector('.kb-content-block__action-menu')).toBeNull();
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[0].getAttribute('aria-controls')).toBe(panels[0].id);
    expect(panels[0].getAttribute('aria-labelledby')).toBe(buttons[0].id);
    expect(panels[0].hidden).toBe(false);
    expect(panels[1].hidden).toBe(true);

    buttons[1].click();
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(panels[0].hidden).toBe(true);
    expect(panels[1].hidden).toBe(false);

    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  });

  it('keeps legacy and duplicate item IDs safe in read-only tabs', async () => {
    const legacy = createEditor({
      content:
        '<div data-kb-tabs><section data-kb-tab-item data-kb-tab-label="Legacy"><div data-kb-tab-panel><p>Legacy body</p></div></section></div>',
    });
    expect(topLevelNode(legacy, 'tabs')?.child(0).attrs.itemId).toBeNull();

    const duplicateIds = createEditor({
      editable: false,
      content: {
        type: 'doc',
        content: [
          {
            type: 'tabs',
            content: [
              {
                type: 'tabItem',
                attrs: { itemId: 'duplicate', label: 'First' },
                content: [{ type: 'paragraph' }],
              },
              {
                type: 'tabItem',
                attrs: { itemId: 'duplicate', label: 'Second' },
                content: [{ type: 'paragraph' }],
              },
            ],
          },
        ],
      },
    });
    await Promise.resolve();

    const buttons = duplicateIds.view.dom.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    expect(buttons[0].dataset.kbTabControlId).not.toBe(
      buttons[1].dataset.kbTabControlId,
    );
    buttons[1].click();
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

    const details = editor.view.dom.querySelector<HTMLDetailsElement>(
      '[data-kb-accordion-item]',
    );
    details!.open = false;
    details!.dispatchEvent(new Event('toggle'));
    expect(topLevelNode(editor, 'accordion')?.child(0).attrs.open).toBe(true);
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
      document.body.querySelector('[role="option"]')?.textContent,
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
