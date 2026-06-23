import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';

/**
 * Tests for the slash command menu extension.
 *
 * These tests cover:
 * - Opening the slash menu from "/" and filtering by query.
 * - Preventing the menu in invalid contexts such as URLs, words, selected text, code blocks, and read-only editors.
 * - Keyboard behavior: ArrowUp, ArrowDown, Enter, Tab, Escape, modifier keys, and Shift combinations.
 * - Inserting common slash command blocks such as headings, tables, configured tables, code blocks, and callouts.
 * - Mouse behavior: hover activation and mousedown insertion.
 * - Portal behavior: the menu is rendered outside the editor/table DOM.
 * - Cleanup behavior: the floating menu is removed when the editor is destroyed.
 */

const editors: Editor[] = [];

function createEditor(editable = true): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    editable,
    element,
    extensions: getEditorExtensions(),
  });

  editors.push(editor);
  return editor;
}

function press(
  editor: Editor,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });

  editor.view.dom.dispatchEvent(event);
  return event;
}

function getSlashMenu(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="listbox"]');
}

function getSlashOptions(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="option"]'),
  );
}

function getActiveOption(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '[role="option"][aria-selected="true"]',
  );
}

function firstTopLevelNode(editor: Editor, type: string) {
  return Array.from({ length: editor.state.doc.childCount }, (_, index) =>
    editor.state.doc.child(index),
  ).find((node) => node.type.name === type);
}

function firstNode(editor: Editor, type: string): ProseMirrorNode | null {
  let match: ProseMirrorNode | null = null;

  editor.state.doc.descendants((node) => {
    if (match || node.type.name !== type) return !match;

    match = node;
    return false;
  });

  return match;
}

function tableCellDirections(table: ProseMirrorNode): Array<string | null> {
  const directions: Array<string | null> = [];

  table.descendants((node) => {
    if (
      node.type.spec.tableRole === 'cell' ||
      node.type.spec.tableRole === 'header_cell'
    ) {
      directions.push(node.attrs.dir ?? null);
      return false;
    }

    return true;
  });

  return directions;
}

function setRtlSlashContent(editor: Editor, text: string): void {
  editor.commands.setContent({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { dir: 'rtl' },
        content: [{ type: 'text', text }],
      },
    ],
  });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
}

function destroyEditor(editor: Editor): void {
  const index = editors.indexOf(editor);
  if (index !== -1) editors.splice(index, 1);
  editor.destroy();
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});

