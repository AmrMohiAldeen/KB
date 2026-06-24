import { Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorContent } from '@tiptap/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';

const mountedEditors: Array<{ editor: Editor; root: Root }> = [];

function articleContent(attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'tableOfContentsBlock',
        attrs,
      },
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '1. Overview' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '2. User Personas & Target Roles' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '2026 Roadmap' }],
      },
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '3. Release Plan' }],
      },
    ],
  };
}

async function createEditor(
  content: JSONContent | string = articleContent(),
): Promise<Editor> {
  const editorElement = document.createElement('div');
  const container = document.createElement('div');
  document.body.append(editorElement, container);

  const editor = new Editor({
    element: editorElement,
    extensions: getEditorExtensions(),
    content,
  });
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(EditorContent, { editor }));
    await waitForNodeViewRender();
  });

  mountedEditors.push({ editor, root });
  return editor;
}

function findNode(
  editor: Editor,
  typeName: string,
): { node: ProseMirrorNode; pos: number } {
  let match: { node: ProseMirrorNode; pos: number } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return;

    match = { node, pos };
    return false;
  });

  expect(match).not.toBeNull();
  return match!;
}

function fallbackHeadingId(editor: Editor, text: string): string {
  let id: string | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading' || node.textContent !== text) return;

    id = `heading-${pos}`;
    return false;
  });

  expect(id).not.toBeNull();
  return id!;
}

function setExcludedHeadingIds(editor: Editor, excludedHeadingIds: string[]): void {
  const toc = findNode(editor, 'tableOfContentsBlock');

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(toc.pos, undefined, {
      ...toc.node.attrs,
      excludedHeadingIds,
    }),
  );
}

async function waitForNodeViewRender(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();

  await act(async () => {
    (element as HTMLElement).click();
    await waitForNodeViewRender();
  });
}

function visibleList(editor: Editor): HTMLOListElement {
  const list = editor.view.dom.querySelector<HTMLOListElement>(
    'ol[aria-label="Table of contents"]',
  );

  expect(list).not.toBeNull();
  return list!;
}

function checkbox(editor: Editor, label: string): HTMLInputElement {
  const input = Array.from(
    editor.view.dom.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ).find((input) => input.getAttribute('aria-label') === label);

  expect(input).not.toBeNull();
  return input!;
}

afterEach(() => {
  mountedEditors.splice(0).forEach(({ editor, root }) => {
    act(() => root.unmount());
    editor.destroy();
  });
});

describe('table of contents block', () => {
  it('renders normalized heading text with automatic numbering', async () => {
    const editor = await createEditor();

    const list = visibleList(editor);
    const buttons = Array.from(list.querySelectorAll('button'));

    expect(buttons.map((button) => button.querySelector('span')?.textContent)).toEqual([
      '1',
      '1.1',
      '1.2',
      '2',
    ]);

    const text = list.textContent ?? '';
    expect(text).toContain('Overview');
    expect(text).toContain('User Personas & Target Roles');
    expect(text).toContain('2026 Roadmap');
    expect(text).toContain('Release Plan');
    expect(text).not.toContain('1. Overview');
    expect(text).not.toContain('2. User Personas');
    expect(text).not.toContain('3. Release Plan');
  });

  it('lets editors choose which headings appear in the visible TOC', async () => {
    const editor = await createEditor();

    const userPersonasId = fallbackHeadingId(
      editor,
      '2. User Personas & Target Roles',
    );
    await click(
      editor.view.dom.querySelector<HTMLButtonElement>(
        'button[aria-label="Edit table of contents"]',
      ),
    );

    const userPersonasCheckbox = checkbox(
      editor,
      'Include User Personas & Target Roles in table of contents',
    );

    expect(userPersonasCheckbox.checked).toBe(true);
    await click(userPersonasCheckbox);

    expect(userPersonasCheckbox.checked).toBe(false);
    expect(visibleList(editor).textContent).not.toContain(
      'User Personas & Target Roles',
    );
    expect(
      findNode(editor, 'tableOfContentsBlock').node.attrs.excludedHeadingIds,
    ).toEqual([userPersonasId]);

    await click(userPersonasCheckbox);

    expect(userPersonasCheckbox.checked).toBe(true);
    expect(visibleList(editor).textContent).toContain(
      'User Personas & Target Roles',
    );
    expect(
      findNode(editor, 'tableOfContentsBlock').node.attrs.excludedHeadingIds,
    ).toEqual([]);
  });

  it('persists excluded headings through static HTML attributes', async () => {
    const editor = await createEditor();

    const userPersonasId = fallbackHeadingId(
      editor,
      '2. User Personas & Target Roles',
    );
    setExcludedHeadingIds(editor, [userPersonasId]);
    await waitForNodeViewRender();

    expect(visibleList(editor).textContent).not.toContain(
      'User Personas & Target Roles',
    );

    const html = editor.getHTML();
    expect(html).toContain('data-kb-toc-excluded-heading-ids=');

    const restored = await createEditor(html);
    expect(
      findNode(restored, 'tableOfContentsBlock').node.attrs.excludedHeadingIds,
    ).toEqual([userPersonasId]);
  });
});
