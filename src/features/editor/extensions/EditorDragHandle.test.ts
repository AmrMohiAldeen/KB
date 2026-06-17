import { Editor } from '@tiptap/core';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '.';
import {
  EditorDragHandle,
  getEditorDragHandleRuleDeduction,
} from './EditorDragHandle';

describe('EditorDragHandle', () => {
  let container: HTMLDivElement;
  let editor: Editor | null;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(document.createElement('div'));
    editor = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    editor?.destroy();
    editor = null;
  });

  async function renderHandle(editable: boolean) {
    editor = new Editor({
      element: container,
      editable,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] },
        ],
      },
    });

    await act(async () => {
      root?.render(createElement(EditorDragHandle, { editor: editor! }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  it('mounts the official drag handle for editable editors', async () => {
    await renderHandle(true);

    const handle = document.querySelector<HTMLElement>('.kb-official-drag-handle');
    expect(handle).not.toBeNull();
    expect(handle?.classList.contains('kb-block-drag-handle')).toBe(true);
    expect(handle?.draggable).toBe(true);
    expect(handle?.parentElement?.parentElement).toBe(container);

    expect(handle?.style.visibility).toBe('hidden');
    expect(handle?.style.position).toBe('absolute');
    expect(document.querySelector('.content-block-drag-handle')).toBeNull();
    expect(document.querySelector('.table-drag-handle')).toBeNull();
  });

  it('does not render a drag handle for read-only editors', async () => {
    await renderHandle(false);

    expect(document.querySelector('.kb-official-drag-handle')).toBeNull();
  });

  it('keeps supported block nodes eligible for official drag targeting', () => {
    const supportedNodeNames = [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'table',
      'accordion',
      'tabs',
      'callout',
    ];

    supportedNodeNames.forEach((nodeName) => {
      expect(getEditorDragHandleRuleDeduction({ nodeName })).toBe(0);
    });
  });

  it('falls back from unsafe nested structures to their supported container nodes', () => {
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'paragraph',
        parentName: 'listItem',
        isFirst: true,
      }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({ nodeName: 'tableRow' }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({ nodeName: 'tableCell' }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'paragraph',
        parentName: 'tableCell',
        ancestorNames: ['table', 'tableRow', 'tableCell'],
      }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({ nodeName: 'accordionItem' }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'paragraph',
        parentName: 'accordionItem',
        ancestorNames: ['accordion', 'accordionItem'],
      }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({ nodeName: 'tabItem' }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'paragraph',
        parentName: 'tabItem',
        ancestorNames: ['tabs', 'tabItem'],
      }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'paragraph',
        parentName: 'callout',
        ancestorNames: ['callout'],
      }),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      getEditorDragHandleRuleDeduction({
        nodeName: 'text',
        isText: true,
      }),
    ).toBeGreaterThanOrEqual(1000);
  });
});
