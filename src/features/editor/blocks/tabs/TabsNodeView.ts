import type { NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import {
  createTabItemNode,
  normalizeItemLabel,
  readContentBlockItemId,
  TABS_NODE_NAME,
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

type TabDescriptor = {
  index: number;
  key: string;
  label: string;
};

let tabsViewId = 0;

function describeTabs(node: ProseMirrorNode): TabDescriptor[] {
  const tabs: TabDescriptor[] = [];
  const occurrences = new Map<string, number>();

  node.forEach((child, _offset, index) => {
    const itemId = readContentBlockItemId(child.attrs.itemId, `tab-${index + 1}`);
    const occurrence = occurrences.get(itemId) ?? 0;
    occurrences.set(itemId, occurrence + 1);

    tabs.push({
      index,
      key: `${itemId}:${occurrence}`,
      label: normalizeItemLabel(child.attrs.label, `Tab ${index + 1}`),
    });
  });

  return tabs;
}

export function createTabsNodeView(props: NodeViewRendererProps): NodeView {
  let currentNode = props.node;
  let activeKey = describeTabs(currentNode)[0]?.key ?? '';
  let destroyed = false;

  tabsViewId += 1;
  const viewId = `kb-tabs-${tabsViewId}`;
  const dom = document.createElement('div');
  const header = document.createElement('div');
  const tabList = document.createElement('div');
  const contentDOM = document.createElement('div');
  const footer = document.createElement('div');

  applyHTMLAttributes(dom, props.HTMLAttributes);
  dom.id = viewId;
  dom.dataset.kbTabs = '';
  header.className = 'kb-tabs__header';
  header.contentEditable = 'false';
  tabList.className = 'kb-tabs__list';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-orientation', 'horizontal');
  tabList.ariaLabel = 'Tabs';
  footer.className = 'kb-tabs__editor-footer';
  footer.contentEditable = 'false';

  const getContainerPosition = () => resolveNodeViewPosition(props.getPos);
  const activateContainer = (focus = false) => {
    const position = getContainerPosition();
    return (
      position != null &&
      activateContentBlock(props.view, position, TABS_NODE_NAME, { focus })
    );
  };

  const addTab = () => {
    if (!props.editor.isEditable) return;

    const position = getContainerPosition();
    const container = position == null ? null : props.view.state.doc.nodeAt(position);
    if (!container || container.type.name !== TABS_NODE_NAME || position == null) return;

    const item = createTabItemNode(
      props.view.state.schema,
      `Tab ${container.childCount + 1}`,
    );
    if (!item) return;

    if (
      activateContainer() &&
      appendItem(props.view, position, TABS_NODE_NAME, item)
    ) {
      props.view.focus();
    }
  };

  const focusTabAtIndex = (index: number) => {
    const tabs = describeTabs(currentNode);
    const target = tabs[index];
    if (!target) return;

    activeKey = target.key;
    applyViewerActiveState();
    Array.from(tabList.querySelectorAll<HTMLElement>('[data-kb-tab-control-id]'))
      .find((control) => control.dataset.kbTabControlId === target.key)
      ?.focus();
  };

  const focusAdjacentTab = (index: number, direction: -1 | 1) => {
    const tabCount = currentNode.childCount;
    if (tabCount === 0) return;

    focusTabAtIndex((index + direction + tabCount) % tabCount);
  };

  const applyViewerActiveState = () => {
    if (destroyed || props.editor.isEditable) return;

    const tabs = describeTabs(currentNode);
    if (!tabs.some((tab) => tab.key === activeKey)) {
      activeKey = tabs[0]?.key ?? '';
    }
    dom.dataset.kbActiveTab = activeKey;

    Array.from(tabList.querySelectorAll<HTMLElement>('[data-kb-tab-control-id]')).forEach(
      (control, index) => {
        const selected = control.dataset.kbTabControlId === activeKey;
        const panel = contentDOM.children.item(index);

        control.setAttribute('aria-selected', String(selected));
        control.tabIndex = selected ? 0 : -1;
        if (panel instanceof HTMLElement) {
          panel.hidden = !selected;
          panel.id = `${viewId}-panel-${index + 1}`;
          panel.setAttribute('aria-labelledby', control.id);
          panel.setAttribute('role', 'tabpanel');
        }
      },
    );
  };

  const renderChrome = () => {
    dom.replaceChildren();
    header.replaceChildren();
    tabList.replaceChildren();
    footer.replaceChildren();
    dom.classList.toggle('kb-tabs--editor', props.editor.isEditable);
    dom.classList.toggle('kb-tabs--viewer', !props.editor.isEditable);

    if (props.editor.isEditable) {
      contentDOM.className = 'kb-tabs__editor-items';
      footer.append(
        createIconButton('Add tab', 'add', addTab, {
          className: 'kb-tabs__editor-add-button',
        }),
      );
      dom.append(contentDOM, footer);
      return;
    }

    contentDOM.className = 'kb-tabs__panels';
    describeTabs(currentNode).forEach((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-tabs__tab';
      button.id = `${viewId}-tab-${tab.index + 1}`;
      button.dataset.kbTabControlId = tab.key;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `${viewId}-panel-${tab.index + 1}`);
      button.textContent = tab.label;
      button.title = tab.label;
      button.addEventListener('click', () => {
        activeKey = tab.key;
        applyViewerActiveState();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          focusAdjacentTab(tab.index, -1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          focusAdjacentTab(tab.index, 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusTabAtIndex(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusTabAtIndex(currentNode.childCount - 1);
        }
      });
      tabList.append(button);
    });
    header.append(tabList);
    dom.append(header, contentDOM);
    queueMicrotask(applyViewerActiveState);
  };

  renderChrome();
  const stopObservingEditable = observeEditorEditable(
    props.view.dom as HTMLElement,
    renderChrome,
  );

  return {
    dom,
    contentDOM,
    update(updatedNode) {
      if (updatedNode.type !== currentNode.type) return false;

      currentNode = updatedNode;
      if (!props.editor.isEditable) renderChrome();
      return true;
    },
    stopEvent(event) {
      return header.contains(event.target as Node) || footer.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return !contentDOM.contains(mutation.target);
    },
    destroy() {
      destroyed = true;
      stopObservingEditable();
    },
  };
}
