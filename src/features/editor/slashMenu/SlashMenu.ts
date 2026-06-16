import { Extension, type Editor } from '@tiptap/core';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/react';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  getMatchingSlashCommands,
  type SlashCommandKind,
  type SlashCommandOption,
} from './catalog';
import { runSlashCommandInsert } from './commands';

export type SlashCommandMatch = {
  from: number;
  query: string;
  to: number;
};

type SlashMenuState = {
  activeIndex: number;
  dismissedAt: number | null;
};

type SlashMenuMeta =
  | { type: 'activate'; index: number }
  | { type: 'dismiss'; position: number };

export const slashMenuKey = new PluginKey<SlashMenuState>('slashCommandMenu');

type MountedSlashMenu = {
  activeIndex: number;
  menu: HTMLElement;
};

const mountedMenus = new WeakMap<Editor, MountedSlashMenu>();
const menuCleanup = new WeakMap<HTMLElement, () => void>();

export function findSlashCommandMatch(
  state: EditorState,
): SlashCommandMatch | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') {
    return null;
  }

  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    '\ufffc',
  );
  const match = /\/([\w:-]*)$/i.exec(textBefore);
  if (!match) return null;

  const slashIndex = match.index;
  if (slashIndex > 0 && !/\s/.test(textBefore[slashIndex - 1])) return null;

  return {
    from: selection.from - match[0].length,
    query: match[1].toLowerCase(),
    to: selection.from,
  };
}

function insertSlashCommand(
  editor: Editor,
  match: SlashCommandMatch,
  kind: SlashCommandKind,
): boolean {
  if (!editor.isEditable) return false;

  const chain = editor.chain().focus().deleteRange({
    from: match.from,
    to: match.to,
  });

  return runSlashCommandInsert(chain, kind, match.query);
}

function syncActiveItem(editor: Editor, index: number, scrollIntoView: boolean): void {
  const mounted = mountedMenus.get(editor);
  if (!mounted) return;

  mounted.activeIndex = index;
  const active = Array.from(
    mounted.menu.querySelectorAll<HTMLElement>('[role="option"]'),
  )[index];
  mounted.menu
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((item, itemIndex) =>
      item.setAttribute('aria-selected', String(itemIndex === index)),
    );
  if (active) {
    mounted.menu.setAttribute('aria-activedescendant', active.id);
    if (scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }
}

function activateItem(editor: Editor, index: number, scrollIntoView = false): void {
  syncActiveItem(editor, index, scrollIntoView);
  editor.view.dispatch(
    editor.state.tr.setMeta(slashMenuKey, {
      type: 'activate',
      index,
    } satisfies SlashMenuMeta),
  );
}

function createSlashMenuWidget(
  editor: Editor,
  match: SlashCommandMatch,
  items: readonly SlashCommandOption[],
  activeIndex: number,
): HTMLElement {
  const anchor = document.createElement('span');
  const menu = document.createElement('span');
  const activeId = `kb-slash-command-${match.from}-${activeIndex}`;
  let currentGroup: SlashCommandOption['group'] | null = null;

  anchor.className = 'kb-slash-menu-anchor';
  anchor.contentEditable = 'false';
  menu.className = 'kb-slash-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Insert block');
  menu.setAttribute('aria-activedescendant', activeId);

  items.forEach((item, index) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      const group = document.createElement('span');
      group.className = 'kb-slash-menu__group';
      group.textContent = item.group;
      group.setAttribute('role', 'presentation');
      menu.append(group);
    }

    const button = document.createElement('button');
    const text = document.createElement('span');
    const label = document.createElement('strong');
    const description = document.createElement('span');

    button.id = `kb-slash-command-${match.from}-${index}`;
    button.type = 'button';
    button.className = 'kb-slash-menu__item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(index === activeIndex));
    label.textContent = item.label;
    description.textContent = item.description;
    text.className = 'kb-slash-menu__item-text';
    text.append(label, description);
    button.append(text);

    if (item.shortcut) {
      const shortcut = document.createElement('kbd');
      shortcut.textContent = item.shortcut;
      button.append(shortcut);
    }

    button.addEventListener('mouseenter', () => activateItem(editor, index));
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      insertSlashCommand(editor, match, item.kind);
    });
    menu.append(button);
  });

  document.body.append(menu);
  mountedMenus.set(editor, { activeIndex, menu });

  const updatePosition = () => {
    void computePosition(anchor, menu, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      Object.assign(menu.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  };
  const stopAutoUpdate = autoUpdate(anchor, menu, updatePosition, {
    elementResize: false,
    layoutShift: false,
  });
  const cleanup = () => {
    stopAutoUpdate();
    menu.remove();
    if (mountedMenus.get(editor)?.menu === menu) mountedMenus.delete(editor);
  };
  menuCleanup.set(anchor, cleanup);
  return anchor;
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey;
}

function createSlashMenuPlugin(editor: Editor): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,
    state: {
      init: () => ({ activeIndex: 0, dismissedAt: null }),
      apply(transaction, previous) {
        const meta = transaction.getMeta(slashMenuKey) as SlashMenuMeta | undefined;
        let next = previous;

        if (transaction.docChanged || transaction.selectionSet) {
          next = { activeIndex: 0, dismissedAt: null };
        }

        if (meta?.type === 'activate') {
          return { ...next, activeIndex: meta.index };
        }

        if (meta?.type === 'dismiss') {
          return { ...next, dismissedAt: meta.position };
        }

        return next;
      },
    },
    props: {
      decorations(state) {
        if (!editor.isEditable) return null;

        const match = findSlashCommandMatch(state);
        const pluginState = slashMenuKey.getState(state);
        if (!match || pluginState?.dismissedAt === match.to) return null;

        const items = getMatchingSlashCommands(match.query);
        if (items.length === 0) return null;

        const activeIndex = Math.min(pluginState?.activeIndex ?? 0, items.length - 1);
        syncActiveItem(editor, activeIndex, false);
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            match.to,
            () => createSlashMenuWidget(editor, match, items, activeIndex),
            {
              key: `slash-command-${match.from}-${match.query}`,
              side: -1,
              destroy: (node) => {
                if (node instanceof HTMLElement) menuCleanup.get(node)?.();
              },
            },
          ),
        ]);
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (!editor.isEditable || event.isComposing || hasCommandModifier(event)) {
          return false;
        }

        const match = findSlashCommandMatch(view.state);
        const pluginState = slashMenuKey.getState(view.state);
        if (!match || pluginState?.dismissedAt === match.to) return false;

        const items = getMatchingSlashCommands(match.query);
        if (items.length === 0) return false;

        const activeIndex = Math.min(pluginState?.activeIndex ?? 0, items.length - 1);

        if (
          !event.shiftKey &&
          (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        ) {
          event.preventDefault();
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = (activeIndex + direction + items.length) % items.length;
          activateItem(editor, nextIndex, true);
          return true;
        }

        if (
          !event.shiftKey &&
          (event.key === 'Enter' || event.key === 'Tab')
        ) {
          event.preventDefault();
          return insertSlashCommand(editor, match, items[activeIndex].kind);
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          view.dispatch(
            view.state.tr.setMeta(slashMenuKey, {
              type: 'dismiss',
              position: match.to,
            } satisfies SlashMenuMeta),
          );
          return true;
        }

        return false;
      },
    },
  });
}

export const SlashCommandMenu = Extension.create({
  name: 'slashCommandMenu',

  addProseMirrorPlugins() {
    return [createSlashMenuPlugin(this.editor)];
  },
});
