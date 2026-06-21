import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import {
  normalizeItemLabel,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
} from '../model';
import {
  resolveNodeViewPosition,
  updateNodeAttributes,
} from '../../lib/transactions/contentBlockTransactions';
import {
  applyHTMLAttributes,
  createIconButton,
  observeEditorEditable,
} from '../shared/nodeViewDom';
import { createItemActions, createItemLabelInput } from '../shared/itemUi';

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
  const itemActions = createItemActions(
    props.view,
    props.getPos,
    TABS_NODE_NAME,
  );

  const commitLabel = (value: string) => {
    const position = getItemPosition();
    if (position == null) return;

    updateNodeAttributes(
      props.view,
      position,
      TAB_ITEM_NODE_NAME,
      {
        label: normalizeItemLabel(value, 'Tab'),
      },
    );
  };

  const render = () => {
    dom.replaceChildren();
    header.replaceChildren();
    titleArea.replaceChildren();
    itemControls.replaceChildren();

    const label = normalizeItemLabel(currentNode.attrs.label, 'Tab');
    dom.dataset.kbTabLabel = label;
    if (!props.editor.isEditable) {
      dom.className = 'kb-tabs__runtime-item';
      contentDOM.className = 'kb-tabs__runtime-panel';
      dom.append(contentDOM);
      return;
    }

    const input = createItemLabelInput({
      ariaLabel: `Tab label: ${label}`,
      className: 'kb-tab-card__title-input',
      onCommit: commitLabel,
      onExit: () => itemActions.activate(true),
      onHistoryAction: itemActions.runHistoryAction,
      onInteract: () => itemActions.activate(),
      onMove: itemActions.move,
      value: label,
    });
    const toggle = createIconButton(
      expanded ? 'Collapse tab body' : 'Expand tab body',
      'chevronDown',
      () => {
        itemActions.activate(true);
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
    toggle.setAttribute('aria-expanded', String(expanded));
    titleArea.append(input);
    itemControls.append(
      itemActions.createMenu({
        menu: `Tab actions for ${label}`,
        moveDown: 'Move tab down',
        moveUp: 'Move tab up',
        remove: 'Remove tab',
      }),
      toggle,
    );
    header.append(titleArea, itemControls);
    dom.append(header, contentDOM);
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

      const labelChanged = updatedNode.attrs.label !== currentNode.attrs.label;
      currentNode = updatedNode;
      dom.dataset.kbTabLabel = normalizeItemLabel(currentNode.attrs.label, 'Tab');
      if (labelChanged) render();
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
