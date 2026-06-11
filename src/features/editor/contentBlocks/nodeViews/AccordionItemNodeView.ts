import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import {
  ACCORDION_NODE_NAME,
  MAX_ITEM_LABEL_LENGTH,
  normalizeItemLabel,
} from '../model';
import {
  getItemContext,
  moveItem,
  removeItem,
  resolveNodeViewPosition,
  updateNodeAttributes,
} from '../transactions';
import {
  applyHTMLAttributes,
  createActionMenu,
  createIcon,
  observeEditorEditable,
} from './dom';

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

  const commitTitle = (value: string) => {
    const position = getItemPosition();
    if (position == null) return;

    updateNodeAttributes(props.view, position, {
      title: normalizeItemLabel(value, 'Section'),
    });
  };

  const move = (direction: -1 | 1) => {
    const position = getItemPosition();
    if (position != null) {
      moveItem(props.view, position, ACCORDION_NODE_NAME, direction);
    }
  };

  const remove = () => {
    const position = getItemPosition();
    if (position != null) {
      removeItem(props.view, position, ACCORDION_NODE_NAME);
    }
  };

  const renderHeader = () => {
    titleArea.replaceChildren();
    itemControls.replaceChildren();

    const position = getItemPosition();
    const context =
      position == null
        ? null
        : getItemContext(props.view, position, ACCORDION_NODE_NAME);
    const title = normalizeItemLabel(currentNode.attrs.title, 'Section');

    if (!props.editor.isEditable) {
      titleArea.textContent = title;
      titleArea.title = title;
      return;
    }

    const input = document.createElement('textarea');
    const resizeInput = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };

    input.className = 'kb-accordion__title-input';
    input.value = title;
    input.rows = 1;
    input.maxLength = MAX_ITEM_LABEL_LENGTH;
    input.title = title;
    input.ariaLabel = `Accordion title: ${title}`;
    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener('input', resizeInput);
    input.addEventListener('change', () => commitTitle(input.value));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        input.value = title;
        input.blur();
      }
    });
    titleArea.append(input);
    queueMicrotask(resizeInput);

    itemControls.append(
      createActionMenu(`Accordion actions for ${title}`, [
        {
          label: 'Move accordion item up',
          icon: 'chevronUp',
          disabled: !context || context.index === 0,
          onActivate: () => move(-1),
        },
        {
          label: 'Move accordion item down',
          icon: 'chevronDown',
          disabled: !context || context.index === context.parent.childCount - 1,
          onActivate: () => move(1),
        },
        {
          label: 'Remove accordion item',
          icon: 'remove',
          danger: true,
          disabled: !context || context.parent.childCount === 1,
          onActivate: remove,
        },
      ]),
    );
  };

  dom.open = Boolean(currentNode.attrs.open);
  dom.addEventListener('toggle', () => {
    if (!props.editor.isEditable || dom.open === Boolean(currentNode.attrs.open)) {
      return;
    }

    const position = getItemPosition();
    if (position != null) updateNodeAttributes(props.view, position, { open: dom.open });
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

      currentNode = updatedNode;
      dom.open = Boolean(currentNode.attrs.open);
      renderHeader();
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
