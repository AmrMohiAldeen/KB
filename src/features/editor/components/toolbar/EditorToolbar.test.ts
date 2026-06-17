import { Editor, type JSONContent } from '@tiptap/core';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import EditorToolbar from './EditorToolbar';
import {
  DEFAULT_MATH_FORMULA,
  insertBlockFormula,
  insertInlineFormula,
} from './mathFormulaActions';

describe('EditorToolbar formula controls', () => {
  let container: HTMLDivElement;
  let editorElement: HTMLDivElement;
  let editor: Editor | null;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement('div');
    editorElement = document.createElement('div');
    document.body.append(editorElement, container);
    root = createRoot(container);
    editor = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    editor?.destroy();
    editor = null;
  });

  async function renderToolbar(editable = true) {
    editor = new Editor({
      element: editorElement,
      editable,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Formula' }] },
        ],
      },
    });

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    await act(async () => {
      root?.render(createElement(EditorToolbar, { editor: editor! }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function click(element: Element | null) {
    expect(element).not.toBeNull();

    await act(async () => {
      element!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  function formulaMenuButton(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert formula"]',
    );
  }

  function menuItem(label: string): HTMLButtonElement | null {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === label,
    ) ?? null;
  }

  function formulaDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="dialog"]');
  }

  function latexInput(): HTMLTextAreaElement | null {
    return formulaDialog()?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
  }

  function insertButton(): HTMLButtonElement | null {
    return Array.from(
      formulaDialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    ).find((button) => button.textContent?.trim() === 'Insert') ?? null;
  }

  async function enterLatex(value: string) {
    const textarea = latexInput();
    expect(textarea).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;

      valueSetter?.call(textarea!, value);
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function submitFormulaDialog() {
    const dialog = formulaDialog();
    expect(dialog).not.toBeNull();

    await act(async () => {
      dialog!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function openFormulaDialog(label: string) {
    await click(formulaMenuButton());
    await click(menuItem(label));
    expect(formulaDialog()).not.toBeNull();
  }

  function findNode(content: JSONContent, type: string): JSONContent | null {
    if (content.type === type) return content;

    for (const child of content.content ?? []) {
      const found = findNode(child, type);
      if (found) return found;
    }

    return null;
  }

  it('does not insert when the submitted inline formula is empty', async () => {
    await renderToolbar();

    await openFormulaDialog('Inline formula');
    await submitFormulaDialog();

    expect(findNode(editor!.getJSON(), 'inlineMath')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter a LaTeX formula.',
    );
  });

  it('inserts an inline math formula from the formula dialog', async () => {
    await renderToolbar();

    await openFormulaDialog('Inline formula');
    await enterLatex(String.raw`\alpha + \beta`);
    await click(insertButton());

    const inlineMath = findNode(editor!.getJSON(), 'inlineMath');
    expect(inlineMath?.attrs?.latex).toBe(String.raw`\alpha + \beta`);
    expect(inlineMath?.attrs?.latex).not.toBe(DEFAULT_MATH_FORMULA);
  });

  it('inserts a block math formula from the formula dialog', async () => {
    await renderToolbar();

    await openFormulaDialog('Block formula');
    await enterLatex(String.raw`\sum_{i=1}^{n} i`);
    await click(insertButton());

    const blockMath = findNode(editor!.getJSON(), 'blockMath');
    expect(blockMath?.attrs?.latex).toBe(String.raw`\sum_{i=1}^{n} i`);
    expect(blockMath?.attrs?.latex).not.toBe(DEFAULT_MATH_FORMULA);
  });

  it('only inserts the default formula when the user explicitly enters it', async () => {
    await renderToolbar();

    await openFormulaDialog('Inline formula');
    await enterLatex(DEFAULT_MATH_FORMULA);
    await click(insertButton());

    const inlineMath = findNode(editor!.getJSON(), 'inlineMath');
    expect(inlineMath?.attrs?.latex).toBe(DEFAULT_MATH_FORMULA);
  });

  it('does not insert invalid LaTeX from the formula dialog', async () => {
    await renderToolbar();

    await openFormulaDialog('Block formula');
    await enterLatex(String.raw`\definitelynotacommand`);
    await click(insertButton());

    expect(findNode(editor!.getJSON(), 'blockMath')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'KaTeX parse error',
    );
  });

  it('does not render formula controls for read-only editors', async () => {
    await renderToolbar(false);

    expect(formulaMenuButton()).toBeNull();
    expect(insertInlineFormula(editor!, 'x')).toBe(false);
    expect(insertBlockFormula(editor!, 'x')).toBe(false);
    expect(findNode(editor!.getJSON(), 'inlineMath')).toBeNull();
    expect(findNode(editor!.getJSON(), 'blockMath')).toBeNull();
  });
});
