import { Table, TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import {
  applyTableWidthPct,
  DEFAULT_TABLE_WIDTH_PCT,
  normalizeTableWidthPct,
} from './TableDimensions';

export class PercentageTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.applyStoredWidth(node);
  }

  update(node: ProseMirrorNode) {
    const updated = super.update(node);

    if (updated) {
      this.applyStoredWidth(node);
    }

    return updated;
  }

  private applyStoredWidth(node: ProseMirrorNode) {
    applyTableWidthPct(this.table, normalizeTableWidthPct(node.attrs.tableWidthPct));
  }
}

export const TableWidthPct = Table.extend({
  name: 'table',
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidthPct: {
        default: DEFAULT_TABLE_WIDTH_PCT,
        parseHTML: (element) => {
          const dataWidth = element.getAttribute('data-table-width-pct');
          if (dataWidth) return normalizeTableWidthPct(dataWidth);

          const match = (element as HTMLElement).style.width.match(/^(\d+(?:\.\d+)?)%$/);
          return match ? normalizeTableWidthPct(match[1]) : DEFAULT_TABLE_WIDTH_PCT;
        },
        renderHTML: (attrs) => {
          const width = normalizeTableWidthPct(attrs.tableWidthPct);

          return {
            'data-table-width-pct': String(width),
            style: `--table-width-pct: ${width}%; width: ${width}%;`,
          };
        },
      },
    };
  },
}).configure({
  View: PercentageTableView,
});
