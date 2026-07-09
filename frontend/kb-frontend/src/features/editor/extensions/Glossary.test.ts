import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '.';
import { GLOSSARY_NODE_NAME } from './Glossary';

const editors: Editor[] = [];

function createEditor(content: JSONContent | string = '<p></p>', editable = true) {
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    element,
    editable,
    extensions: getEditorExtensions({
      featureFlags: {
        fileHandler: false,
      },
    }),
    content,
  });

  editors.push(editor);
  return editor;
}

function nodesByName(editor: Editor, name: string) {
  const nodes: Array<{ node: ProseMirrorNode; pos: number }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name) nodes.push({ node, pos });
  });

  return nodes;
}

function glossaryNodes(editor: Editor) {
  return nodesByName(editor, GLOSSARY_NODE_NAME);
}

function selectNode(editor: Editor, pos: number) {
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
  );
}

function glossaryContent(attrs = {}) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Read the ' },
          {
            type: GLOSSARY_NODE_NAME,
            attrs: {
              term: 'SOP',
              definition: 'Standard operating procedure',
              id: 'term_1',
              ...attrs,
            },
          },
          { type: 'text', text: ' first.' },
        ],
      },
    ],
  } satisfies JSONContent;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});

describe('Glossary extension', () => {
  it('inserts a glossary inline node with sanitized attrs', () => {
    const editor = createEditor('<p>Glossary: </p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    expect(
      editor.commands.setGlossary({
        term: '<strong>SOP</strong>',
        definition: '<img src=x> Standard operating procedure',
        id: 'bad id',
      }),
    ).toBe(true);

    const node = glossaryNodes(editor)[0].node;

    expect(node.inlineContent).toBe(false);
    expect(node.isInline).toBe(true);
    expect(node.attrs).toMatchObject({
      term: 'SOP',
      definition: 'Standard operating procedure',
      id: null,
    });
    expect(editor.getText()).toContain('SOP');
  });

  it('updates the selected glossary node without changing its id', () => {
    const editor = createEditor(glossaryContent());
    const match = glossaryNodes(editor)[0];
    selectNode(editor, match.pos);

    expect(
      editor.commands.updateGlossary({
        term: 'Runbook',
        definition: '<b>Documented recovery steps</b>',
      }),
    ).toBe(true);

    expect(glossaryNodes(editor)[0].node.attrs).toMatchObject({
      term: 'Runbook',
      definition: 'Documented recovery steps',
      id: 'term_1',
    });
  });

  it('unsets the selected glossary node back to plain text', () => {
    const editor = createEditor(glossaryContent());
    const match = glossaryNodes(editor)[0];
    selectNode(editor, match.pos);

    expect(editor.commands.unsetGlossary()).toBe(true);

    expect(glossaryNodes(editor)).toHaveLength(0);
    expect(editor.getText()).toContain('SOP');
  });

  it('persists glossary attrs through Tiptap JSON', () => {
    const editor = createEditor('<p></p>');

    editor.commands.setGlossary({
      term: 'KPI',
      definition: 'Key performance indicator',
      id: 'kpi',
    });

    const restored = createEditor(editor.getJSON());
    const node = glossaryNodes(restored)[0].node;

    expect(node.attrs).toMatchObject({
      term: 'KPI',
      definition: 'Key performance indicator',
      id: 'kpi',
    });
  });

  it('renders static HTML with safe glossary data and tooltip markup', () => {
    const editor = createEditor(glossaryContent());
    const container = document.createElement('div');
    container.innerHTML = editor.getHTML();

    const glossary = container.querySelector<HTMLElement>('[data-kb-glossary]');
    const tooltipId = glossary?.getAttribute('aria-describedby');
    const tooltip = tooltipId
      ? container.querySelector<HTMLElement>(`#${tooltipId}`)
      : null;

    expect(glossary?.tagName.toLowerCase()).toBe('span');
    expect(glossary?.classList.contains('kb-glossary')).toBe(true);
    expect(glossary?.getAttribute('data-kb-glossary-term')).toBe('SOP');
    expect(glossary?.getAttribute('data-kb-glossary-definition')).toBe(
      'Standard operating procedure',
    );
    expect(glossary?.getAttribute('tabindex')).toBe('0');
    expect(tooltip?.getAttribute('role')).toBe('tooltip');
    expect(tooltip?.textContent).toBe('Standard operating procedure');
  });

  it('generates export HTML with hover/focus markup without an editor instance', () => {
    const html = generateHTML(glossaryContent(), getEditorExtensions({
      featureFlags: {
        fileHandler: false,
      },
    }));
    const container = document.createElement('div');
    container.innerHTML = html;

    const glossary = container.querySelector<HTMLElement>('.kb-glossary');
    const tooltip = container.querySelector<HTMLElement>(
      '[data-kb-glossary-tooltip]',
    );

    expect(glossary?.getAttribute('aria-describedby')).toBe(tooltip?.id);
    expect(glossary?.getAttribute('data-kb-glossary-id')).toBe('term_1');
    expect(tooltip?.textContent).toBe('Standard operating procedure');
  });

  it('keeps read-only glossary content non-editable while preserving hover markup', () => {
    const editor = createEditor(glossaryContent(), false);
    const before = editor.getJSON();

    expect(
      editor.commands.updateGlossary({
        definition: 'Changed',
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    const glossary = editor.view.dom.querySelector<HTMLElement>(
      '[data-kb-glossary]',
    );
    const tooltip = editor.view.dom.querySelector<HTMLElement>(
      '[role="tooltip"]',
    );

    expect(glossary?.contentEditable).toBe('false');
    expect(glossary?.getAttribute('tabindex')).toBe('0');
    expect(glossary?.getAttribute('aria-describedby')).toBe(tooltip?.id);
    expect(tooltip?.textContent).toBe('Standard operating procedure');
  });

  it('rejects empty command attrs and renders invalid JSON attrs with safe fallback text', () => {
    const editor = createEditor('<p></p>');

    expect(
      editor.commands.setGlossary({
        term: '',
        definition: 'Has definition',
      }),
    ).toBe(false);
    expect(glossaryNodes(editor)).toHaveLength(0);

    const invalidEditor = createEditor(glossaryContent({
      term: '<script>alert(1)</script>',
      definition: '',
      id: '../bad',
    }));

    const html = invalidEditor.getHTML();
    expect(html).toContain('Glossary term');
    expect(html).toContain('No definition provided.');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('../bad');
  });

  it('opens on focus and closes with Escape in editor rendering', () => {
    const editor = createEditor(glossaryContent());
    const glossary = editor.view.dom.querySelector<HTMLElement>(
      '[data-kb-glossary]',
    );

    expect(glossary).not.toBeNull();

    glossary!.dispatchEvent(new FocusEvent('focus'));
    expect(glossary!.getAttribute('data-kb-glossary-open')).toBe('true');

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    glossary!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(glossary!.getAttribute('data-kb-glossary-open')).toBe('false');
  });
});
