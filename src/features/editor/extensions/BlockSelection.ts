import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  DRAGGABLE_CONTENT_BLOCK_NODE_NAMES,
} from '../contentBlocks/model';
import { BLOCK_IMAGE_NODE_NAME } from '../images/imageTypes';

export const SELECTED_BLOCK_CLASS = 'kb-block-selection';

const SELECTABLE_BLOCK_NODE_NAMES = new Set<string>([
  'table',
  BLOCK_IMAGE_NODE_NAME,
  ...DRAGGABLE_CONTENT_BLOCK_NODE_NAMES,
]);

export const BlockSelection = Extension.create({
  name: 'blockSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            if (from === to) return null;

            const decorations: Decoration[] = [];
            state.doc.descendants((node, position) => {
              if (
                SELECTABLE_BLOCK_NODE_NAMES.has(node.type.name) &&
                from <= position &&
                to >= position + node.nodeSize
              ) {
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
