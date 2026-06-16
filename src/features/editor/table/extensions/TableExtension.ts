import type { Attribute } from '@tiptap/core';
import { Table, TableView } from '@tiptap/extension-table';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  deleteCellSelection,
  selectedRect,
  selectionCell,
  splitCell as splitTableCell,
  TableMap,
} from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import { logDevError } from '../../utils/logDevError';
import {
  applyTableBorderAttributes,
  DEFAULT_TABLE_BORDER_ATTRIBUTES,
  normalizeTableBorderEnabled,
  type TableBorderAttributeName,
} from '../utils/tableBorders';
import {
  applyTableOffsetPct,
  applyTableWidthPct,
  DEFAULT_TABLE_OFFSET_PCT,
  DEFAULT_TABLE_WIDTH_PCT,
  normalizeTableOffsetPct,
  normalizeTableWidthPct,
} from '../resizing/tableDimensions';

function readPercentStyle(element: HTMLElement, property: 'width' | 'marginLeft'): string | null {
  const match = element.style[property].match(/^(\d+(?:\.\d+)?)%$/);
  return match?.[1] ?? null;
}

function createBorderAttribute(
  attributeName: TableBorderAttributeName,
  dataAttribute: string,
): Attribute {
  return {
    default: DEFAULT_TABLE_BORDER_ATTRIBUTES[attributeName],
    parseHTML: (element) =>
      normalizeTableBorderEnabled(element.getAttribute(`data-${dataAttribute}`)),
    renderHTML: (attributes) => ({
      [`data-${dataAttribute}`]: String(
        normalizeTableBorderEnabled(attributes[attributeName]),
      ),
    }),
  };
}

class KnowledgeBaseTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.applyStoredAttributes(node);
  }

  update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);
    if (updated) this.applyStoredAttributes(node);
    return updated;
  }

  private applyStoredAttributes(node: ProseMirrorNode): void {
    const width = applyTableWidthPct(
      this.table,
      normalizeTableWidthPct(node.attrs.tableWidthPct),
    );
    applyTableOffsetPct(
      this.table,
      normalizeTableOffsetPct(node.attrs.tableOffsetPct, width),
      width,
    );
    applyTableBorderAttributes(this.table, node.attrs);
  }
}

function splitCellContent(
  state: Parameters<typeof splitTableCell>[0],
  dispatch?: Parameters<typeof splitTableCell>[1],
): boolean {
  let rect: ReturnType<typeof selectedRect>;
  let cell: ProseMirrorNode | null | undefined;

  try {
    rect = selectedRect(state);
    cell = selectionCell(state).nodeAfter;
  } catch {
    return false;
  }

  if (!cell || (cell.attrs.colspan === 1 && cell.attrs.rowspan === 1)) {
    return false;
  }

  const targetCount = (rect.right - rect.left) * (rect.bottom - rect.top);
  const blocks = Array.from({ length: cell.childCount }, (_, index) => cell!.child(index));
  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  if (!paragraph) return splitTableCell(state, dispatch);

  const groups = Array.from({ length: targetCount }, (_, index) => {
    if (index === targetCount - 1) {
      return blocks.slice(index);
    }
    return blocks[index] ? [blocks[index]] : [];
  });

  return splitTableCell(state, (transaction) => {
    const table = transaction.doc.nodeAt(rect.tableStart - 1);
    if (!table) {
      dispatch?.(transaction);
      return;
    }

    const map = TableMap.get(table);
    const cells = Array.from(
      { length: rect.bottom - rect.top },
      (_, rowOffset) =>
        Array.from({ length: rect.right - rect.left }, (_, columnOffset) => {
          const row = rect.top + rowOffset;
          const column = rect.left + columnOffset;
          const pos = rect.tableStart + map.map[row * map.width + column];
          return { pos, group: groups[rowOffset * (rect.right - rect.left) + columnOffset] };
        }),
    )
      .flat()
      .sort((left, right) => right.pos - left.pos);

    cells.forEach(({ pos, group }) => {
      const currentCell = transaction.doc.nodeAt(pos);
      if (!currentCell) return;
      const content = Fragment.fromArray(group.length > 0 ? group : [paragraph]);
      transaction.replaceWith(pos + 1, pos + 1 + currentCell.content.size, content);
    });
    dispatch?.(transaction);
  });
}

export const KnowledgeBaseTable = Table.extend({
  name: 'table',
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidthPct: {
        default: DEFAULT_TABLE_WIDTH_PCT,
        parseHTML: (element) =>
          normalizeTableWidthPct(
            element.getAttribute('data-table-width-pct') ??
              readPercentStyle(element, 'width'),
          ),
        renderHTML: (attributes) => {
          const width = normalizeTableWidthPct(attributes.tableWidthPct);
          return {
            'data-table-width-pct': String(width),
            style: `--table-width-pct: ${width}%; width: ${width}%;`,
          };
        },
      },
      tableOffsetPct: {
        default: DEFAULT_TABLE_OFFSET_PCT,
        parseHTML: (element) => {
          const width = normalizeTableWidthPct(
            element.getAttribute('data-table-width-pct') ??
              readPercentStyle(element, 'width'),
          );
          return normalizeTableOffsetPct(
            element.getAttribute('data-table-offset-pct') ??
              readPercentStyle(element, 'marginLeft'),
            width,
          );
        },
        renderHTML: (attributes) => {
          const width = normalizeTableWidthPct(attributes.tableWidthPct);
          const offset = normalizeTableOffsetPct(attributes.tableOffsetPct, width);
          return {
            'data-table-offset-pct': String(offset),
            style: `--table-offset-pct: ${offset}%; margin-left: ${offset}%;`,
          };
        },
      },
      borderTopEnabled: createBorderAttribute('borderTopEnabled', 'table-border-top'),
      borderRightEnabled: createBorderAttribute(
        'borderRightEnabled',
        'table-border-right',
      ),
      borderBottomEnabled: createBorderAttribute(
        'borderBottomEnabled',
        'table-border-bottom',
      ),
      borderLeftEnabled: createBorderAttribute('borderLeftEnabled', 'table-border-left'),
      borderInnerEnabled: createBorderAttribute(
        'borderInnerEnabled',
        'table-border-inner',
      ),
    };
  },

  addKeyboardShortcuts() {
    const clearSelectedCells = () => {
      if (this.editor.isDestroyed || !this.editor.isEditable) return false;

      try {
        return deleteCellSelection(this.editor.state, (tr) => {
          this.editor.view.dispatch(tr);
        });
      } catch (error) {
        logDevError('Table clear-selection command failed:', error);
        return false;
      }
    };

    return {
      ...this.parent?.(),
      Backspace: clearSelectedCells,
      'Mod-Backspace': clearSelectedCells,
      Delete: clearSelectedCells,
      'Mod-Delete': clearSelectedCells,
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      splitCell:
        () =>
        ({ state, dispatch }) =>
          splitCellContent(state, dispatch),
    };
  },
}).configure({
  View: KnowledgeBaseTableView,
});
