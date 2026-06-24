import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from '@tiptap/pm/view';

export const PRESERVED_SELECTION_CLASS = 'kb-preserved-selection';

type ReadOnlySelectionRange = {
  from: number;
  to: number;
};

type ReadOnlySelectionHighlightOptions = {
  className: string;
};

type SelectionRoot = Document | (ShadowRoot & {
  getSelection?: () => globalThis.Selection | null;
});

const readOnlySelectionPluginKey =
  new PluginKey<ReadOnlySelectionRange | null>('readOnlySelectionHighlight');

function isSameRange(
  first: ReadOnlySelectionRange | null,
  second: ReadOnlySelectionRange | null,
): boolean {
  return first?.from === second?.from && first?.to === second?.to;
}

function clampPosition(view: EditorView, position: number): number {
  return Math.min(Math.max(position, 0), view.state.doc.content.size);
}

function isInsideEditor(view: EditorView, node: Node | null): node is Node {
  return Boolean(node && (node === view.dom || view.dom.contains(node)));
}

function getSelection(view: EditorView): globalThis.Selection | null {
  const root = view.root as SelectionRoot;
  return root.getSelection?.() ?? view.dom.ownerDocument.getSelection();
}

function posAtDOM(
  view: EditorView,
  node: Node,
  offset: number,
): number | null {
  try {
    return clampPosition(view, view.posAtDOM(node, offset));
  } catch {
    return null;
  }
}

function readDOMSelectionRange(
  view: EditorView,
): ReadOnlySelectionRange | null {
  if (view.editable) return null;

  const selection = getSelection(view);
  if (
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !isInsideEditor(view, selection.anchorNode) ||
    !isInsideEditor(view, selection.focusNode)
  ) {
    return null;
  }

  const anchor = posAtDOM(view, selection.anchorNode, selection.anchorOffset);
  const head = posAtDOM(view, selection.focusNode, selection.focusOffset);
  if (anchor == null || head == null || anchor === head) return null;

  return {
    from: Math.min(anchor, head),
    to: Math.max(anchor, head),
  };
}

function updateReadOnlySelection(
  view: EditorView,
  range: ReadOnlySelectionRange | null,
): void {
  const currentRange = readOnlySelectionPluginKey.getState(view.state) ?? null;
  if (isSameRange(currentRange, range)) return;

  view.dispatch(
    view.state.tr
      .setMeta(readOnlySelectionPluginKey, range)
      .setMeta('addToHistory', false),
  );
}

function syncReadOnlySelection(view: EditorView): void {
  updateReadOnlySelection(view, readDOMSelectionRange(view));
}

export const ReadOnlySelectionHighlight =
  Extension.create<ReadOnlySelectionHighlightOptions>({
    name: 'readOnlySelectionHighlight',

    addOptions() {
      return {
        className: PRESERVED_SELECTION_CLASS,
      };
    },

    addProseMirrorPlugins() {
      const { editor, options } = this;

      return [
        new Plugin<ReadOnlySelectionRange | null>({
          key: readOnlySelectionPluginKey,
          state: {
            init: () => null,
            apply(transaction, previousRange) {
              const nextRange = transaction.getMeta(readOnlySelectionPluginKey) as
                | ReadOnlySelectionRange
                | null
                | undefined;

              if (nextRange !== undefined) return nextRange;
              if (!previousRange || !transaction.docChanged) return previousRange;

              const from = transaction.mapping.map(previousRange.from, -1);
              const to = transaction.mapping.map(previousRange.to, 1);
              if (from === to) return null;

              return {
                from: Math.min(from, to),
                to: Math.max(from, to),
              };
            },
          },
          props: {
            decorations(state) {
              const range = readOnlySelectionPluginKey.getState(state);
              if (!range || editor.isEditable) return null;

              const from = Math.max(0, Math.min(range.from, state.doc.content.size));
              const to = Math.max(0, Math.min(range.to, state.doc.content.size));
              if (from >= to) return null;

              return DecorationSet.create(state.doc, [
                Decoration.inline(from, to, {
                  class: options.className,
                }),
              ]);
            },
          },
          view(view) {
            let animationFrame: number | null = null;
            let destroyed = false;
            const ownerDocument = view.dom.ownerDocument;

            const cancelSync = () => {
              if (animationFrame == null) return;
              view.dom.ownerDocument.defaultView?.cancelAnimationFrame(
                animationFrame,
              );
              animationFrame = null;
            };

            const scheduleSync = () => {
              if (destroyed || animationFrame != null) return;

              animationFrame =
                view.dom.ownerDocument.defaultView?.requestAnimationFrame(() => {
                  animationFrame = null;
                  if (!destroyed) syncReadOnlySelection(view);
                }) ?? null;

              if (animationFrame == null) syncReadOnlySelection(view);
            };

            ownerDocument.addEventListener('selectionchange', scheduleSync);
            ownerDocument.addEventListener('keyup', scheduleSync);
            ownerDocument.addEventListener('mouseup', scheduleSync);

            return {
              update: (updatedView) => {
                if (updatedView.editable) {
                  cancelSync();
                  updateReadOnlySelection(updatedView, null);
                  return;
                }

                scheduleSync();
              },
              destroy: () => {
                destroyed = true;
                cancelSync();
                ownerDocument.removeEventListener(
                  'selectionchange',
                  scheduleSync,
                );
                ownerDocument.removeEventListener('keyup', scheduleSync);
                ownerDocument.removeEventListener('mouseup', scheduleSync);
              },
            };
          },
        }),
      ];
    },
  });
