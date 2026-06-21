import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { ImageBubbleMenu } from './ImageBubbleMenu';
import { BLOCK_IMAGE_NODE_NAME } from './imageTypes';

const IMAGE_ATTRS = {
  src: 'https://example.com/menu.png',
  alt: 'Menu image',
  title: 'Menu',
  width: 160,
};

describe('ImageBubbleMenu', () => {
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

  function createEditor(editable = true) {
    editor = new Editor({
      element: editorElement,
      editable,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [{ type: BLOCK_IMAGE_NODE_NAME, attrs: IMAGE_ATTRS }],
      },
    });

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
  }

  async function renderMenu() {
    await act(async () => {
      root?.render(createElement(ImageBubbleMenu, { editor: editor! }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function click(button: HTMLButtonElement | null) {
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  it('shows image actions when a selected image is editable', async () => {
    createEditor(true);
    await renderMenu();

    expect(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Convert to inline image"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="Delete image"]'),
    ).not.toBeNull();
  });

  it('removes the selected image from the delete button', async () => {
    createEditor(true);
    await renderMenu();

    await click(
      document.querySelector<HTMLButtonElement>('button[aria-label="Delete image"]'),
    );

    expect(editor!.state.doc.firstChild?.type.name).not.toBe(BLOCK_IMAGE_NODE_NAME);
  });

  it('does not render image editing controls for read-only editors', async () => {
    createEditor(false);
    await renderMenu();

    expect(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Convert to inline image"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="Delete image"]'),
    ).toBeNull();
  });
});

