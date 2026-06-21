import { Editor, type JSONContent } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { imageResizePluginKey } from './ImageResizePlugin';
import {
  BLOCK_IMAGE_NODE_NAME,
  INLINE_IMAGE_NODE_NAME,
} from './imageTypes';

const TEST_IMAGE_ATTRS = {
  src: 'https://example.com/diagram.png',
  alt: 'Architecture diagram',
  title: 'Diagram',
  width: 180,
  height: 90,
  imageOffsetPct: 12.5,
};

let editor: Editor | null = null;

function createEditor({
  content,
  editable = true,
}: {
  content?: JSONContent;
  editable?: boolean;
} = {}): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  editor = new Editor({
    element,
    editable,
    extensions: getEditorExtensions(),
    content,
  });

  return editor;
}

function findNodePos(editor: Editor, typeName: string): number {
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      foundPos = pos;
      return false;
    }

    return true;
  });

  expect(foundPos).not.toBeNull();
  return foundPos!;
}

function selectNode(editor: Editor, pos: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
  );
}

function getNodeAttrs(editor: Editor, typeName: string) {
  return editor.state.doc.nodeAt(findNodePos(editor, typeName))?.attrs;
}

function pluginMouseEvent(
  type: 'mousedown',
  target: HTMLElement,
  clientX: number,
  clientY = 0,
): MouseEvent {
  const event = new MouseEvent(type, {
    button: 0,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function callPluginMouseDown(
  editor: Editor,
  plugin: Plugin | undefined,
  event: MouseEvent,
): void {
  const handler = plugin?.props.handleDOMEvents?.mousedown as
    | ((view: typeof editor.view, mouseEvent: MouseEvent) => boolean | void)
    | undefined;

  handler?.(editor.view, event);
}

async function waitForEditorFrame(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function resizeSelectedImage(editor: Editor, deltaX: number): Promise<void> {
  await waitForEditorFrame();

  const image = editor.view.dom.querySelector<HTMLImageElement>('img[data-kb-image]')!;
  const container = image.parentElement!;

  container.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 500,
      top: 0,
      bottom: 200,
      width: 500,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  image.getBoundingClientRect = () =>
    ({
      left: 0,
      right: Number(image.getAttribute('width') ?? TEST_IMAGE_ATTRS.width),
      top: 0,
      bottom: 90,
      width: Number(image.getAttribute('width') ?? TEST_IMAGE_ATTRS.width),
      height: 90,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  await waitForEditorFrame();

  const handle = editor.view.dom.querySelector<HTMLElement>(
    '.kb-image-resize-handle',
  );
  expect(handle).not.toBeNull();

  callPluginMouseDown(
    editor,
    imageResizePluginKey.get(editor.state),
    pluginMouseEvent('mousedown', handle!, 100),
  );

  window.dispatchEvent(
    new MouseEvent('mousemove', {
      clientX: 100 + deltaX,
      clientY: 0,
      bubbles: true,
      cancelable: true,
    }),
  );
  window.dispatchEvent(
    new MouseEvent('mouseup', {
      clientX: 100 + deltaX,
      clientY: 0,
      bubbles: true,
      cancelable: true,
    }),
  );
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('image extension integration', () => {
  it('inserts a block image through the existing setImage command', () => {
    const editor = createEditor();

    expect(editor.commands.setImage(TEST_IMAGE_ATTRS)).toBe(true);

    const attrs = getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME);
    expect(attrs).toMatchObject(TEST_IMAGE_ATTRS);
    expect(editor.view.dom.querySelector('img')?.dataset.kbImage).toBe('block');
  });

  it('converts a block image to an inline image while preserving attributes', () => {
    const editor = createEditor();
    editor.commands.setImage(TEST_IMAGE_ATTRS);
    selectNode(editor, findNodePos(editor, BLOCK_IMAGE_NODE_NAME));

    expect(editor.commands.setImageDisplay('inline')).toBe(true);

    expect(getNodeAttrs(editor, INLINE_IMAGE_NODE_NAME)).toMatchObject(
      TEST_IMAGE_ATTRS,
    );
    expect(() => findNodePos(editor, BLOCK_IMAGE_NODE_NAME)).toThrow();
  });

  it('converts an inline image to a block image while preserving attributes', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before ' },
              { type: INLINE_IMAGE_NODE_NAME, attrs: TEST_IMAGE_ATTRS },
              { type: 'text', text: ' after' },
            ],
          },
        ],
      },
    });
    selectNode(editor, findNodePos(editor, INLINE_IMAGE_NODE_NAME));

    expect(editor.commands.setImageDisplay('block')).toBe(true);

    expect(getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME)).toMatchObject(
      TEST_IMAGE_ATTRS,
    );
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      'paragraph',
      BLOCK_IMAGE_NODE_NAME,
      'paragraph',
    ]);
    expect(editor.state.doc.textContent).toBe('Before  after');
  });

  it('resizing a selected image updates the width attribute', async () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [{ type: BLOCK_IMAGE_NODE_NAME, attrs: TEST_IMAGE_ATTRS }],
      },
    });
    selectNode(editor, findNodePos(editor, BLOCK_IMAGE_NODE_NAME));

    await resizeSelectedImage(editor, 60);

    expect(getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME)?.width).toBe(240);
  });

  it('keeps image editing controls inert in read-only editors', async () => {
    const editor = createEditor({
      editable: false,
      content: {
        type: 'doc',
        content: [{ type: BLOCK_IMAGE_NODE_NAME, attrs: TEST_IMAGE_ATTRS }],
      },
    });
    selectNode(editor, findNodePos(editor, BLOCK_IMAGE_NODE_NAME));
    await waitForEditorFrame();
    const before = editor.getJSON();

    expect(editor.view.dom.querySelector('.kb-image-resize-handle')).toBeNull();
    expect(editor.commands.setImageDisplay('inline')).toBe(false);
    expect(editor.commands.deleteSelectedImage()).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('supports undo and redo after image conversion and resizing', async () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [{ type: BLOCK_IMAGE_NODE_NAME, attrs: TEST_IMAGE_ATTRS }],
      },
    });

    selectNode(editor, findNodePos(editor, BLOCK_IMAGE_NODE_NAME));
    expect(editor.commands.setImageDisplay('inline')).toBe(true);
    expect(findNodePos(editor, INLINE_IMAGE_NODE_NAME)).toBeGreaterThanOrEqual(0);

    expect(editor.commands.undo()).toBe(true);
    expect(findNodePos(editor, BLOCK_IMAGE_NODE_NAME)).toBeGreaterThanOrEqual(0);
    expect(editor.commands.redo()).toBe(true);
    expect(findNodePos(editor, INLINE_IMAGE_NODE_NAME)).toBeGreaterThanOrEqual(0);

    selectNode(editor, findNodePos(editor, INLINE_IMAGE_NODE_NAME));
    expect(editor.commands.setImageDisplay('block')).toBe(true);
    selectNode(editor, findNodePos(editor, BLOCK_IMAGE_NODE_NAME));

    await resizeSelectedImage(editor, 40);
    expect(getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME)?.width).toBe(220);

    expect(editor.commands.undo()).toBe(true);
    expect(getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME)?.width).toBe(180);
    expect(editor.commands.redo()).toBe(true);
    expect(getNodeAttrs(editor, BLOCK_IMAGE_NODE_NAME)?.width).toBe(220);
  });
});
