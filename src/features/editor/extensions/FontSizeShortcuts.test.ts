import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '.';
import {
  isDecreaseFontSizeShortcut,
  isIncreaseFontSizeShortcut,
} from './FontSizeShortcuts';

const editors: Editor[] = [];

function keyboardEvent(
  key: string,
  options: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('Windows font-size shortcuts', () => {
  it('recognizes Windows key and code variants without accepting conflicts', () => {
    expect(isIncreaseFontSizeShortcut(keyboardEvent('>', { code: 'Period' }))).toBe(
      true,
    );
    expect(isIncreaseFontSizeShortcut(keyboardEvent('.', { code: 'Period' }))).toBe(
      true,
    );
    expect(isDecreaseFontSizeShortcut(keyboardEvent('<', { code: 'Comma' }))).toBe(
      true,
    );
    expect(
      isIncreaseFontSizeShortcut(
        keyboardEvent('>', { altKey: true, code: 'Period' }),
      ),
    ).toBe(false);
  });

  it('applies shortcuts in the editor and ignores nested native controls', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: getEditorExtensions(),
      content: '<p>Resize me</p>',
    });
    editors.push(editor);
    editor.commands.selectAll();

    const increase = keyboardEvent('>', { code: 'Period' });
    editor.view.dom.dispatchEvent(increase);
    expect(increase.defaultPrevented).toBe(true);
    expect(editor.getAttributes('textStyle').fontSize).toBe('12px');

    const input = document.createElement('input');
    editor.view.dom.append(input);
    const ignored = keyboardEvent('>', { code: 'Period' });
    input.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
    expect(editor.getAttributes('textStyle').fontSize).toBe('12px');
  });
});
