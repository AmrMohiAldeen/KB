import { mergeAttributes, Node } from '@tiptap/core';
import {
  createTabsContent,
  normalizeItemLabel,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
} from '../model';
import { createTabItemNodeView } from '../nodeViews/TabItemNodeView';
import { createTabsNodeView } from '../nodeViews/TabsNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabs: {
      insertTabs: () => ReturnType;
    };
  }
}

export const TabItem = Node.create({
  name: TAB_ITEM_NODE_NAME,
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      itemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-kb-tab-id'),
        renderHTML: (attributes) => ({
          'data-kb-tab-id': attributes.itemId || null,
        }),
      },
      label: {
        default: 'Tab',
        parseHTML: (element) =>
          normalizeItemLabel(
            element.getAttribute('data-kb-tab-label') ??
              element.querySelector('[data-kb-tab-label-static]')?.textContent,
            'Tab',
          ),
        renderHTML: (attributes) => ({
          'data-kb-tab-label': normalizeItemLabel(attributes.label, 'Tab'),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'section[data-kb-tab-item]',
        contentElement: '[data-kb-tab-panel]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const label = normalizeItemLabel(node.attrs.label, 'Tab');

    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'aria-label': label,
        class: 'kb-tabs__static-item',
        'data-kb-tab-item': '',
      }),
      ['h3', { 'data-kb-tab-label-static': '' }, label],
      ['div', { 'data-kb-tab-panel': '' }, 0],
    ];
  },

  addNodeView() {
    return createTabItemNodeView;
  },
});

export const Tabs = Node.create({
  name: TABS_NODE_NAME,
  group: 'block',
  content: 'tabItem+',
  defining: true,
  isolating: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-kb-tabs]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-tabs',
        'data-kb-tabs': '',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertTabs:
        () =>
        ({ commands }) =>
          this.editor.isEditable && commands.insertContent(createTabsContent()),
    };
  },

  addNodeView() {
    return createTabsNodeView;
  },
});
