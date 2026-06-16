import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import {
  ACCORDION_NODE_NAME,
  ACCORDION_ITEM_NODE_NAME,
  normalizeItemLabel,
} from '../model';
import {
  resolveNodeViewPosition,
  updateNodeAttributes,
} from '../transactions';
import {
  applyHTMLAttributes,
  createIcon,
  observeEditorEditable,
} from './dom';
import { createItemActions, createItemLabelInput } from './itemUi';

export function createAccordionItemNodeView(
  props: NodeViewRendererProps,
): NodeView {
  let currentNode = props.node;
  const dom = document.createElement('details');
  const summary = document.createElement('summary');
  const titleArea = document.createElement('span');
  const itemControls = document.createElement('span');
  const chevron = document.createElement('span');
  const contentDOM = document.createElement('div');

  applyHTMLAttributes(dom, props.HTMLAttributes);
  dom.dataset.kbAccordionItem = '';
  dom.classList.add('kb-accordion__item');
  summary.className = 'kb-accordion__summary';
  summary.contentEditable = 'false';
  titleArea.className = 'kb-accordion__title-area';
  itemControls.className = 'kb-accordion__item-controls';
  chevron.className = 'kb-accordion__chevron';
  chevron.ariaHidden = 'true';
  chevron.append(createIcon('chevronDown'));
  contentDOM.className = 'kb-accordion__panel';
  summary.append(titleArea, itemControls, chevron);
  dom.append(summary, contentDOM);

  const getItemPosition = () => resolveNodeViewPosition(props.getPos);
  const itemActions = createItemActions(
    props.view,
    props.getPos,
    ACCORDION_NODE_NAME,
  );

  const commitTitle = (value: string) => {
    const position = getItemPosition();
    if (position == null) return;

    updateNodeAttributes(
      props.view,
      position,
      ACCORDION_ITEM_NODE_NAME,
      {
        title: normalizeItemLabel(value, 'Section'),
      },
    );
  };

  const renderHeader = () => {
    titleArea.replaceChildren();
    titleArea.removeAttribute('title');
    itemControls.replaceChildren();

    const title = normalizeItemLabel(currentNode.attrs.title, 'Section');
    dom.dataset.kbAccordionTitle = title;

    if (!props.editor.isEditable) {
      titleArea.textContent = title;
      titleArea.title = title;
      return;
    }

    const input = createItemLabelInput({
      ariaLabel: `Accordion title: ${title}`,
      className: 'kb-accordion__title-input',
      onCommit: commitTitle,
      onExit: () => itemActions.activate(true),
      onHistoryAction: itemActions.runHistoryAction,
      onInteract: () => itemActions.activate(),
      onMove: itemActions.move,
      value: title,
    });
    titleArea.append(input);

    itemControls.append(
      itemActions.createMenu({
        menu: `Accordion actions for ${title}`,
        moveDown: 'Move accordion item down',
        moveUp: 'Move accordion item up',
        remove: 'Remove accordion item',
      }),
    );
  };

  dom.open = Boolean(currentNode.attrs.open);
  summary.addEventListener('focus', () => itemActions.activate());
  summary.addEventListener('mousedown', () => itemActions.activate());
  dom.addEventListener('toggle', () => {
    if (!props.editor.isEditable || dom.open === Boolean(currentNode.attrs.open)) {
      return;
    }

    const position = getItemPosition();
    if (position != null) {
      itemActions.activate();
      updateNodeAttributes(props.view, position, ACCORDION_ITEM_NODE_NAME, {
        open: dom.open,
      }, {
        addToHistory: false,
      });
    }
  });
  renderHeader();
  const stopObservingEditable = observeEditorEditable(
    props.view.dom as HTMLElement,
    renderHeader,
  );

  return {
    dom,
    contentDOM,
    update(updatedNode) {
      if (updatedNode.type !== currentNode.type) return false;

      const titleChanged = updatedNode.attrs.title !== currentNode.attrs.title;
      currentNode = updatedNode;
      dom.open = Boolean(currentNode.attrs.open);
      dom.dataset.kbAccordionTitle = normalizeItemLabel(
        currentNode.attrs.title,
        'Section',
      );
      if (titleChanged) renderHeader();
      return true;
    },
    stopEvent(event) {
      return summary.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return !contentDOM.contains(mutation.target);
    },
    destroy() {
      stopObservingEditable();
    },
  };
}
