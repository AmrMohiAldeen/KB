import type { NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import {
  ACCORDION_ITEM_NODE_NAME,
  ACCORDION_NODE_NAME,
  createContentBlockItemId,
} from '../model';
import { resolveNodeViewPosition } from '../transactions';
import {
  applyHTMLAttributes,
  createIconButton,
  observeEditorEditable,
} from './dom';

function createAccordionItemNode(
  props: NodeViewRendererProps,
  title: string,
): ProseMirrorNode | null {
  const item = props.view.state.schema.nodes[ACCORDION_ITEM_NODE_NAME];
  const paragraph = props.view.state.schema.nodes.paragraph;
  if (!item || !paragraph) return null;

  return item.create(
    {
      itemId: createContentBlockItemId('accordion'),
      open: false,
      title,
    },
    paragraph.create(),
  );
}

export function createAccordionNodeView(props: NodeViewRendererProps): NodeView {
  let currentNode = props.node;
  const dom = document.createElement('div');
  const contentDOM = document.createElement('div');
  const footer = document.createElement('div');

  applyHTMLAttributes(dom, props.HTMLAttributes);
  dom.dataset.kbAccordion = '';
  dom.classList.add('kb-accordion');
  contentDOM.className = 'kb-accordion__items';
  footer.className = 'kb-accordion__footer';
  footer.contentEditable = 'false';
  dom.append(contentDOM);

  const addItem = () => {
    if (!props.editor.isEditable) return;

    const position = resolveNodeViewPosition(props.getPos);
    if (position == null) return;

    const accordion = props.view.state.doc.nodeAt(position);
    if (!accordion || accordion.type.name !== ACCORDION_NODE_NAME) return;

    const item = createAccordionItemNode(
      props,
      `Section ${accordion.childCount + 1}`,
    );
    if (!item) return;

    props.view.dispatch(
      props.view.state.tr.insert(position + accordion.nodeSize - 1, item),
    );
  };

  const renderFooter = () => {
    footer.remove();
    footer.replaceChildren();
    if (!props.editor.isEditable) return;

    footer.append(
      createIconButton('Add accordion item', 'add', addItem, {
        className: 'kb-accordion__add-button',
      }),
    );
    dom.append(footer);
  };

  renderFooter();
  const stopObservingEditable = observeEditorEditable(
    props.view.dom as HTMLElement,
    renderFooter,
  );

  return {
    dom,
    contentDOM,
    update(updatedNode) {
      if (updatedNode.type !== currentNode.type) return false;

      currentNode = updatedNode;
      renderFooter();
      return true;
    },
    stopEvent(event) {
      return footer.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return !contentDOM.contains(mutation.target);
    },
    destroy() {
      stopObservingEditable();
    },
  };
}
