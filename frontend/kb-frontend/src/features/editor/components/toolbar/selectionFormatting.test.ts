import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../extensions';
import { getToolbarSelectionFormatting } from './selectionFormatting';

type TextStyleAttrs = {
  fontSize?: string;
  fontFamily?: string;
  color?: string;
};

const FONT_FAMILY = 'Georgia, serif';
const TEXT_COLOR = '#2563eb';
const HIGHLIGHT_COLOR = '#fef08a';

function createEditor(content: JSONContent) {
  const element = document.createElement('div');
  document.body.append(element);

  return new Editor({
    element,
    extensions: getEditorExtensions(),
    content,
  });
}

function styledText(text: string, attrs: TextStyleAttrs, highlight = HIGHLIGHT_COLOR) {
  return {
    type: 'text',
    text,
    marks: [
      { type: 'textStyle', attrs },
      { type: 'highlight', attrs: { color: highlight } },
    ],
  };
}

function textDocument(
  firstAttrs: TextStyleAttrs,
  secondAttrs: TextStyleAttrs,
  firstHighlight = HIGHLIGHT_COLOR,
  secondHighlight = HIGHLIGHT_COLOR,
): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          styledText('Alpha', firstAttrs, firstHighlight),
          styledText('Beta', secondAttrs, secondHighlight),
        ],
      },
    ],
  };
}

function tableDocument(cellFontSizes: Array<string | null>): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: cellFontSizes.map((fontSize) => ({
              type: 'tableCell',
              attrs: fontSize
                ? { defaultMarks: { textStyle: { fontSize } } }
                : undefined,
              content: [{ type: 'paragraph' }],
            })),
          },
        ],
      },
    ],
  };
}

function selectDocumentText(editor: Editor) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1),
    ),
  );
}

function selectTableCells(editor: Editor, anchorIndex: number, headIndex: number) {
  const table = editor.state.doc.firstChild;
  if (!table) throw new Error('Expected a table');

  const map = TableMap.get(table);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(
        editor.state.doc,
        1 + map.map[anchorIndex],
        1 + map.map[headIndex],
      ),
    ),
  );
}

describe('toolbar selection formatting', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('returns the shared formatting for a text selection with one value', () => {
    editor = createEditor(
      textDocument(
        { fontSize: '14px', fontFamily: FONT_FAMILY, color: TEXT_COLOR },
        { fontSize: '14px', fontFamily: FONT_FAMILY, color: TEXT_COLOR },
      ),
    );
    selectDocumentText(editor);

    expect(getToolbarSelectionFormatting(editor)).toMatchObject({
      fontSize: '14px',
      fontFamily: FONT_FAMILY,
      textColor: TEXT_COLOR,
      highlightColor: HIGHLIGHT_COLOR,
    });
  });

  it('returns null for mixed formatting in a text selection', () => {
    editor = createEditor(
      textDocument(
        { fontSize: '14px', fontFamily: FONT_FAMILY, color: TEXT_COLOR },
        {
          fontSize: '18px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#dc2626',
        },
        HIGHLIGHT_COLOR,
        '#fecaca',
      ),
    );
    selectDocumentText(editor);

    expect(getToolbarSelectionFormatting(editor)).toMatchObject({
      fontSize: null,
      fontFamily: null,
      textColor: null,
      highlightColor: null,
    });
  });

  it('returns the shared formatting for selected table cells with one value', () => {
    editor = createEditor(tableDocument(['14px', '14px']));
    selectTableCells(editor, 0, 1);

    expect(getToolbarSelectionFormatting(editor).fontSize).toBe('14px');
  });

  it('returns null for mixed formatting across selected table cells', () => {
    editor = createEditor(tableDocument(['14px', '18px']));
    selectTableCells(editor, 0, 1);

    expect(getToolbarSelectionFormatting(editor).fontSize).toBeNull();
  });

  it('does not report the default size when selected table cells mix default and explicit sizes', () => {
    editor = createEditor(tableDocument([null, '14px']));
    selectTableCells(editor, 0, 1);

    expect(getToolbarSelectionFormatting(editor).fontSize).toBeNull();
  });
});
