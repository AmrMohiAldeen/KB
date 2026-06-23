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
import { GLOSSARY_NODE_NAME } from '../../extensions/Glossary';

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

describe('EditorToolbar direction controls', () => {
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

  async function renderDirectionToolbar(content: JSONContent, editable = true) {
    editor = new Editor({
      element: editorElement,
      editable,
      extensions: getEditorExtensions(),
      content,
    });

    editor.commands.selectAll();

    await act(async () => {
      root?.render(createElement(EditorToolbar, { editor: editor! }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  function directionButton(direction: 'LTR' | 'RTL'): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
      `button[aria-label="Set ${direction} text direction"]`,
    );
  }

  function toolbarButton(label: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
  }

  function nodesByName(name: string): JSONContent[] {
    const nodes: JSONContent[] = [];

    function visit(node: JSONContent) {
      if (node.type === name) nodes.push(node);
      node.content?.forEach(visit);
    }

    visit(editor!.getJSON());
    return nodes;
  }

  async function clickButton(button: HTMLButtonElement | null) {
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function clickDirection(direction: 'LTR' | 'RTL') {
    const button = directionButton(direction);
    await clickButton(button);
  }

  it('shows the active state for a uniform RTL or LTR selection', async () => {
    await renderDirectionToolbar({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { dir: 'rtl' },
          content: [{ type: 'text', text: 'Arabic' }],
        },
      ],
    });

    expect(directionButton('RTL')?.getAttribute('aria-pressed')).toBe('true');
    expect(directionButton('LTR')?.getAttribute('aria-pressed')).toBe('false');

    await clickDirection('LTR');

    expect(editor!.getJSON().content?.[0]?.attrs?.dir).toBe('ltr');
    expect(directionButton('LTR')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('inherits current RTL direction when creating toolbar lists', async () => {
    await renderDirectionToolbar({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { dir: 'rtl' },
          content: [{ type: 'text', text: 'Arabic' }],
        },
      ],
    });

    await clickButton(toolbarButton('Unordered list'));

    expect(nodesByName('bulletList')[0]?.attrs?.dir).toBe('rtl');
    expect(nodesByName('listItem')[0]?.attrs?.dir).toBe('rtl');
  });

  it('shows no active direction when the selection is mixed', async () => {
    await renderDirectionToolbar({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { dir: 'rtl' },
          content: [{ type: 'text', text: 'Arabic' }],
        },
        {
          type: 'paragraph',
          attrs: { dir: 'ltr' },
          content: [{ type: 'text', text: 'English' }],
        },
      ],
    });

    expect(directionButton('RTL')?.getAttribute('aria-pressed')).toBe('false');
    expect(directionButton('LTR')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not render direction controls for read-only editors', async () => {
    await renderDirectionToolbar(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Read only' }],
          },
        ],
      },
      false,
    );

    expect(directionButton('RTL')).toBeNull();
    expect(directionButton('LTR')).toBeNull();
  });
});

describe('EditorToolbar glossary control', () => {
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
    document.body.replaceChildren();
  });

  async function renderGlossaryToolbar() {
    editor = new Editor({
      element: editorElement,
      editable: true,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'API gateway' }],
          },
        ],
      },
    });

    editor.commands.setTextSelection({ from: 1, to: 12 });

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

  async function changeInput(
    element: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
  ) {
    expect(element).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(element!),
        'value',
      )?.set;

      valueSetter?.call(element!, value);
      element!.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  function toolbarButton(label: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
  }

  function dialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="dialog"]');
  }

  function dialogInput(label: string): HTMLInputElement | HTMLTextAreaElement | null {
    const labels = Array.from(
      dialog()?.querySelectorAll<HTMLLabelElement>('label') ?? [],
    );
    const match = labels.find((item) => item.textContent?.trim() === label);
    const inputId = match?.getAttribute('for');

    return inputId
      ? dialog()?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `#${inputId}`,
        ) ?? null
      : null;
  }

  function dialogButton(label: string): HTMLButtonElement | null {
    return Array.from(
      dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    ).find((button) => button.textContent?.trim() === label) ?? null;
  }

  function findNode(content: JSONContent, type: string): JSONContent | null {
    if (content.type === type) return content;

    for (const child of content.content ?? []) {
      const found = findNode(child, type);
      if (found) return found;
    }

    return null;
  }

  it('inserts a glossary node from selected text', async () => {
    await renderGlossaryToolbar();

    await click(toolbarButton('Glossary term'));

    expect(dialog()).not.toBeNull();
    expect((dialogInput('Term') as HTMLInputElement | null)?.value).toBe(
      'API gateway',
    );

    await changeInput(
      dialogInput('Definition'),
      'Internal entry point for service traffic',
    );
    await click(dialogButton('Insert'));

    const glossary = findNode(editor!.getJSON(), GLOSSARY_NODE_NAME);

    expect(glossary?.attrs).toMatchObject({
      term: 'API gateway',
      definition: 'Internal entry point for service traffic',
    });
  });
});
