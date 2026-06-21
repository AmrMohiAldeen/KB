import type { EditorView } from '@tiptap/pm/view';
import {
  MAX_ITEM_LABEL_LENGTH,
  type ContentBlockContainerNodeName,
} from '../model';
import {
  activateContentBlock,
  getItemContext,
  moveItem,
  removeItem,
  resolveNodeViewPosition,
  runContentBlockHistoryAction,
} from '../../lib/transactions/contentBlockTransactions';
import { createActionMenu } from './nodeViewDom';

export type ItemActionLabels = {
  menu: string;
  moveDown: string;
  moveUp: string;
  remove: string;
};

export function createItemActions(
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
  parentTypeName: ContentBlockContainerNodeName,
) {
  const getPosition = () => resolveNodeViewPosition(getPos);
  const getContext = () => {
    const position = getPosition();
    return position == null
      ? null
      : getItemContext(view, position, parentTypeName);
  };
  const activate = (focus = false) => {
    const context = getContext();
    return (
      context != null &&
      activateContentBlock(view, context.parentPos, parentTypeName, { focus })
    );
  };
  const move = (direction: -1 | 1) => {
    const position = getPosition();
    if (position == null || !activate()) return false;
    return moveItem(view, position, parentTypeName, direction);
  };
  const remove = () => {
    const position = getPosition();
    if (position == null || !activate()) return false;
    return removeItem(view, position, parentTypeName);
  };

  return {
    activate,
    move,
    remove,
    createMenu(labels: ItemActionLabels): HTMLElement {
      return createActionMenu(
        labels.menu,
        [
          {
            label: labels.moveUp,
            icon: 'chevronUp',
            disabled: () => {
              const context = getContext();
              return !context || context.index === 0;
            },
            onActivate: () => {
              if (move(-1)) view.focus();
            },
          },
          {
            label: labels.moveDown,
            icon: 'chevronDown',
            disabled: () => {
              const context = getContext();
              return !context || context.index === context.parent.childCount - 1;
            },
            onActivate: () => {
              if (move(1)) view.focus();
            },
          },
          {
            label: labels.remove,
            icon: 'remove',
            danger: true,
            disabled: () => {
              const context = getContext();
              return !context || context.parent.childCount === 1;
            },
            onActivate: () => {
              if (remove()) view.focus();
            },
          },
        ],
        () => activate(),
      );
    },
    runHistoryAction: (action: 'redo' | 'undo') =>
      runContentBlockHistoryAction(view, action),
  };
}

export function createItemLabelInput(options: {
  ariaLabel: string;
  className: string;
  onCommit: (value: string) => void;
  onExit: () => void;
  onHistoryAction: (action: 'redo' | 'undo') => boolean;
  onInteract: () => void;
  onMove: (direction: -1 | 1) => void;
  value: string;
}): HTMLTextAreaElement {
  const input = document.createElement('textarea');
  const resize = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };

  input.className = options.className;
  input.value = options.value;
  input.rows = 1;
  input.maxLength = MAX_ITEM_LABEL_LENGTH;
  input.title = options.value;
  input.ariaLabel = options.ariaLabel;
  input.addEventListener('focus', options.onInteract);
  input.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  input.addEventListener('input', resize);
  input.addEventListener('change', () => {
    options.onInteract();
    options.onCommit(input.value);
  });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();

    const historyAction =
      (event.ctrlKey || event.metaKey) && !event.altKey
        ? event.key.toLowerCase() === 'z'
          ? event.shiftKey
            ? 'redo'
            : 'undo'
          : event.key.toLowerCase() === 'y'
            ? 'redo'
            : null
        : null;

    if (
      historyAction &&
      input.value === options.value &&
      options.onHistoryAction(historyAction)
    ) {
      event.preventDefault();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
      options.onExit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = options.value;
      input.blur();
      options.onExit();
    } else if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      options.onInteract();
      options.onMove(-1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      options.onInteract();
      options.onMove(1);
    }
  });
  queueMicrotask(resize);
  return input;
}
