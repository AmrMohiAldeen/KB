import {
  mergeAttributes,
  Node,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  type EditorState,
} from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';

export const GLOSSARY_NODE_NAME = 'glossary';

const MAX_GLOSSARY_TERM_LENGTH = 120;
const MAX_GLOSSARY_DEFINITION_LENGTH = 1000;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export type GlossaryAttrs = {
  term: string;
  definition: string;
  id?: string | null;
};

export type SetGlossaryOptions = {
  term: unknown;
  definition: unknown;
  id?: unknown;
};

export type UpdateGlossaryOptions = {
  term?: unknown;
  definition?: unknown;
};

type GlossaryMatch = {
  node: ProseMirrorNode;
  pos: number;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    glossary: {
      setGlossary: (options: SetGlossaryOptions) => ReturnType;
      unsetGlossary: () => ReturnType;
      updateGlossary: (options: UpdateGlossaryOptions) => ReturnType;
    };
  }
}

function stringifyGlossaryValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

export function sanitizeGlossaryText(
  value: unknown,
  maxLength: number,
): string {
  return stringifyGlossaryValue(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function sanitizeGlossaryId(value: unknown): string | null {
  const id = stringifyGlossaryValue(value).trim();

  return SAFE_ID_PATTERN.test(id) ? id : null;
}

export function normalizeGlossaryAttrs(
  attrs: Partial<Record<keyof GlossaryAttrs, unknown>>,
): GlossaryAttrs | null {
  const term = sanitizeGlossaryText(attrs.term, MAX_GLOSSARY_TERM_LENGTH);
  const definition = sanitizeGlossaryText(
    attrs.definition,
    MAX_GLOSSARY_DEFINITION_LENGTH,
  );
  const id = sanitizeGlossaryId(attrs.id);

  if (!term || !definition) return null;

  return { term, definition, id };
}

export function normalizeGlossaryRenderAttrs(
  attrs: Partial<Record<keyof GlossaryAttrs, unknown>>,
): GlossaryAttrs {
  return normalizeGlossaryAttrs(attrs) ?? {
    term: 'Glossary term',
    definition: 'No definition provided.',
    id: sanitizeGlossaryId(attrs.id),
  };
}

function hashGlossaryText(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function createStaticTooltipId(attrs: GlossaryAttrs): string {
  const key = attrs.id ?? hashGlossaryText(`${attrs.term}:${attrs.definition}`);

  return `kb-glossary-tooltip-${key}`;
}

function createGlossaryHtmlAttributes(attrs: GlossaryAttrs) {
  return {
    class: 'kb-glossary',
    'data-kb-glossary': '',
    'data-kb-glossary-term': attrs.term,
    'data-kb-glossary-definition': attrs.definition,
    'data-kb-glossary-id': attrs.id || null,
    tabindex: '0',
    'aria-describedby': createStaticTooltipId(attrs),
  };
}

function createGlossaryTooltip(attrs: GlossaryAttrs, tooltipId: string) {
  return [
    'span',
    {
      id: tooltipId,
      role: 'tooltip',
      class: 'kb-glossary__tooltip',
      'data-kb-glossary-tooltip': '',
    },
    attrs.definition,
  ];
}

function getGlossaryAttrsFromElement(element: HTMLElement): GlossaryAttrs | null {
  return normalizeGlossaryAttrs({
    term:
      element.getAttribute('data-kb-glossary-term') ??
      element.getAttribute('data-term') ??
      element.textContent,
    definition:
      element.getAttribute('data-kb-glossary-definition') ??
      element.getAttribute('data-definition'),
    id: element.getAttribute('data-kb-glossary-id'),
  });
}

export function findSelectedGlossaryNodes(state: EditorState): GlossaryMatch[] {
  const { selection } = state;

  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === GLOSSARY_NODE_NAME
  ) {
    return [{ node: selection.node, pos: selection.from }];
  }

  const matches: GlossaryMatch[] = [];

  if (!selection.empty) {
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name === GLOSSARY_NODE_NAME) {
        matches.push({ node, pos });
        return false;
      }

      return true;
    });
  }

  if (matches.length > 0) return matches;

  const before = selection.$from.nodeBefore;
  if (before?.type.name === GLOSSARY_NODE_NAME) {
    return [{ node: before, pos: selection.from - before.nodeSize }];
  }

  const after = selection.$from.nodeAfter;
  if (after?.type.name === GLOSSARY_NODE_NAME) {
    return [{ node: after, pos: selection.from }];
  }

  return [];
}

export function getSelectedGlossaryAttributes(
  state: EditorState,
): GlossaryAttrs | null {
  const match = findSelectedGlossaryNodes(state)[0];

  return match ? normalizeGlossaryRenderAttrs(match.node.attrs) : null;
}

let liveTooltipId = 0;

