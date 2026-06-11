import { Extension, type Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

type ContentBlockKind = 'accordion' | 'tabs';

type SlashMatch = {
  from: number;
  query: string;
  to: number;
};

type SlashMenuItem = {
  description: string;
  kind: ContentBlockKind;
  label: string;
};

type SlashMenuState = {
  activeIndex: number;
  dismissedAt: number | null;
};

type SlashMenuMeta =
  | { type: 'activate'; index: number }
  | { type: 'dismiss'; position: number };

const slashMenuKey = new PluginKey<SlashMenuState>('contentBlockSlashMenu');

const ITEMS: SlashMenuItem[] = [
  {
    kind: 'tabs',
    label: 'Tabs',
    description: 'Tabbed content panels',
  },
  {
    kind: 'accordion',
    label: 'Accordion',
    description: 'Expandable content sections',
  },
];

export function findContentBlockSlashMatch(state: EditorState): SlashMatch | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const match = /\/([a-z]*)$/i.exec(textBefore);
  if (!match) return null;

  const slashIndex = match.index;
  if (slashIndex > 0 && !/\s/.test(textBefore[slashIndex - 1])) return null;

  return {
    from: selection.from - match[0].length,
    query: match[1].toLowerCase(),
    to: selection.from,
  };
}

function getMatchingItems(query: string): SlashMenuItem[] {
  return ITEMS.filter(
    (item) =>
      item.kind.startsWith(query) || item.label.toLowerCase().startsWith(query),
  );
}

function insertContentBlock(
  editor: Editor,
  match: SlashMatch,
  kind: ContentBlockKind,
): boolean {
  const chain = editor.chain().focus().deleteRange({
    from: match.from,
    to: match.to,
  });

  return kind === 'tabs'
    ? chain.insertTabs().run()
    : chain.insertAccordion().run();
}

function createSlashMenuWidget(
  editor: Editor,
  match: SlashMatch,
  items: SlashMenuItem[],
  activeIndex: number,
): HTMLElement {
  const anchor = document.createElement('span');
  const menu = document.createElement('span');

  anchor.className = 'kb-slash-menu-anchor';
  anchor.contentEditable = 'false';
  menu.className = 'kb-slash-menu';
  menu.setAttribute('role', 'listbox');
  menu.ariaLabel = 'Insert content block';

  items.forEach((item, index) => {
    const button = document.createElement('button');
    const label = document.createElement('strong');
    const description = document.createElement('span');

    button.type = 'button';
    button.className = 'kb-slash-menu__item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(index === activeIndex));
    label.textContent = item.label;
    description.textContent = item.description;
    button.append(label, description);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      insertContentBlock(editor, match, item.kind);
    });
    menu.append(button);
  });

  anchor.append(menu);
  return anchor;
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

        const match = findContentBlockSlashMatch(state);
        const pluginState = slashMenuKey.getState(state);
        if (!match || pluginState?.dismissedAt === match.to) return null;

        const items = getMatchingItems(match.query);
        if (items.length === 0) return null;

        const activeIndex = Math.min(pluginState?.activeIndex ?? 0, items.length - 1);
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            match.to,
            () => createSlashMenuWidget(editor, match, items, activeIndex),
            {
              key: `content-block-slash-${match.from}-${match.query}-${activeIndex}`,
              side: -1,
            },
          ),
        ]);
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (!editor.isEditable) return false;

        const match = findContentBlockSlashMatch(view.state);
        const pluginState = slashMenuKey.getState(view.state);
        if (!match || pluginState?.dismissedAt === match.to) return false;

        const items = getMatchingItems(match.query);
        if (items.length === 0) return false;

        const activeIndex = Math.min(pluginState?.activeIndex ?? 0, items.length - 1);

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = (activeIndex + direction + items.length) % items.length;
          view.dispatch(
            view.state.tr.setMeta(slashMenuKey, {
              type: 'activate',
              index: nextIndex,
            } satisfies SlashMenuMeta),
          );
          return true;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          return insertContentBlock(editor, match, items[activeIndex].kind);
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

export const ContentBlockSlashMenu = Extension.create({
  name: 'contentBlockSlashMenu',

  addProseMirrorPlugins() {
    return [createSlashMenuPlugin(this.editor)];
  },
});
