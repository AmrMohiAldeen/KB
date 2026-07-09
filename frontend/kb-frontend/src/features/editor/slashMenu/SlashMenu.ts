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
import { readInheritedTextDirection } from '../extensions/TextDirection';

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

//A Map has methods which expose its data (entries, keys, and values). 
// A WeakMap does not, which allows its data to be garbage collected if you can no longer reference the key of an entry. 
const mountedMenus = new WeakMap<Editor, MountedSlashMenu>();
const menuCleanup = new WeakMap<HTMLElement, () => void>();

export function findSlashCommandMatch(
  state: EditorState,
): SlashCommandMatch | null {
  const { selection } = state;

  // If the user selected text, we do not show the menu.
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  // Code blocks are skipped because "/" should behave like normal code text there.
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') {
    return null;
  }

  // Read all text in the current text block before the cursor.
  // "\ufffc" is used as a placeholder for non-text inline nodes.
  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    '\ufffc',
  );
  const match = /\/([\w:-]*)$/i.exec(textBefore);
  if (!match) return null;

  const slashIndex = match.index;

  // Only treat "/" as a slash command when it starts the block
  // or comes after whitespace.
  if (slashIndex > 0 && !/\s/.test(textBefore[slashIndex - 1])) return null;

  return {
    from: selection.from - match[0].length, // ProseMirror document position where the "/" command starts.
    query: match[1].toLowerCase(),
    to: selection.from,  // Current cursor position, where the slash command ends.
  };
}

function insertSlashCommand(
  editor: Editor,
  match: SlashCommandMatch,
  kind: SlashCommandKind,
): boolean {
  // Do not insert anything when the editor is read-only.
  if (!editor.isEditable) return false;

  const direction = readInheritedTextDirection(editor.state);

  // Remove the typed slash command text first.
  const chain = editor.chain().focus().deleteRange({
    from: match.from,
    to: match.to,
  });

  return runSlashCommandInsert(chain, kind, match.query, direction);
}

function syncActiveItem(editor: Editor, index: number, scrollIntoView: boolean): void {
  const mounted = mountedMenus.get(editor);
  if (!mounted) return;

  // Store the active item index so keyboard navigation and UI state stay in sync.
  mounted.activeIndex = index;
  
  const active = Array.from(
    mounted.menu.querySelectorAll<HTMLElement>('[role="option"]'),
  )[index];

  // Update aria-selected on every option for accessibility.
  mounted.menu
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((item, itemIndex) =>
      item.setAttribute('aria-selected', String(itemIndex === index)),
    );

  if (active) {
    mounted.menu.setAttribute('aria-activedescendant', active.id);

    // Used during keyboard navigation so the highlighted item stays visible.
    if (scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }
}

// When user hovers a menu item
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
  // This invisible anchor is inserted into the editor at the cursor position.
  // Floating UI uses it to position the menu near the slash command.
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
    // Add a group label whenever the command group changes.
    // Example groups could be "Basic", "Lists", "Callouts", etc.
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

    // Show a keyboard shortcut hint when the command has one.
    if (item.shortcut) {
      const shortcut = document.createElement('kbd');
      shortcut.textContent = item.shortcut;
      button.append(shortcut);
    }

    // Hovering an item makes it the active item.
    button.addEventListener('mouseenter', () => activateItem(editor, index));

    // Use mousedown instead of click so the editor does not lose focus first.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      insertSlashCommand(editor, match, item.kind);
    });
    menu.append(button);
  });

  document.body.append(menu);

  // Keep track of the mounted menu for this editor instance.
  mountedMenus.set(editor, { activeIndex, menu });

  const updatePosition = () => {
     // Position the menu next to the anchor using Floating UI.
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

  // Recalculate the menu position when needed.
  // Resize/layout shift tracking is disabled to keep this lightweight.
  const stopAutoUpdate = autoUpdate(anchor, menu, updatePosition, {
    elementResize: false,
    layoutShift: false,
  });

  // Cleanup runs when the ProseMirror widget decoration is destroyed.
  const cleanup = () => {
    stopAutoUpdate();
    menu.remove();

    // Only clear the mounted menu if this cleanup belongs to the current menu.
    if (mountedMenus.get(editor)?.menu === menu) mountedMenus.delete(editor);
  };
  menuCleanup.set(anchor, cleanup);
  return anchor;
}

// Ignore shortcut combinations like Ctrl+B, Cmd+K, Alt+Arrow, etc.
// Slash menu keyboard handling should only process plain navigation keys.
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

        // Reset the menu state whenever the document or selection changes.
        // This prevents stale active indexes or stale dismiss positions.
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

        // Clamp activeIndex so it never points outside the filtered item list.
        const activeIndex = Math.min(pluginState?.activeIndex ?? 0, items.length - 1);

        // Keep DOM state aligned with plugin state before rendering.
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

        // Enter and Tab insert the currently active slash command.
        if (
          !event.shiftKey &&
          (event.key === 'Enter' || event.key === 'Tab')
        ) {
          event.preventDefault();
          return insertSlashCommand(editor, match, items[activeIndex].kind);
        }

        // Escape hides the menu for the current slash command position.
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
