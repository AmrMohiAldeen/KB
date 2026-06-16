import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';

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

function press(editor: Editor, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}

function firstTopLevelNode(editor: Editor, type: string) {
  return Array.from({ length: editor.state.doc.childCount }, (_, index) =>
    editor.state.doc.child(index),
  ).find((node) => node.type.name === type);
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('slash command menu', () => {
  it('inserts standard and compound blocks with Arrow keys, Enter, and Tab', () => {
    const headingEditor = createEditor();
    headingEditor.commands.insertContent('/heading-2');
    expect(press(headingEditor, 'Enter').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(headingEditor, 'heading')?.attrs.level).toBe(2);

    const tableEditor = createEditor();
    tableEditor.commands.insertContent('/table');
    press(tableEditor, 'Enter');
    expect(firstTopLevelNode(tableEditor, 'table')?.childCount).toBe(3);

    const codeEditor = createEditor();
    codeEditor.commands.insertContent('/code');
    press(codeEditor, 'Enter');
    expect(firstTopLevelNode(codeEditor, 'codeBlock')).toBeDefined();

    const calloutEditor = createEditor();
    calloutEditor.commands.insertContent('/warn');
    expect(
      document.body.querySelector('[aria-selected="true"]')?.textContent,
    ).toContain('Warning callout');
    expect(press(calloutEditor, 'Tab').defaultPrevented).toBe(true);
    expect(firstTopLevelNode(calloutEditor, 'callout')?.attrs.variant).toBe(
      'warning',
    );

    const navigationEditor = createEditor();
    navigationEditor.commands.insertContent('/');
    const first = document.body.querySelector(
      '[aria-selected="true"]',
    )?.textContent;
    expect(press(navigationEditor, 'ArrowDown').defaultPrevented).toBe(true);
    expect(
      document.body.querySelector('[aria-selected="true"]')?.textContent,
    ).not.toBe(first);
    expect(press(navigationEditor, 'ArrowUp').defaultPrevented).toBe(true);
    expect(
      document.body.querySelector('[aria-selected="true"]')?.textContent,
    ).toBe(first);

    const configuredTableEditor = createEditor();
    configuredTableEditor.commands.insertContent('/table:4x6');
    press(configuredTableEditor, 'Enter');
    const configuredTable = firstTopLevelNode(configuredTableEditor, 'table');
    expect(configuredTable?.childCount).toBe(4);
    expect(configuredTable?.firstChild?.childCount).toBe(6);
  });

  it('portals outside tables and does not reset manual scrolling on hover', () => {
    const editor = createEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
    editor.commands.insertContent('/');

    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    expect(menu).not.toBeNull();
    expect(menu?.closest('table')).toBeNull();
    expect(editor.view.dom.contains(menu)).toBe(false);

    menu!.scrollTop = 42;
    menu
      ?.querySelectorAll<HTMLElement>('[role="option"]')[4]
      ?.dispatchEvent(new MouseEvent('mouseenter'));

    expect(document.body.querySelector('[role="listbox"]')).toBe(menu);
    expect(menu?.scrollTop).toBe(42);
  });

  it('dismisses with Escape and does not interfere with normal typing contexts', () => {
    const editor = createEditor();
    editor.commands.insertContent('/');
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(press(editor, 'Escape').defaultPrevented).toBe(true);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(editor.state.doc.textContent).toBe('/');

    editor.commands.setContent('<p>https://example.com/path</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();

    editor.commands.setContent('<pre><code>/warning</code></pre>');
    editor.commands.setTextSelection(5);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it('stays unavailable in read-only editors', () => {
    const editor = createEditor(false);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    press(editor, 'Enter');
    expect(firstTopLevelNode(editor, 'callout')).toBeUndefined();
  });
});
