import { Extension, type CommandProps } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

export type CellDefaultMarks = Record<string, Record<string, unknown>>;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableCellFormatting: {
      setEmptyCellDefaultMark: (
        markName: string,
        attributes: Record<string, unknown> | null,
      ) => ReturnType;
      clearEmptyCellDefaultMarks: () => ReturnType;
    };
  }
}

function normalizeDefaultMarks(value: unknown): CellDefaultMarks | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const normalized: CellDefaultMarks = {};
  Object.entries(value).forEach(([name, attributes]) => {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return;
    }
    normalized[name] = { ...attributes as Record<string, unknown> };
  });
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export const cellDefaultMarksAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute('data-cell-default-marks');
    if (!value) return null;
    try {
      return normalizeDefaultMarks(JSON.parse(value));
    } catch {
      return null;
    }
  },
  renderHTML: (attributes: Record<string, unknown>) => {
    const marks = normalizeDefaultMarks(attributes.defaultMarks);
    return marks ? { 'data-cell-default-marks': JSON.stringify(marks) } : {};
  },
};

function updateDefaultMarks(
  props: Pick<CommandProps, 'tr'>,
  updater: (current: CellDefaultMarks) => CellDefaultMarks | null,
  includeNonEmpty = false,
): boolean {
  const { tr } = props;
  const { selection } = tr;
  let updated = false;

  const updateCell = (cell: typeof selection.$from.parent, pos: number) => {
    if (!includeNonEmpty && cell.textContent.length > 0) return;
    const current = normalizeDefaultMarks(cell.attrs.defaultMarks) ?? {};
    const next = updater(current);
    tr.setNodeMarkup(pos, undefined, {
      ...cell.attrs,
      defaultMarks: next,
    });
    updated = true;
  };

  if (selection instanceof CellSelection) {
    selection.forEachCell(updateCell);
    return updated;
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const cell = $from.node(depth);
    if (cell.type.spec.tableRole === 'cell' || cell.type.spec.tableRole === 'header_cell') {
      updateCell(cell, $from.before(depth));
      break;
    }
  }
  return updated;
}

function marksForEmptyCell(props: Pick<CommandProps, 'state'>): Mark[] | null {
  const { state } = props;
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const cell = $from.node(depth);
    if (cell.type.spec.tableRole !== 'cell' && cell.type.spec.tableRole !== 'header_cell') {
      continue;
    }
    if (cell.textContent.length > 0) return null;

    const defaults = normalizeDefaultMarks(cell.attrs.defaultMarks);
    if (!defaults) return null;
    return Object.entries(defaults).flatMap(([name, attributes]) => {
      const markType = state.schema.marks[name];
      return markType ? [markType.create(attributes)] : [];
    });
  }
  return null;
}

export const TableCellFormatting = Extension.create({
  name: 'tableCellFormatting',

  addCommands() {
    return {
      setEmptyCellDefaultMark:
        (markName, attributes) =>
        ({ tr }) => {
          updateDefaultMarks({ tr }, (current) => {
            const next = { ...current };
            if (attributes) {
              next[markName] = {
                ...(next[markName] ?? {}),
                ...attributes,
              };
              Object.keys(next[markName]).forEach((key) => {
                if (next[markName][key] == null) delete next[markName][key];
              });
              if (Object.keys(next[markName]).length === 0 && markName === 'textStyle') {
                delete next[markName];
              }
            } else {
              delete next[markName];
            }
            return Object.keys(next).length > 0 ? next : null;
          });
          return true;
        },
      clearEmptyCellDefaultMarks:
        () =>
        ({ tr }) => {
          updateDefaultMarks({ tr }, () => null, true);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.selectionSet)) return null;
          if (newState.selection instanceof CellSelection) return null;

          const marks = marksForEmptyCell({ state: newState });
          if (!marks) return null;
          if (
            newState.storedMarks?.length === marks.length &&
            marks.every((mark) => newState.storedMarks?.some((stored) => stored.eq(mark)))
          ) {
            return null;
          }
          return newState.tr.setStoredMarks(marks);
        },
      }),
    ];
  },
});
