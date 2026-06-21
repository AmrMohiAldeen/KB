import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import {
  ACCORDION_NODE_NAME,
  createAccordionItemNode,
} from '../model';
import {
  activateContentBlock,
  appendItem,
  resolveNodeViewPosition,
} from '../../lib/transactions/contentBlockTransactions';
import {
  applyHTMLAttributes,
  createIconButton,
  observeEditorEditable,
} from '../shared/nodeViewDom';

export function createAccordionNodeView(props: NodeViewRendererProps): NodeView {
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

  const getContainerPosition = () => resolveNodeViewPosition(props.getPos);
  const activateContainer = (focus = false) => {
    const position = getContainerPosition();
    return (
      position != null &&
      activateContentBlock(props.view, position, ACCORDION_NODE_NAME, { focus })
    );
  };

  const addItem = () => {
    if (!props.editor.isEditable) return;

    const position = getContainerPosition();
    if (position == null) return;

    const accordion = props.view.state.doc.nodeAt(position);
    if (!accordion || accordion.type.name !== ACCORDION_NODE_NAME) return;

    const item = createAccordionItemNode(
      props.view.state.schema,
      `Section ${accordion.childCount + 1}`,
    );
    if (!item) return;

    if (
      activateContainer() &&
      appendItem(props.view, position, ACCORDION_NODE_NAME, item)
    ) {
      props.view.focus();
    }
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
      return updatedNode.type === props.node.type;
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
