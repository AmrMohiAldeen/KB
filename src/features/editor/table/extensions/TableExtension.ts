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
  // Supports imported/legacy HTML where table dimensions were stored as inline styles
  // instead of data-* attributes.
  const match = element.style[property].match(/^(\d+(?:\.\d+)?)%$/);
  return match?.[1] ?? null;
}

// create border attribute so that we can control unique border settings
// borderTopEnabled: createBorderAttribute('borderTopEnabled', 'table-border-top')
// borderRightEnabled
// borderBottomEnabled
// borderLeftEnabled
// borderInnerEnabled
function createBorderAttribute(
  attributeName: TableBorderAttributeName,
  dataAttribute: string,
): Attribute {
  // Keeps all table border attributes parsed/rendered in the same normalized format.
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

// Extend table view to show the stored custome attributes we created in the DOM 
class KnowledgeBaseTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);

    // TableView owns the actual table DOM node, so persisted attributes need to be
    // applied directly after the view is created.
    this.applyStoredAttributes(node);
  }

  update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);

    // Re-apply stored visual attributes whenever ProseMirror updates the table node.
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
    // These helpers only work when the current selection is inside a table cell.
    rect = selectedRect(state);
    cell = selectionCell(state).nodeAfter;
  } catch (error) {
    logDevError('Failed to read selected table cell:', error);
    return false;
  }

  // Nothing to split if the selected cell is already a normal 1x1 cell.
  if (!cell || (cell.attrs.colspan === 1 && cell.attrs.rowspan === 1)) {
    return false;
  }

  // Number of cells that will exist after the merged cell is split.
  const targetCount = (rect.right - rect.left) * (rect.bottom - rect.top);

  // separates text blocks into a js array
  const blocks = Array.from({ length: cell.childCount }, (_, index) => cell!.child(index));
  
  // Table cells cannot be completely empty in ProseMirror
  // so we create an empty paragraph node
  const paragraph = state.schema.nodes.paragraph?.createAndFill();

  // Fall back to Tiptap/ProseMirror's default split behavior if we cannot create
  // a valid empty paragraph for newly created empty cells.
  if (!paragraph) return splitTableCell(state, dispatch);

  // Distribute the original merged-cell blocks across the new split cells.
  // The last cell receives any remaining blocks so content is not lost.
  const groups = Array.from({ length: targetCount }, (_, index) => {
    if (index === targetCount - 1) {
      return blocks.slice(index);
    }

    return blocks[index] ? [blocks[index]] : [];
  });

  return splitTableCell(state, (transaction) => {
    // Re-read the table from the transaction because splitCell already changed the doc.
    const table = transaction.doc.nodeAt(rect.tableStart - 1);

    // dispatch is the function that commits the transaction
    // so the editor document really changes
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

          return {
            pos,
            group: groups[rowOffset * (rect.right - rect.left) + columnOffset],
          };
        }),
    )
      .flat()
      // Replace cells from right-to-left/bottom-to-top so earlier replacements do not
      // shift the positions of cells we have not processed yet.
      .sort((left, right) => right.pos - left.pos);

    cells.forEach(({ pos, group }) => {
      const currentCell = transaction.doc.nodeAt(pos);
      if (!currentCell) return;

      // Use the real content if available, otherwise use a blank paragraph
      const content = Fragment.fromArray(group.length > 0 ? group : [paragraph]);

      // pos is the position of the cell node
      // pos + 1 is the start of the content inside the cell
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
      // Do not run destructive table commands when the editor is unavailable or read-only.
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

      // Make delete/backspace clear selected table cells instead of breaking the table structure.
      Backspace: clearSelectedCells,
      'Mod-Backspace': clearSelectedCells,
      Delete: clearSelectedCells,
      'Mod-Delete': clearSelectedCells,
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      // Override the default splitCell so content from a merged cell is preserved
      // and distributed across the newly created cells.
      splitCell:
        () =>
        ({ state, dispatch }) =>
          splitCellContent(state, dispatch),
    };
  },
}).configure({
  View: KnowledgeBaseTableView,
});