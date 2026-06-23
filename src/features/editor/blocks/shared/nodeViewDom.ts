import { logDevError } from "../../lib/utils/logDevError";
export function applyHTMLAttributes(
  element: HTMLElement,
  attributes: Record<string, unknown>,
): void {
  Object.entries(attributes).forEach(([name, value]) => {
    if (value == null || value === false) return;

    if (name === 'class') {
      element.className = String(value);
      return;
    }

    element.setAttribute(name, value === true ? '' : String(value));
  });
}

type EditableObserverRecord = {
  callbacks: Set<() => void>;
  observer: MutationObserver;
};

// Stores one MutationObserver per editor element
const editableObservers = new WeakMap<HTMLElement, EditableObserverRecord>();

/**
 * Observes changes to the editor element's `contenteditable` attribute.
 *
 * This is useful for node views / custom UI that need to react when the
 * editor switches between editable and read-only mode like tabs and accordions
 *
 * Multiple callbacks can subscribe to the same editor element, but only
 * one MutationObserver is created per element.
 *
 * Returns a cleanup function that removes the callback and disconnects
 * the observer when no callbacks remain.
 */
export function observeEditorEditable(
  editorElement: HTMLElement,
  onChange: () => void,
): () => void {
  let record = editableObservers.get(editorElement);

  if (!record) {
    const callbacks = new Set<() => void>();
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === 'attributes' &&
            mutation.attributeName === 'contenteditable',
        )
      ) {
        callbacks.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            logDevError('Editable observer callback failed', error);
          }
        });
      }
    });
    record = { callbacks, observer };
    editableObservers.set(editorElement, record);
    observer.observe(editorElement, {
      attributeFilter: ['contenteditable'],
      attributes: true,
    });
  }

  record.callbacks.add(onChange);

  return () => {
    const current = editableObservers.get(editorElement);
    if (!current) return;

    current.callbacks.delete(onChange);

    // Disconnect the shared observer once nobody is listening anymore.
    if (current.callbacks.size === 0) {
      current.observer.disconnect();
      editableObservers.delete(editorElement);
    }
  };
}

export type ContentBlockIcon =
  | 'add'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'more'
  | 'remove';

const ICON_PATHS: Record<ContentBlockIcon, string> = {
  add: 'M12 5v14M5 12h14',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronUp: 'm18 15-6-6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  remove: 'M6 6l12 12M18 6 6 18',
};

export function createIcon(icon: ContentBlockIcon): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  const path = document.createElementNS(namespace, 'path');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', ICON_PATHS[icon]);
  svg.append(path);
  return svg;
}

// Creates a reusable icon-only button for content-block controls.
export function createIconButton(
  label: string,
  icon: ContentBlockIcon,
  onActivate: () => void,
  options: {
    className?: string;
    disabled?: boolean;
    danger?: boolean;
  } = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'kb-content-block__icon-button',
    options.danger ? 'kb-content-block__icon-button--danger' : '',
    options.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  button.ariaLabel = label;
  button.title = label;
  button.disabled = Boolean(options.disabled);
  button.append(createIcon(icon));
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) onActivate();
  });
  return button;
}

export type ActionMenuItem = {
  danger?: boolean;
  disabled?: boolean | (() => boolean);
  icon: ContentBlockIcon;
  label: string;
  onActivate: () => void;
};

/**
 * Creates a small dropdown action menu for content-block controls.
 *
 * Supports:
 * - dynamic disabled states through `disabled: () => boolean`
 * - keyboard navigation with ArrowUp / ArrowDown / Home / End
 * - Escape to close
 * - focusout auto-close
 */
export function createActionMenu(
  label: string,
  items: readonly ActionMenuItem[],
  onInteract?: () => void,
): HTMLElement {
  const root = document.createElement('span');
  const trigger = createIconButton(label, 'more', () => {
    onInteract?.();
    popup.hidden = !popup.hidden;
    trigger.setAttribute('aria-expanded', String(!popup.hidden));
    if (!popup.hidden) {
      syncDisabledStates();
      popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
  });
  const popup = document.createElement('span');
  const itemButtons: Array<{
    button: HTMLButtonElement;
    item: ActionMenuItem;
  }> = [];

  root.className = 'kb-content-block__action-menu';
  trigger.classList.add('kb-content-block__menu-trigger');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  popup.className = 'kb-content-block__menu';
  popup.hidden = true;
  popup.setAttribute('role', 'menu');

  const close = () => {
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  const syncDisabledStates = () => {
    itemButtons.forEach(({ button, item }) => {
      button.disabled =
        typeof item.disabled === 'function'
          ? item.disabled()
          : Boolean(item.disabled);
    });
  };

  items.forEach((item) => {
    const button = document.createElement('button');
    const icon = createIcon(item.icon);
    const text = document.createElement('span');

    button.type = 'button';
    button.className = item.danger
      ? 'kb-content-block__menu-item kb-content-block__menu-item--danger'
      : 'kb-content-block__menu-item';
    button.disabled =
      typeof item.disabled === 'function'
        ? item.disabled()
        : Boolean(item.disabled);
    button.setAttribute('role', 'menuitem');
    button.ariaLabel = item.label;
    text.textContent = item.label;
    button.append(icon, text);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;

      close();
      onInteract?.();
      item.onActivate();
    });
    popup.append(button);
    itemButtons.push({ button, item });
  });

  root.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) close();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.focus();
      return;
    }

    if (
      popup.hidden ||
      !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      return;
    }

    const enabledButtons = itemButtons
      .map(({ button }) => button)
      .filter((button) => !button.disabled);
    if (enabledButtons.length === 0) return;

    event.preventDefault();
    const currentIndex = enabledButtons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const targetIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabledButtons.length - 1
          : event.key === 'ArrowDown'
            ? currentIndex < 0
              ? 0
              : (currentIndex + 1) % enabledButtons.length
            : currentIndex < 0
              ? enabledButtons.length - 1
              : (currentIndex - 1 + enabledButtons.length) % enabledButtons.length;
    enabledButtons[targetIndex].focus();
  });
  root.append(trigger, popup);
  return root;
}
