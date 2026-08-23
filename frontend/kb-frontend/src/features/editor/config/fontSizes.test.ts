import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import {
  applyFontSize,
  getCurrentFontSize,
  getFontSizeLabel,
  normalizeFontSizeInput,
} from './fontSizes';

const editors: Editor[] = [];
const elements: HTMLElement[] = [];

function createEditor(): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  elements.push(element);

  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    content: '<p>Resize me</p>',
  });

  editor.commands.selectAll();
  editors.push(editor);

  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  elements.splice(0).forEach((element) => element.remove());
});

describe('font size helpers', () => {
  it('normalizes custom decimal font sizes without requiring a toolbar preset', () => {
    expect(normalizeFontSizeInput('10.5')).toBe('10.5px');
    expect(normalizeFontSizeInput('10.5px')).toBe('10.5px');
    expect(normalizeFontSizeInput('10.5pt')).toBe('10.5pt');
    expect(normalizeFontSizeInput('1.25rem')).toBe('1.25rem');
    expect(normalizeFontSizeInput('125%')).toBe('125%');
    expect(normalizeFontSizeInput('larger')).toBe('larger');
    expect(normalizeFontSizeInput('999px')).toBe('999px');
  });

  it('rejects malformed or negative custom font sizes', () => {
    expect(normalizeFontSizeInput('')).toBeNull();
    expect(normalizeFontSizeInput('large')).toBe('large');
    expect(normalizeFontSizeInput('10.5; color:red')).toBeNull();
    expect(normalizeFontSizeInput('-1px')).toBeNull();
  });

  it('applies decimal custom font sizes and still unsets the default px size', () => {
    const editor = createEditor();

    expect(applyFontSize(editor, '10.5')).toBe(true);
    expect(editor.getAttributes('textStyle').fontSize).toBe('10.5px');
    expect(getCurrentFontSize(editor)).toBe(10.5);
    expect(getFontSizeLabel({ fontSize: '10.5px' })).toBe('10.5');

    expect(applyFontSize(editor, '11')).toBe(true);
    expect(editor.getAttributes('textStyle').fontSize).toBeUndefined();
  });
});
