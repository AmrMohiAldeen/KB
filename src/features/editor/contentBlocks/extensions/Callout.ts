import { mergeAttributes, Node } from '@tiptap/core';
import {
  CALLOUT_NODE_NAME,
  createCalloutContent,
  getCalloutVariantLabel,
  normalizeCalloutVariant,
  type CalloutVariantInput,
} from '../callout/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (options?: { variant?: CalloutVariantInput }) => ReturnType;
      setCalloutVariant: (variant: CalloutVariantInput) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: CALLOUT_NODE_NAME,
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) =>
          normalizeCalloutVariant(element.getAttribute('data-kb-callout-variant')),
        renderHTML: (attributes) => ({
          'data-kb-callout-variant': normalizeCalloutVariant(attributes.variant),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: '[data-kb-callout]',
        contentElement: '[data-kb-callout-content]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const variant = normalizeCalloutVariant(node.attrs.variant);
    const label = getCalloutVariantLabel(variant);

    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        class: `kb-callout kb-callout--${variant}`,
        'data-kb-callout': '',
        role: 'note',
      }),
      [
        'div',
        {
          class: 'kb-callout__header',
          'data-kb-callout-header': '',
        },
        ['span', { 'aria-hidden': 'true', class: 'kb-callout__icon' }, ''],
        ['strong', {}, label],
      ],
      ['div', { class: 'kb-callout__content', 'data-kb-callout-content': '' }, 0],
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (options = {}) =>
        ({ commands }) =>
          this.editor.isEditable &&
          commands.insertContent(createCalloutContent(options.variant)),
      setCalloutVariant:
        (variant) =>
        ({ commands }) =>
          this.editor.isEditable &&
          commands.updateAttributes(CALLOUT_NODE_NAME, {
            variant: normalizeCalloutVariant(variant),
          }),
    };
  },
});
