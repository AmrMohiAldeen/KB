/**
 * Tests editor font-size keyboard shortcuts across Windows/Linux and macOS.
 *
 * Windows/Linux use Ctrl + Shift + < / >.
 * macOS uses Cmd + Shift + < / >.
 *
 * These tests also verify that shortcuts are ignored inside native controls
 * so toolbar inputs or embedded controls are not hijacked by the editor.
 */


import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from './';
import {
  isDecreaseFontSizeShortcut,
  isIncreaseFontSizeShortcut,
} from './FontSizeShortcuts';

const editors: Editor[] = [];
const elements: HTMLElement[] = [];

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

function createEditor(): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  elements.push(element);

  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    content: '<p>Resize me</p>',
  });

  editors.push(editor);
  editor.commands.selectAll();

  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  elements.splice(0).forEach((element) => element.remove());
});

describe('font-size shortcuts', () => {
  describe('Windows/Linux Ctrl shortcuts', () => {
    it('recognizes Ctrl key and code variants without accepting conflicts', () => {
      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('>', {
            code: 'Period',
          }),
        ),
      ).toBe(true);

      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('.', {
            code: 'Period',
          }),
        ),
      ).toBe(true);

      expect(
        isDecreaseFontSizeShortcut(
          keyboardEvent('<', {
            code: 'Comma',
          }),
        ),
      ).toBe(true);

      expect(
        isDecreaseFontSizeShortcut(
          keyboardEvent(',', {
            code: 'Comma',
          }),
        ),
      ).toBe(true);

      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('>', {
            altKey: true,
            code: 'Period',
          }),
        ),
      ).toBe(false);
    });

    it('applies Ctrl shortcuts in the editor', () => {
      const editor = createEditor();

      const increase = keyboardEvent('>', {
        code: 'Period',
      });

      editor.view.dom.dispatchEvent(increase);

      expect(increase.defaultPrevented).toBe(true);
      expect(editor.getAttributes('textStyle').fontSize).toBe('12px');
    });

    it('ignores Ctrl shortcuts inside nested native controls', () => {
      const editor = createEditor();

      const input = document.createElement('input');
      editor.view.dom.append(input);

      const ignored = keyboardEvent('>', {
        code: 'Period',
      });

      input.dispatchEvent(ignored);

      expect(ignored.defaultPrevented).toBe(false);
      expect(editor.getAttributes('textStyle').fontSize).toBeUndefined();
    });
  });

  describe('macOS Command shortcuts', () => {
    it('recognizes Command key and code variants without accepting conflicts', () => {
      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('>', {
            ctrlKey: false,
            metaKey: true,
            code: 'Period',
          }),
        ),
      ).toBe(true);

      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('.', {
            ctrlKey: false,
            metaKey: true,
            code: 'Period',
          }),
        ),
      ).toBe(true);

      expect(
        isDecreaseFontSizeShortcut(
          keyboardEvent('<', {
            ctrlKey: false,
            metaKey: true,
            code: 'Comma',
          }),
        ),
      ).toBe(true);

      expect(
        isDecreaseFontSizeShortcut(
          keyboardEvent(',', {
            ctrlKey: false,
            metaKey: true,
            code: 'Comma',
          }),
        ),
      ).toBe(true);

      expect(
        isIncreaseFontSizeShortcut(
          keyboardEvent('>', {
            ctrlKey: false,
            metaKey: true,
            altKey: true,
            code: 'Period',
          }),
        ),
      ).toBe(false);
    });

    it('applies Command shortcuts in the editor', () => {
      const editor = createEditor();

      const increase = keyboardEvent('>', {
        ctrlKey: false,
        metaKey: true,
        code: 'Period',
      });

      editor.view.dom.dispatchEvent(increase);

      expect(increase.defaultPrevented).toBe(true);
      expect(editor.getAttributes('textStyle').fontSize).toBe('12px');
    });

    it('ignores Command shortcuts inside nested native controls', () => {
      const editor = createEditor();

      const input = document.createElement('input');
      editor.view.dom.append(input);

      const ignored = keyboardEvent('>', {
        ctrlKey: false,
        metaKey: true,
        code: 'Period',
      });

      input.dispatchEvent(ignored);

      expect(ignored.defaultPrevented).toBe(false);
      expect(editor.getAttributes('textStyle').fontSize).toBeUndefined();
    });
  });

  it('rejects Ctrl + Command conflicts', () => {
    expect(
      isIncreaseFontSizeShortcut(
        keyboardEvent('>', {
          ctrlKey: true,
          metaKey: true,
          code: 'Period',
        }),
      ),
    ).toBe(false);

    expect(
      isDecreaseFontSizeShortcut(
        keyboardEvent('<', {
          ctrlKey: true,
          metaKey: true,
          code: 'Comma',
        }),
      ),
    ).toBe(false);
  });
});