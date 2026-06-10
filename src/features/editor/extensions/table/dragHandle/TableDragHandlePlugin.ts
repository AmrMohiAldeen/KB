import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findParentNodeClosestToPos } from 'prosemirror-utils';

export const tableDragHandlePluginKey = new PluginKey('tableDragHandle');

function getActiveTablePos(state: EditorState): number | null {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'table') {
    return state.selection.from;
  }

  const { $from } = state.selection;
  const table = findParentNodeClosestToPos($from, (node) => node.type.name === 'table');
  return table ? table.pos : null;
}

export function TableDragHandlePlugin() {
  return new Plugin({
    key: tableDragHandlePluginKey,
    props: {
      decorations(state) {
        const tablePos = getActiveTablePos(state);
        if (tablePos == null) return null;

        const decoration = Decoration.widget(
          tablePos,
          (view) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.className = 'table-drag-handle';
            element.setAttribute('aria-label', 'Drag table');
            element.setAttribute('title', 'Drag table');
            element.setAttribute('draggable', 'true');
            element.contentEditable = 'false';

            element.addEventListener('mousedown', (event) => {
              event.stopPropagation();

              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, tablePos)),
              );
              view.focus();
            });

            return element;
          },
          { side: -1 },
        );

        return DecorationSet.create(state.doc, [decoration]);
      },
    },
  });
}
