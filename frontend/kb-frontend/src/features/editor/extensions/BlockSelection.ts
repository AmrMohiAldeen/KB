import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  DRAGGABLE_CONTENT_BLOCK_NODE_NAMES,
} from '../blocks/model';
import { BLOCK_IMAGE_NODE_NAME } from '../blocks/image/imageTypes';

export const SELECTED_BLOCK_CLASS = 'kb-block-selection';

const SELECTABLE_BLOCK_NODE_NAMES = new Set<string>([
  'table',
  BLOCK_IMAGE_NODE_NAME,
  ...DRAGGABLE_CONTENT_BLOCK_NODE_NAMES, // this includes tabs, accordions & callouts
]);

export const BlockSelection = Extension.create({
  name: 'blockSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { from, to } = state.selection;

            // if selection is empty do nothing
            if (from === to) return null;

            const decorations: Decoration[] = [];
            state.doc.descendants((node, position) => {

              // if the selection covers a selectable block COMPLETELY
              // from <= position && to >= position + node.nodeSize
              if (
                SELECTABLE_BLOCK_NODE_NAMES.has(node.type.name) &&
                from <= position &&
                to >= position + node.nodeSize
              ) {

                // Decorations dont change the document content.
                // It only changes how the selected block is displayed in the editor.
                decorations.push(
                  Decoration.node(position, position + node.nodeSize, {
                    class: SELECTED_BLOCK_CLASS,
                  }),
                );
              }
            });

            return decorations.length > 0
              ? DecorationSet.create(state.doc, decorations)
              : null;
          },
        },
      }),
    ];
  },
});
