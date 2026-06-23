// This file’s job is to inspect the current editor selection and return shared toolbar formatting values,
//  or null when the selection has mixed formatting.

import type { Editor } from '@tiptap/core';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import {
  readSharedTextDirection,
  type TextDirectionSelectionValue,
} from '../../extensions/TextDirection';
import { DEFAULT_FONT_SIZE } from './toolbarOptions';

type SharedString = string | null;
type TextBlockValue = 'paragraph' | `heading:${number}` | string;

type SharedValueReaderOptions = {
  markName: string;
  attributeName: string;
  defaultValue: string;
  normalize?: (value: unknown, defaultValue: string) => string;
};

export type ToolbarSelectionFormatting = {
  fontFamily: SharedString;
  fontSize: SharedString;
  textColor: SharedString;
  highlightColor: SharedString;
  lineHeight: SharedString;
  textBlock: TextBlockValue | null;
  textDirection: TextDirectionSelectionValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// returns null if mixed values, returns value if shared value
// looks at one mark at a time
function createSharedValueCollector<T>() {

  let hasValue = false;
  let isMixed = false;
  let sharedValue: T | undefined;

  return {
    add(value: T) {
      if (isMixed) return;

      if (!hasValue) {
        hasValue = true;
        sharedValue = value;
        return;
      }

      if (!Object.is(sharedValue, value)) {
        isMixed = true;
      }
    },
    getValue(fallback: () => T): T | null {
      if (isMixed) return null;
      return hasValue ? sharedValue! : fallback();
    },
  };
}

function normalizeStringAttribute(value: unknown, defaultValue: string) {
  if (value == null || value === '') return defaultValue;
  return String(value);
}

function normalizeFontSize(value: unknown, defaultValue: string) {
  const normalized = normalizeStringAttribute(value, defaultValue);
  return normalized === `${DEFAULT_FONT_SIZE}px` ? defaultValue : normalized;
}

function readMarkAttribute(
  marks: readonly Mark[],
  options: SharedValueReaderOptions,
) {
  const mark = marks.find((candidate) => candidate.type.name === options.markName);
  return normalizeAttribute(mark?.attrs[options.attributeName], options);
}

function normalizeAttribute(value: unknown, options: SharedValueReaderOptions) {
  return (options.normalize ?? normalizeStringAttribute)(value, options.defaultValue);
}

//cellDefaultMarksAttribute is a custome attribute implemented in '/table/extensions/TableCellFormatting.ts'
function readCellDefaultMarkAttribute(
  cell: ProseMirrorNode,
  options: SharedValueReaderOptions,
) {
  const defaultMarks = cell.attrs.defaultMarks;
  if (!isRecord(defaultMarks)) return normalizeAttribute(undefined, options);

  const markDefaults = defaultMarks[options.markName];
  if (!isRecord(markDefaults)) return normalizeAttribute(undefined, options);

  return normalizeAttribute(markDefaults[options.attributeName], options);
}

function getEmptyCellAtSelection(state: EditorState) {
   // $from is basically where your cursor is, you go up in the DOM until you reach the cell 
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const tableRole = node.type.spec.tableRole;

    if (tableRole === 'cell' || tableRole === 'header_cell') {
      return node.textContent.length === 0 ? node : null;
    }
  }

  return null;
}

function collectMarkValuesFromNode(
  node: ProseMirrorNode,
  options: SharedValueReaderOptions,
  addValue: (value: string) => void,
  getEmptyTextBlockValue: () => string,
) {
  node.descendants((descendant) => {
    if (descendant.isText) {
      addValue(readMarkAttribute(descendant.marks, options));
      return false;
    }

    if (descendant.isTextblock && descendant.textContent.length === 0) {
      addValue(getEmptyTextBlockValue());
      return false;
    }

    return true;
  });
}

export function readSharedMarkAttribute(
  state: EditorState,
  options: SharedValueReaderOptions,
): SharedString {
  const { selection } = state;

  if (selection.empty) {
    const emptyCell = getEmptyCellAtSelection(state);
    if (emptyCell) return readCellDefaultMarkAttribute(emptyCell, options);

    return readMarkAttribute(
      state.storedMarks ?? selection.$from.marks(),
      options,
    );
  }

  const collector = createSharedValueCollector<string>();

  if (selection instanceof CellSelection) {
    selection.forEachCell((cell) => {
      collectMarkValuesFromNode(
        cell,
        options,
        (value) => collector.add(value),
        () => readCellDefaultMarkAttribute(cell, options),
      );
    });

    return collector.getValue(() => normalizeAttribute(undefined, options));
  }

  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isText) {
      collector.add(readMarkAttribute(node.marks, options));
      return false;
    }

    if (node.isTextblock && node.textContent.length === 0) {
      collector.add(normalizeAttribute(undefined, options));
      return false;
    }

    return true;
  });

  return collector.getValue(() =>
    readMarkAttribute(state.storedMarks ?? selection.$from.marks(), options),
  );
}

function getTextBlockValue(node: ProseMirrorNode): TextBlockValue | null {
  if (!node.isTextblock) return null;
  if (node.type.name === 'heading') return `heading:${Number(node.attrs.level)}`;
  return node.type.name;
}

export function readSharedTextBlock(state: EditorState): TextBlockValue | null {
  const { selection } = state;

  if (selection.empty) {
    return getTextBlockValue(selection.$from.parent);
  }

  const collector = createSharedValueCollector<TextBlockValue>();

  const addTextBlock = (node: ProseMirrorNode) => {
    const value = getTextBlockValue(node);
    if (value) collector.add(value);
  };

  if (selection instanceof CellSelection) {
    selection.forEachCell((cell) => {
      cell.descendants((node) => {
        if (!node.isTextblock) return true;
        addTextBlock(node);
        return false;
      });
    });

    return collector.getValue(() => getTextBlockValue(selection.$from.parent) ?? selection.$from.parent.type.name,);
  }

  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isTextblock) return true;
    addTextBlock(node);
    return false;
  });

  return collector.getValue(() => getTextBlockValue(selection.$from.parent) ?? selection.$from.parent.type.name,);
}

export function getToolbarSelectionFormatting(
  editor: Pick<Editor, 'state'>,
): ToolbarSelectionFormatting {
  const state = editor.state;

  return {
    fontFamily: readSharedMarkAttribute(state, {
      markName: 'textStyle',
      attributeName: 'fontFamily',
      defaultValue: '',
    }),
    fontSize: readSharedMarkAttribute(state, {
      markName: 'textStyle',
      attributeName: 'fontSize',
      defaultValue: '',
      normalize: normalizeFontSize,
    }),
    textColor: readSharedMarkAttribute(state, {
      markName: 'textStyle',
      attributeName: 'color',
      defaultValue: '',
    }),
    highlightColor: readSharedMarkAttribute(state, {
      markName: 'highlight',
      attributeName: 'color',
      defaultValue: '',
    }),
    lineHeight: readSharedMarkAttribute(state, {
      markName: 'textStyle',
      attributeName: 'lineHeight',
      defaultValue: 'normal',
    }),
    textBlock: readSharedTextBlock(state),
    textDirection: readSharedTextDirection(state),
  };
}