function createGlossaryNodeView(props: NodeViewRendererProps): NodeView {
  const dom = document.createElement('span');
  const tooltip = document.createElement('span');
  const tooltipId = `kb-glossary-tooltip-live-${++liveTooltipId}`;

  function applyAttrs(node: ProseMirrorNode): void {
    const attrs = normalizeGlossaryRenderAttrs(node.attrs);

    dom.className = 'kb-glossary';
    dom.contentEditable = 'false';
    dom.tabIndex = 0;
    dom.setAttribute('data-kb-glossary', '');
    dom.setAttribute('data-kb-glossary-term', attrs.term);
    dom.setAttribute('data-kb-glossary-definition', attrs.definition);
    dom.setAttribute('aria-describedby', tooltipId);

    if (attrs.id) {
      dom.setAttribute('data-kb-glossary-id', attrs.id);
    } else {
      dom.removeAttribute('data-kb-glossary-id');
    }

    tooltip.id = tooltipId;
    tooltip.className = 'kb-glossary__tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('data-kb-glossary-tooltip', '');
    tooltip.textContent = attrs.definition;

    dom.replaceChildren(document.createTextNode(attrs.term), tooltip);
  }

  const open = () => {
    dom.setAttribute('data-kb-glossary-open', 'true');
  };

  const close = () => {
    dom.setAttribute('data-kb-glossary-open', 'false');
  };

  const resetClosedState = () => {
    dom.removeAttribute('data-kb-glossary-open');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    close();
    dom.blur();
  };

  applyAttrs(props.node);

  dom.addEventListener('mouseenter', open);
  dom.addEventListener('focus', open);
  dom.addEventListener('mouseleave', resetClosedState);
  dom.addEventListener('blur', resetClosedState);
  dom.addEventListener('keydown', onKeyDown);

  return {
    dom,

    update(updatedNode) {
      if (updatedNode.type !== props.node.type) return false;

      applyAttrs(updatedNode);
      return true;
    },

    stopEvent(event) {
      return event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape';
    },

    ignoreMutation() {
      return true;
    },

    destroy() {
      dom.removeEventListener('mouseenter', open);
      dom.removeEventListener('focus', open);
      dom.removeEventListener('mouseleave', resetClosedState);
      dom.removeEventListener('blur', resetClosedState);
      dom.removeEventListener('keydown', onKeyDown);
    },
  };
}

export const Glossary = Node.create({
  name: GLOSSARY_NODE_NAME,
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      term: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          getGlossaryAttrsFromElement(element)?.term ?? '',
        renderHTML: () => ({}),
      },
      definition: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          getGlossaryAttrsFromElement(element)?.definition ?? '',
        renderHTML: () => ({}),
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          getGlossaryAttrsFromElement(element)?.id ?? null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-kb-glossary]',
        getAttrs: (element) =>
          element instanceof HTMLElement
            ? getGlossaryAttrsFromElement(element) ?? false
            : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeGlossaryRenderAttrs(node.attrs);
    const tooltipId = createStaticTooltipId(attrs);

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        ...createGlossaryHtmlAttributes(attrs),
        'aria-describedby': tooltipId,
      }),
      attrs.term,
      createGlossaryTooltip(attrs, tooltipId),
    ];
  },

  renderText({ node }) {
    return normalizeGlossaryRenderAttrs(node.attrs).term;
  },

  addNodeView() {
    return createGlossaryNodeView;
  },

  addCommands() {
    return {
      setGlossary:
        (options) =>
        ({ editor, commands }) => {
          if (!editor.isEditable) return false;

          const attrs = normalizeGlossaryAttrs(options);
          if (!attrs) return false;

          return commands.insertContent({
            type: GLOSSARY_NODE_NAME,
            attrs,
          });
        },

      unsetGlossary:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;

          const matches = findSelectedGlossaryNodes(state);
          if (matches.length === 0) return false;

          if (dispatch) {
            [...matches].reverse().forEach(({ node, pos }) => {
              const attrs = normalizeGlossaryRenderAttrs(node.attrs);
              tr.replaceWith(
                pos,
                pos + node.nodeSize,
                state.schema.text(attrs.term),
              );
            });

            dispatch(tr);
          }

          return true;
        },

      updateGlossary:
        (updates) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;

          const matches = findSelectedGlossaryNodes(state);
          if (matches.length === 0) return false;

          const normalizedUpdates = matches.map(({ node, pos }) => {
            const current = normalizeGlossaryRenderAttrs(node.attrs);
            const next = normalizeGlossaryAttrs({
              term: updates.term === undefined ? current.term : updates.term,
              definition:
                updates.definition === undefined
                  ? current.definition
                  : updates.definition,
              id: current.id,
            });

            return next ? { attrs: next, node, pos } : null;
          });

          if (normalizedUpdates.some((item) => item === null)) return false;

          if (dispatch) {
            normalizedUpdates.forEach((item) => {
              if (!item) return;

              tr.setNodeMarkup(item.pos, undefined, item.attrs);
            });

            dispatch(tr);
          }

          return true;
        },
    };
  },
});
