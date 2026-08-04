import { Editor, type JSONContent } from '@tiptap/core';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import EditorToolbar from './EditorToolbar';
import { ImageControl } from './ImageControl';
import { YoutubeControl } from './YoutubeControl';

describe('editor media controls and word count', () => {
  let container: HTMLDivElement;
  let editorElement: HTMLDivElement;
  let root: Root | null;
  let editor: Editor | null;

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

  function createEditor(content?: JSONContent, editable = true) {
    editor = new Editor({
      element: editorElement,
      editable,
      extensions: getEditorExtensions(),
      content,
    });
  }

  async function render(component: React.ReactElement) {
    await act(async () => {
      root?.render(component);
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

  async function setInputValue(input: HTMLInputElement | null, value: string) {
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;

      valueSetter?.call(input!, value);
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  function findNode(content: JSONContent, type: string): JSONContent | null {
    if (content.type === type) return content;

    for (const child of content.content ?? []) {
      const found = findNode(child, type);
      if (found) return found;
    }

    return null;
  }

  function dialogSubmitButton(): HTMLButtonElement | null {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((button) => button.textContent?.trim() === 'Insert') ?? null;
  }

  it('inserts an image from ImageControl', async () => {
    createEditor();
    await render(createElement(ImageControl, { editor: editor! }));

    await click(
      document.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]'),
    );
    await setInputValue(
      document.querySelector<HTMLInputElement>('input[placeholder="https://example.com/image.png"]'),
      'https://example.com/lesson.png',
    );
    await setInputValue(
      document.querySelector<HTMLInputElement>('input[placeholder="Describe the image"]'),
      'Lesson diagram',
    );
    await setInputValue(
      document.querySelector<HTMLInputElement>('input[placeholder="Optional title"]'),
      'Lesson',
    );

    await click(dialogSubmitButton());

    const image = findNode(editor!.getJSON(), 'image');
    expect(image?.attrs).toMatchObject({
      src: 'https://example.com/lesson.png',
      alt: 'Lesson diagram',
      title: 'Lesson',
    });
  });

  it('inserts a normalized YouTube video from YoutubeControl', async () => {
    createEditor();
    await render(createElement(YoutubeControl, { editor: editor! }));

    await click(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Insert YouTube video"]',
      ),
    );
    await setInputValue(
      document.querySelector<HTMLInputElement>('input[placeholder="https://www.youtube.com/watch?v=..."]'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await click(dialogSubmitButton());

    const youtube = findNode(editor!.getJSON(), 'youtube');
    expect(youtube?.attrs).toMatchObject({
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      width: 640,
      height: 360,
    });
  });

  it('rejects invalid YouTube links without inserting a video', async () => {
    createEditor();
    await render(createElement(YoutubeControl, { editor: editor! }));

    await click(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Insert YouTube video"]',
      ),
    );
    await setInputValue(
      document.querySelector<HTMLInputElement>('input[placeholder="https://www.youtube.com/watch?v=..."]'),
      'https://example.com/not-youtube',
    );

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter a valid YouTube link',
    );
    expect(findNode(editor!.getJSON(), 'youtube')).toBeNull();
  });

  it('updates the toolbar word count as editor content changes', async () => {
    createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One two' }] },
      ],
    });
    editor!.commands.setTextSelection(editor!.state.doc.content.size - 1);
    await render(createElement(EditorToolbar, { editor: editor! }));

    expect(container.textContent).toContain('2 words');

    await act(async () => {
      editor!.commands.insertContent(' three');
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('3 words');
  });
});
