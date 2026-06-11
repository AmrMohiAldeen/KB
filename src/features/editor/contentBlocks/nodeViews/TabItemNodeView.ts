import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import {
  MAX_ITEM_LABEL_LENGTH,
  normalizeItemLabel,
  TABS_NODE_NAME,
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
  createIconButton,
  observeEditorEditable,
} from './dom';

export function createTabItemNodeView(props: NodeViewRendererProps): NodeView {
  let currentNode = props.node;
  let expanded = true;
  const dom = document.createElement('section');
  const header = document.createElement('div');
  const titleArea = document.createElement('div');
  const itemControls = document.createElement('div');
  const contentDOM = document.createElement('div');

  applyHTMLAttributes(dom, props.HTMLAttributes);
  dom.dataset.kbTabItem = '';
  header.className = 'kb-tab-card__header';
  header.contentEditable = 'false';
  titleArea.className = 'kb-tab-card__title-area';
  itemControls.className = 'kb-tab-card__controls';
  contentDOM.dataset.kbTabPanel = '';

  const getItemPosition = () => resolveNodeViewPosition(props.getPos);

  const commitLabel = (value: string) => {
    const position = getItemPosition();
    if (position == null) return;

    updateNodeAttributes(props.view, position, {
      label: normalizeItemLabel(value, 'Tab'),
    });
  };

  const move = (direction: -1 | 1) => {
    const position = getItemPosition();
    if (position != null) moveItem(props.view, position, TABS_NODE_NAME, direction);
  };

  const remove = () => {
    const position = getItemPosition();
    if (position != null) removeItem(props.view, position, TABS_NODE_NAME);
  };

  const render = () => {
    dom.replaceChildren();
    header.replaceChildren();
    titleArea.replaceChildren();
    itemControls.replaceChildren();

    const label = normalizeItemLabel(currentNode.attrs.label, 'Tab');
    if (!props.editor.isEditable) {
      dom.className = 'kb-tabs__runtime-item';
      contentDOM.className = 'kb-tabs__runtime-panel';
      dom.append(contentDOM);
      return;
    }

    const position = getItemPosition();
    const context =
      position == null ? null : getItemContext(props.view, position, TABS_NODE_NAME);
    const input = document.createElement('textarea');
    const resizeInput = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    const toggle = createIconButton(
      expanded ? 'Collapse tab body' : 'Expand tab body',
      'chevronDown',
      () => {
        expanded = !expanded;
        dom.classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.ariaLabel = expanded ? 'Collapse tab body' : 'Expand tab body';
        toggle.title = toggle.ariaLabel;
      },
      { className: 'kb-content-block__circle-toggle kb-tab-card__toggle' },
    );

    dom.className = 'kb-tab-card';
    dom.classList.toggle('is-collapsed', !expanded);
    contentDOM.className = 'kb-tab-card__body';
    input.className = 'kb-tab-card__title-input';
    input.value = label;
    input.rows = 1;
    input.maxLength = MAX_ITEM_LABEL_LENGTH;
    input.title = label;
    input.ariaLabel = `Tab label: ${label}`;
    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener('input', resizeInput);
    input.addEventListener('change', () => commitLabel(input.value));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        input.value = label;
        input.blur();
      } else if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
      } else if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
      }
    });
    toggle.setAttribute('aria-expanded', String(expanded));
    titleArea.append(input);
    itemControls.append(
      createActionMenu(`Tab actions for ${label}`, [
        {
          label: 'Move tab up',
          icon: 'chevronUp',
          disabled: !context || context.index === 0,
          onActivate: () => move(-1),
        },
        {
          label: 'Move tab down',
          icon: 'chevronDown',
          disabled: !context || context.index === context.parent.childCount - 1,
          onActivate: () => move(1),
        },
        {
          label: 'Remove tab',
          icon: 'remove',
          danger: true,
          disabled: !context || context.parent.childCount === 1,
          onActivate: remove,
        },
      ]),
      toggle,
    );
    header.append(titleArea, itemControls);
    dom.append(header, contentDOM);
    queueMicrotask(resizeInput);
  };

  render();
  const stopObservingEditable = observeEditorEditable(
    props.view.dom as HTMLElement,
    render,
  );

  return {
    dom,
    contentDOM,
    update(updatedNode) {
      if (updatedNode.type !== currentNode.type) return false;

      currentNode = updatedNode;
      render();
      return true;
    },
    stopEvent(event) {
      return header.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return !contentDOM.contains(mutation.target);
    },
    destroy() {
      stopObservingEditable();
    },
  };
}
