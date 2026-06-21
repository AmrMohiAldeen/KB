import {
  Extension,
  mergeAttributes,
  type Editor,
} from '@tiptap/core';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

export const ORDERED_LIST_STYLES = [
  'decimal',
  'lower-alpha',
  'upper-alpha',
  'lower-roman',
  'upper-roman',
] as const;

export const BULLET_LIST_STYLES = ['disc', 'circle', 'square'] as const;

export type OrderedListStyle = (typeof ORDERED_LIST_STYLES)[number];
export type BulletListStyle = (typeof BULLET_LIST_STYLES)[number];
export type ListStyle = OrderedListStyle | BulletListStyle;
export type ListTypeName = 'orderedList' | 'bulletList';

type ListMatch = {
  node: ProseMirrorNode;
  pos: number;
  depth: number;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyle: {
      setListStyle: (type: ListTypeName, style: ListStyle) => ReturnType;
      applyNestedListStyle: (type: ListTypeName) => ReturnType;
    };
  }
}

function stylesForType(type: ListTypeName): readonly ListStyle[] {
  return type === 'orderedList' ? ORDERED_LIST_STYLES : BULLET_LIST_STYLES;
}

function isListStyleForType(type: ListTypeName, value: unknown): value is ListStyle {
  return stylesForType(type).some((style) => style === value);
}

function defaultListStyle(type: ListTypeName): ListStyle {
  return type === 'orderedList' ? 'decimal' : 'disc';
}

function normalizeListStyle(type: ListTypeName, value: unknown): ListStyle {
  return isListStyleForType(type, value) ? value : defaultListStyle(type);
}

function nextListStyle(type: ListTypeName, currentStyle: unknown): ListStyle {
  const styles = stylesForType(type);
  const normalized = normalizeListStyle(type, currentStyle);
  const index = styles.findIndex((style) => style === normalized);

  return styles[(index + 1) % styles.length];
}

function findContainingList(transaction: Transaction, type: ListTypeName): ListMatch | null {
  // `$from` is the resolved start position of the current selection/cursor.
  // It allows us to walk upward through the document tree and find the
  // nearest list node that contains the current selection.
  const { $from } = transaction.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === type) {
      return {
        node,
        pos: $from.before(depth),
        depth,
      };
    }
  }

  return null;
}

function findParentListAbove(
  transaction: Transaction,
  type: ListTypeName,
  childDepth: number,
): ListMatch | null {
  const { $from } = transaction.selection;

  for (let depth = childDepth - 1; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === type) {
      return {
        node,
        pos: $from.before(depth),
        depth,
      };
    }
  }

  return null;
}

function findSelectedList(transaction: Transaction, type: ListTypeName): ListMatch | null {
  const containingList = findContainingList(transaction, type);
  if (containingList) return containingList;

  let match: ListMatch | null = null;

  transaction.doc.nodesBetween(
    transaction.selection.from,
    transaction.selection.to,
    (node, pos) => {
      if (!match && node.type.name === type) {
        match = {
          node,
          pos,
          depth: -1,
        };

        return false;
      }

      return !match;
    },
  );

  return match;
}

function readOrderedListType(element: HTMLElement): OrderedListStyle | null {
  const type = element.getAttribute('type');

  const map: Record<string, OrderedListStyle> = {
    '1': 'decimal',
    a: 'lower-alpha',
    A: 'upper-alpha',
    i: 'lower-roman',
    I: 'upper-roman',
  };

  return type ? map[type] ?? null : null;
}

function listStyleAttribute(type: ListTypeName) {
  return {
    default: defaultListStyle(type),

    // Supports saved editor HTML, pasted CSS, and native <ol type="a"> HTML.
    parseHTML: (element: HTMLElement) =>
      normalizeListStyle(
        type,
        element.getAttribute('data-list-style') ||
          element.style.listStyleType ||
          (type === 'orderedList' ? readOrderedListType(element) : null),
      ),

    renderHTML: (attributes: Record<string, unknown>) => {
      const style = normalizeListStyle(type, attributes.listStyle);

      return {
        'data-list-style': style,
        style: `list-style-type: ${style};`,
      };
    },
  };
}

export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: listStyleAttribute('orderedList'),
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { start, ...attributesWithoutStart } = HTMLAttributes;

    // start="1" is the browser default, so only preserve meaningful start offsets.
    return start === 1
      ? ['ol', mergeAttributes(this.options.HTMLAttributes, attributesWithoutStart), 0]
      : ['ol', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

export const StyledBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: listStyleAttribute('bulletList'),
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

function getClosestListType(editor: Editor): ListTypeName | null {
  const orderedList = findContainingList(editor.state.tr, 'orderedList');
  const bulletList = findContainingList(editor.state.tr, 'bulletList');

  if (!orderedList && !bulletList) return null;
  if (!orderedList) return 'bulletList';
  if (!bulletList) return 'orderedList';

  return orderedList.depth > bulletList.depth ? 'orderedList' : 'bulletList';
}

function indentNestedList(editor: Editor): boolean {
  const type = getClosestListType(editor);
  if (!type) return false;

  editor
    .chain()
    .sinkListItem('listItem')
    .applyNestedListStyle(type)
    .run();

  return true;
}

function outdentNestedList(editor: Editor): boolean {
  const type = getClosestListType(editor);
  if (!type) return false;

  editor.chain().liftListItem('listItem').run();

  return true;
}

export const ListStyleCommands = Extension.create({
  name: 'listStyleCommands',

  addCommands() {
    return {
      applyNestedListStyle:
        (type) =>
        ({ tr, dispatch }) => {
          const currentList = findContainingList(tr, type);
          if (!currentList) return false;

          const parentList = findParentListAbove(tr, type, currentList.depth);
          if (!parentList) return false;

          const expectedStyle = nextListStyle(type, parentList.node.attrs.listStyle);

          if (currentList.node.attrs.listStyle === expectedStyle) {
            return true;
          }

          if (dispatch) {
            tr.setNodeMarkup(currentList.pos, undefined, {
              ...currentList.node.attrs,
              listStyle: expectedStyle,
            });
          }

          return true;
        },

      setListStyle:
        (type, style) =>
        ({ tr, dispatch }) => {
          if (!isListStyleForType(type, style)) return false;

          const list = findSelectedList(tr, type);
          if (!list) return false;

          if (list.node.attrs.listStyle === style) {
            return true;
          }

          if (dispatch) {
            tr.setNodeMarkup(list.pos, undefined, {
              ...list.node.attrs,
              listStyle: style,
            });
          }

          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => indentNestedList(this.editor),
      'Mod-]': () => indentNestedList(this.editor),
      'Shift-Tab': () => outdentNestedList(this.editor),
      'Mod-[': () => outdentNestedList(this.editor),
    };
  },
});

export function getListStyleLabel(style: ListStyle): string {
  return {
    decimal: 'Decimal',
    'lower-alpha': 'Lower alpha',
    'upper-alpha': 'Upper alpha',
    'lower-roman': 'Lower roman',
    'upper-roman': 'Upper roman',
    disc: 'Disc',
    circle: 'Circle',
    square: 'Square',
  }[style];
}