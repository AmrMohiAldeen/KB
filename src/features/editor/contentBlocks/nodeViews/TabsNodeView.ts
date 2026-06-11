import type { NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import {
  createContentBlockItemId,
  normalizeItemLabel,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
} from '../model';
import { resolveNodeViewPosition } from '../transactions';
import {
  applyHTMLAttributes,
  createIconButton,
  observeEditorEditable,
} from './dom';

type TabDescriptor = {
  id: string;
  index: number;
  label: string;
};

let tabsViewId = 0;

function describeTabs(node: ProseMirrorNode): TabDescriptor[] {
  const tabs: TabDescriptor[] = [];

  node.forEach((child, _offset, index) => {
    tabs.push({
      id:
        typeof child.attrs.itemId === 'string' && child.attrs.itemId
          ? child.attrs.itemId
          : `tab-${index + 1}`,
      index,
      label: normalizeItemLabel(child.attrs.label, `Tab ${index + 1}`),
    });
  });

  return tabs;
}

function createTabNode(
  props: NodeViewRendererProps,
  label: string,
): ProseMirrorNode | null {
  const tabItem = props.view.state.schema.nodes[TAB_ITEM_NODE_NAME];
  const paragraph = props.view.state.schema.nodes.paragraph;
  if (!tabItem || !paragraph) return null;

  return tabItem.create(
    {
      itemId: createContentBlockItemId('tab'),
      label,
    },
    paragraph.create(),
  );
}

export function createTabsNodeView(props: NodeViewRendererProps): NodeView {
  let currentNode = props.node;
  let activeId = describeTabs(currentNode)[0]?.id ?? '';
  let destroyed = false;

  tabsViewId += 1;
  const viewId = `kb-tabs-${tabsViewId}`;
  const dom = document.createElement('div');
  const header = document.createElement('div');
  const tabList = document.createElement('div');
  const contentDOM = document.createElement('div');
  const footer = document.createElement('div');
  const visibilityStyle = document.createElement('style');

  applyHTMLAttributes(dom, props.HTMLAttributes);
  dom.id = viewId;
  dom.dataset.kbTabs = '';
  header.className = 'kb-tabs__header';
  header.contentEditable = 'false';
  tabList.className = 'kb-tabs__list';
  tabList.setAttribute('role', 'tablist');
  tabList.ariaLabel = 'Tabs';
  footer.className = 'kb-tabs__editor-footer';
  footer.contentEditable = 'false';
  visibilityStyle.className = 'kb-tabs__visibility-rule';

  const getContainerPosition = () => resolveNodeViewPosition(props.getPos);

  const addTab = () => {
    if (!props.editor.isEditable) return;

    const position = getContainerPosition();
    const container = position == null ? null : props.view.state.doc.nodeAt(position);
    if (!container || container.type.name !== TABS_NODE_NAME || position == null) return;

    const item = createTabNode(props, `Tab ${container.childCount + 1}`);
    if (!item) return;

    props.view.dispatch(
      props.view.state.tr.insert(position + container.nodeSize - 1, item),
    );
  };

  const focusAdjacentTab = (index: number, direction: -1 | 1) => {
    const tabs = describeTabs(currentNode);
    const target = tabs[index + direction];
    if (!target) return;

    activeId = target.id;
    applyViewerActiveState();
    Array.from(tabList.querySelectorAll<HTMLElement>('[data-kb-tab-control-id]'))
      .find((control) => control.dataset.kbTabControlId === target.id)
      ?.focus();
  };

  const applyViewerActiveState = () => {
    if (destroyed || props.editor.isEditable) return;

    const tabs = describeTabs(currentNode);
    if (!tabs.some((tab) => tab.id === activeId)) {
      activeId = tabs[0]?.id ?? '';
    }
    const activeIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeId),
    );
    dom.dataset.kbActiveTab = activeId;
    visibilityStyle.textContent =
      `#${viewId} > .kb-tabs__panels > :not(:nth-child(${activeIndex + 1}))` +
      ' { display: none; }';

    Array.from(tabList.querySelectorAll<HTMLElement>('[data-kb-tab-control-id]')).forEach(
      (control) => {
        const selected = control.dataset.kbTabControlId === activeId;
        control.setAttribute('aria-selected', String(selected));
        control.tabIndex = selected ? 0 : -1;
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
      button.id = `${viewId}-tab-${tab.id}`;
      button.dataset.kbTabControlId = tab.id;
      button.setAttribute('role', 'tab');
      button.textContent = tab.label;
      button.title = tab.label;
      button.addEventListener('click', () => {
        activeId = tab.id;
        applyViewerActiveState();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          focusAdjacentTab(tab.index, -1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          focusAdjacentTab(tab.index, 1);
        }
      });
      tabList.append(button);
    });
    header.append(tabList, visibilityStyle);
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
      renderChrome();
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