describe('slash command menu', () => {
  it('opens the menu when typing a plain slash', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    expect(getSlashMenu()).not.toBeNull();
    expect(getSlashOptions().length).toBeGreaterThan(0);
  });

  it('filters commands by typed query', () => {
    const editor = createEditor();

    editor.commands.insertContent('/warn');

    expect(getSlashMenu()).not.toBeNull();
    expect(getActiveOption()?.textContent).toContain('Warning callout');
  });

  it('does not show the menu when no slash commands match', () => {
    const editor = createEditor();

    editor.commands.insertContent('/doesnotexist');

    expect(getSlashMenu()).toBeNull();
  });

  it('does not open when slash is part of a word', () => {
    const editor = createEditor();

    editor.commands.insertContent('hello/table');

    expect(getSlashMenu()).toBeNull();
  });

  it('opens when slash comes after whitespace', () => {
    const editor = createEditor();

    editor.commands.insertContent('hello /table');

    expect(getSlashMenu()).not.toBeNull();
  });

  it('does not open for URL-like text', () => {
    const editor = createEditor();

    editor.commands.setContent('<p>https://example.com/path</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    expect(getSlashMenu()).toBeNull();
  });

  it('does not open when text is selected', () => {
    const editor = createEditor();

    editor.commands.setContent('<p>/warn</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(getSlashMenu()).toBeNull();
  });

  it('does not open inside code blocks', () => {
    const editor = createEditor();

    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: '/warning' }],
        },
      ],
    });

    editor.commands.setTextSelection(9);

    expect(getSlashMenu()).toBeNull();
  });

  it('inserts a heading command with Enter', () => {
    const editor = createEditor();

    editor.commands.insertContent('/heading-2');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(editor, 'heading')?.attrs.level).toBe(2);
  });

  it('inserts a default table command with Enter', () => {
    const editor = createEditor();

    editor.commands.insertContent('/table');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(editor, 'table')?.childCount).toBe(3);
  });

  it('inserts a glossary command with Enter', () => {
    const editor = createEditor();

    editor.commands.insertContent('/glossary');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);
    expect(firstNode(editor, 'glossary')?.attrs).toMatchObject({
      term: 'Term',
      definition: 'Add a definition.',
    });
  });

  it('inserts a configured table command from table dimensions', () => {
    const editor = createEditor();

    editor.commands.insertContent('/table:4x6');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);

    const table = firstTopLevelNode(editor, 'table');

    expect(table?.childCount).toBe(4);
    expect(table?.firstChild?.childCount).toBe(6);
  });

  it('inherits current RTL direction when inserting slash lists', () => {
    const editor = createEditor();

    setRtlSlashContent(editor, '/bullet');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(editor, 'bulletList')?.attrs.dir).toBe('rtl');
    expect(firstTopLevelNode(editor, 'bulletList')?.firstChild?.attrs.dir).toBe('rtl');
  });

  it('inherits current RTL direction when inserting slash tables', () => {
    const editor = createEditor();

    setRtlSlashContent(editor, '/table:2x2');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);

    const table = firstTopLevelNode(editor, 'table');
    expect(table?.attrs.dir).toBe('rtl');
    expect(tableCellDirections(table!)).toEqual(['rtl', 'rtl', 'rtl', 'rtl']);
  });

  it('inserts a code block command with Enter', () => {
    const editor = createEditor();

    editor.commands.insertContent('/code');

    expect(press(editor, 'Enter').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(editor, 'codeBlock')).toBeDefined();
  });

  it('inserts a filtered callout command with Tab', () => {
    const editor = createEditor();

    editor.commands.insertContent('/warn');

    expect(getActiveOption()?.textContent).toContain('Warning callout');
    expect(press(editor, 'Tab').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(editor, 'callout')?.attrs.variant).toBe('warning');
  });

  it('moves the active item with ArrowDown and ArrowUp', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    const first = getActiveOption()?.textContent;

    expect(press(editor, 'ArrowDown').defaultPrevented).toBe(true);
    expect(getActiveOption()?.textContent).not.toBe(first);

    expect(press(editor, 'ArrowUp').defaultPrevented).toBe(true);
    expect(getActiveOption()?.textContent).toBe(first);
  });

  it('wraps keyboard navigation from the first item to the last item', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    const options = getSlashOptions();
    const last = options.at(-1)?.textContent;

    expect(press(editor, 'ArrowUp').defaultPrevented).toBe(true);
    expect(getActiveOption()?.textContent).toBe(last);
  });

  it('dismisses the menu with Escape without deleting the slash text', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    expect(getSlashMenu()).not.toBeNull();
    expect(press(editor, 'Escape').defaultPrevented).toBe(true);
    expect(getSlashMenu()).toBeNull();
    expect(editor.state.doc.textContent).toBe('/');
  });

  it('does not handle slash menu navigation when command modifiers are pressed', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    const first = getActiveOption()?.textContent;
    const event = press(editor, 'ArrowDown', { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(getActiveOption()?.textContent).toBe(first);
  });

  it('does not insert a slash command with Shift+Enter', () => {
    const editor = createEditor();

    editor.commands.insertContent('/warn');

    press(editor, 'Enter', { shiftKey: true });

    expect(firstTopLevelNode(editor, 'callout')).toBeUndefined();
    expect(editor.state.doc.textContent).toContain('/warn');
  });

  it('does not insert a slash command with Shift+Tab', () => {
    const editor = createEditor();

    editor.commands.insertContent('/warn');

    const event = press(editor, 'Tab', { shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(firstTopLevelNode(editor, 'callout')).toBeUndefined();
    expect(editor.state.doc.textContent).toContain('/warn');
  });

  it('inserts a command when clicking a menu item', () => {
    const editor = createEditor();

    editor.commands.insertContent('/warn');

    const active = getActiveOption();
    expect(active?.textContent).toContain('Warning callout');

    active?.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(firstTopLevelNode(editor, 'callout')?.attrs.variant).toBe('warning');
  });

  it('updates the active item on hover without resetting manual menu scroll', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    const menu = getSlashMenu();
    expect(menu).not.toBeNull();

    menu!.scrollTop = 42;

    getSlashOptions()[4]?.dispatchEvent(
      new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(getSlashMenu()).toBe(menu);
    expect(menu?.scrollTop).toBe(42);
    expect(getActiveOption()).toBe(getSlashOptions()[4]);
  });

  it('portals the menu outside tables and outside the editor DOM', () => {
    const editor = createEditor();

    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
    editor.commands.insertContent('/');

    const menu = getSlashMenu();

    expect(menu).not.toBeNull();
    expect(menu?.closest('table')).toBeNull();
    expect(editor.view.dom.contains(menu)).toBe(false);
  });

  it('does not show or insert slash commands in read-only editors', () => {
    const editor = createEditor(false);

    editor.commands.insertContent('/warn');

    expect(getSlashMenu()).toBeNull();

    press(editor, 'Enter');

    expect(firstTopLevelNode(editor, 'callout')).toBeUndefined();
  });

  it('removes the portaled menu when the editor is destroyed', () => {
    const editor = createEditor();

    editor.commands.insertContent('/');

    expect(getSlashMenu()).not.toBeNull();

    destroyEditor(editor);

    expect(getSlashMenu()).toBeNull();
  });
});
