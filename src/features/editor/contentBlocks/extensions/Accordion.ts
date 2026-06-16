import { mergeAttributes, Node } from '@tiptap/core';
import {
  createAccordionContent,
  normalizeItemLabel,
  ACCORDION_ITEM_NODE_NAME,
  ACCORDION_NODE_NAME,
} from '../model';
import { createAccordionItemNodeView } from '../nodeViews/AccordionItemNodeView';
import { createAccordionNodeView } from '../nodeViews/AccordionNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    accordion: {
      insertAccordion: () => ReturnType;
    };
  }
}

export const AccordionItem = Node.create({
  name: ACCORDION_ITEM_NODE_NAME,
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      itemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-kb-accordion-id'),
        renderHTML: (attributes) => ({
          'data-kb-accordion-id': attributes.itemId || null,
        }),
      },
      title: {
        default: 'Section',
        parseHTML: (element) =>
          normalizeItemLabel(
            element.getAttribute('data-kb-accordion-title') ??
              element.querySelector('summary')?.textContent,
            'Section',
          ),
        renderHTML: (attributes) => ({
          'data-kb-accordion-title': normalizeItemLabel(
            attributes.title,
            'Section',
          ),
        }),
      },
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => ({
          open: attributes.open ? '' : null,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-kb-accordion-item]',
        contentElement: '[data-kb-accordion-panel]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = normalizeItemLabel(node.attrs.title, 'Section');

    return [
      'details',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-accordion__item',
        'data-kb-accordion-item': '',
      }),
      [
        'summary',
        {
          class: 'kb-accordion__summary',
          'data-kb-accordion-title-static': '',
        },
        title,
      ],
      [
        'div',
        {
          class: 'kb-accordion__panel',
          'data-kb-accordion-panel': '',
        },
        0,
      ],
    ];
  },

  addNodeView() {
    return createAccordionItemNodeView;
  },
});

export const Accordion = Node.create({
  name: ACCORDION_NODE_NAME,
  group: 'block',
  content: 'accordionItem+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-kb-accordion]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-accordion',
        'data-kb-accordion': '',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertAccordion:
        () =>
        ({ commands }) =>
          this.editor.isEditable &&
          commands.insertContent(createAccordionContent()),
    };
  },

  addNodeView() {
    return createAccordionNodeView;
  },
});
