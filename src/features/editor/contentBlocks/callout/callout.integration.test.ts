import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import {
  CALLOUT_VARIANTS,
  createCalloutContent,
  normalizeCalloutVariant,
} from './model';

const editors: Editor[] = [];

function createEditor(options: {
  content?: JSONContent | string;
  editable?: boolean;
} = {}): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    ...options,
  });
  editors.push(editor);
  return editor;
}

function findCallout(editor: Editor): ProseMirrorNode | null {
  let result: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'callout') {
      result = node;
      return false;
    }
  });
  return result;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('callout node', () => {
  it('inserts every normalized variant and rejects commands in read-only mode', () => {
    for (const variant of CALLOUT_VARIANTS) {
      const editor = createEditor();
      expect(editor.commands.insertCallout({ variant })).toBe(true);
      expect(findCallout(editor)?.attrs.variant).toBe(variant);
    }

    const aliasEditor = createEditor();
    expect(aliasEditor.commands.insertCallout({ variant: 'error' })).toBe(true);
    expect(findCallout(aliasEditor)?.attrs.variant).toBe('danger');
    expect(normalizeCalloutVariant('unknown')).toBe('info');

    const readOnly = createEditor({ editable: false });
    expect(readOnly.commands.insertCallout({ variant: 'warning' })).toBe(false);
  });

  it('preserves rich nested content and emits clean static HTML', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'warning' },
          content: [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Before you continue' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Keep nested formatting',
                          marks: [{ type: 'bold' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            createCalloutContent('tip'),
          ],
        },
      ],
    };
    const editor = createEditor({ content });
    const html = editor.getHTML();

    expect(html).toContain('<aside');
    expect(html).toContain('data-kb-callout-variant="warning"');
    expect(html).toContain('data-kb-callout-content=""');
    expect(html).toContain('<h3>Before you continue</h3>');
    expect(html).toContain('<strong>Keep nested formatting</strong>');
    expect(html).toContain('data-kb-callout-variant="tip"');
    expect(html).not.toContain('contenteditable');
    expect(generateHTML(editor.getJSON(), getEditorExtensions())).toBe(html);

    const restored = createEditor({ content: html });
    expect(findCallout(restored)?.attrs.variant).toBe('warning');
    expect(findCallout(restored)?.textContent).toContain('Before you continue');
    expect(() => restored.state.doc.check()).not.toThrow();
  });

  it('supports undo/redo and renders the same semantic shell read-only', () => {
    const editor = createEditor();
    expect(editor.commands.insertCallout({ variant: 'success' })).toBe(true);
    expect(findCallout(editor)?.attrs.variant).toBe('success');
    expect(editor.commands.undo()).toBe(true);
    expect(findCallout(editor)).toBeNull();
    expect(editor.commands.redo()).toBe(true);
    expect(findCallout(editor)?.attrs.variant).toBe('success');

    editor.commands.setTextSelection(2);
    expect(editor.commands.setCalloutVariant('danger')).toBe(true);
    expect(findCallout(editor)?.attrs.variant).toBe('danger');
    expect(editor.commands.undo()).toBe(true);
    expect(findCallout(editor)?.attrs.variant).toBe('success');
    expect(editor.commands.redo()).toBe(true);
    expect(findCallout(editor)?.attrs.variant).toBe('danger');

    const viewer = createEditor({
      editable: false,
      content: editor.getJSON(),
    });
    const callout = viewer.view.dom.querySelector<HTMLElement>('[data-kb-callout]');
    expect(callout?.getAttribute('role')).toBe('note');
    expect(callout?.getAttribute('data-kb-callout-variant')).toBe('danger');
    expect(callout?.querySelector('[data-kb-callout-content]')).not.toBeNull();
  });
});
