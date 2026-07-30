import { closeHistory } from '@tiptap/pm/history';
import {
  Fragment,
  Node as ProseMirrorNode,
  type DOMOutputSpec,
} from '@tiptap/pm/model';
import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import {
  NodeSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';
import {
  normalizeImageHeight,
  normalizeImageWidth,
} from './imageDimensions';
import { ImageResizePlugin } from './ImageResizePlugin';
import {
  getSelectedImage,
  isImageNode,
} from './imageDom';
import {
  BLOCK_IMAGE_NODE_NAME,
  INLINE_IMAGE_NODE_NAME,
  type ImageDisplayMode,
} from './imageTypes';

export type SetKnowledgeBaseImageOptions = {
  src: string;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  alt?: string;
  title?: string;
  width?: number | null;
  height?: number | null;
  imageOffsetPct?: number | null;
};

type ImageNodeOptions = {
  HTMLAttributes: Record<string, unknown>;
  allowBase64: boolean;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: SetKnowledgeBaseImageOptions) => ReturnType;
      setInlineImage: (options: SetKnowledgeBaseImageOptions) => ReturnType;
      setImageDisplay: (display: ImageDisplayMode) => ReturnType;
      deleteSelectedImage: () => ReturnType;
    };
  }
}

const inputRegex =
  /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

function omitNullishAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value != null),
  );
}

function appendStyle(
  existingStyle: unknown,
  additions: Record<string, string>,
): string {
  const style = typeof existingStyle === 'string' ? existingStyle.trim() : '';
  const suffix = Object.entries(additions)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ');

  return [style.replace(/;$/, ''), suffix].filter(Boolean).join('; ');
}

function parseImageOffset(element: HTMLElement): number | null {
  const datasetValue = element.dataset.imageOffsetPct;
  if (datasetValue != null) {
    const parsed = Number(datasetValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const styleMatch = element.style.marginLeft.match(/^(\d+(?:\.\d+)?)%$/);
  return styleMatch ? Number(styleMatch[1]) : null;
}

function parseImageAttributes(element: HTMLElement): SetKnowledgeBaseImageOptions {
  return {
    src: element.getAttribute('src') ?? '',
    mediaId: element.dataset.mediaId ?? undefined,
    mimeType: element.dataset.mimeType ?? undefined,
    fileName: element.dataset.fileName ?? undefined,
    fileSize: element.dataset.fileSize
      ? Number(element.dataset.fileSize)
      : undefined,
    alt: element.getAttribute('alt') ?? undefined,
    title: element.getAttribute('title') ?? undefined,
    width: normalizeImageWidth(
      element.getAttribute('width') ?? element.style.width,
    ),
    height: normalizeImageHeight(
      element.getAttribute('height') ?? element.style.height,
    ),
    imageOffsetPct: parseImageOffset(element),
  };
}

function renderImageAttributes(
  HTMLAttributes: Record<string, unknown>,
  display: ImageDisplayMode,
): Record<string, unknown> {
  const {
    imageOffsetPct,
    style,
    width: rawWidth,
    height: rawHeight,
    ...remainingAttributes
  } = HTMLAttributes;

  const width = normalizeImageWidth(rawWidth);
  const height = normalizeImageHeight(rawHeight);
  const offset =
    display === 'block' && imageOffsetPct != null
      ? Number(imageOffsetPct)
      : null;

  const rendered = omitNullishAttributes({
    ...remainingAttributes,
    width,
    height,
    'data-kb-image': display,
    'data-image-width': width,
  });

  if (display === 'block' && offset != null && Number.isFinite(offset)) {
    const normalizedOffset = Math.max(0, Math.min(100, Math.round(offset * 10) / 10));
    const cssOffset = `${normalizedOffset}%`;

    rendered['data-image-offset-pct'] = String(normalizedOffset);
    rendered.style = appendStyle(style, {
      '--image-offset-pct': cssOffset,
      'margin-left': cssOffset,
    });
  } else if (typeof style === 'string' && style.trim()) {
    rendered.style = style;
  }

  return rendered;
}

function copyImageAttributes(
  node: ProseMirrorNode,
): SetKnowledgeBaseImageOptions {
  return {
    src: String(node.attrs.src ?? ''),
    mediaId: node.attrs.mediaId ?? undefined,
    mimeType: node.attrs.mimeType ?? undefined,
    fileName: node.attrs.fileName ?? undefined,
    fileSize: node.attrs.fileSize == null ? undefined : Number(node.attrs.fileSize),
    alt: node.attrs.alt ?? undefined,
    title: node.attrs.title ?? undefined,
    width: normalizeImageWidth(node.attrs.width),
    height: normalizeImageHeight(node.attrs.height),
    imageOffsetPct:
      node.attrs.imageOffsetPct == null
        ? null
        : Number(node.attrs.imageOffsetPct),
  };
}

function createConvertedTextblock(
  parent: ProseMirrorNode,
  content: Fragment,
): ProseMirrorNode | null {
  if (content.size === 0) return null;

  return parent.type.create(parent.attrs, content, parent.marks);
}

function convertSelectedImageDisplay({
  state,
  dispatch,
  display,
}: {
  state: EditorState;
  dispatch?: (tr: Transaction) => void;
  display: ImageDisplayMode;
}): boolean {
  const selected = getSelectedImage(state);
  if (!selected) return false;
  if (selected.display === display) return true;

  const attrs = copyImageAttributes(selected.node);
  const targetType =
    display === 'block'
      ? state.schema.nodes[BLOCK_IMAGE_NODE_NAME]
      : state.schema.nodes[INLINE_IMAGE_NODE_NAME];
  if (!targetType) return false;

  if (!dispatch) return true;

  const tr = state.tr;

  if (display === 'inline') {
    const paragraphType = state.schema.nodes.paragraph;
    const inlineImage = state.schema.nodes[INLINE_IMAGE_NODE_NAME].create(attrs);
    const paragraph = paragraphType.create(null, inlineImage);

    tr.replaceWith(selected.pos, selected.pos + selected.node.nodeSize, paragraph);
    tr.setSelection(NodeSelection.create(tr.doc, selected.pos + 1));
    dispatch(closeHistory(tr.scrollIntoView()));
    return true;
  }

  const blockImage = targetType.create(attrs);
  const { $from } = state.selection;
  const parent = $from.parent;

  if (!parent.isTextblock) {
    tr.replaceWith(selected.pos, selected.pos + selected.node.nodeSize, blockImage);
    tr.setSelection(NodeSelection.create(tr.doc, selected.pos));
    dispatch(closeHistory(tr.scrollIntoView()));
    return true;
  }

  const parentStart = $from.before($from.depth);
  const parentEnd = $from.after($from.depth);
  const beforeContent = parent.content.cut(0, $from.parentOffset);
  const afterContent = parent.content.cut(
    $from.parentOffset + selected.node.nodeSize,
  );
  const beforeNode = createConvertedTextblock(parent, beforeContent);
  const afterNode = createConvertedTextblock(parent, afterContent);
  const replacementNodes = [beforeNode, blockImage, afterNode].filter(
    (node): node is ProseMirrorNode => Boolean(node),
  );
  const imagePos = parentStart + (beforeNode?.nodeSize ?? 0);

  tr.replaceWith(parentStart, parentEnd, Fragment.fromArray(replacementNodes));
  tr.setSelection(NodeSelection.create(tr.doc, imagePos));
  dispatch(closeHistory(tr.scrollIntoView()));
  return true;
}

function deleteSelectedImage({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch?: (tr: Transaction) => void;
}): boolean {
  const selected = getSelectedImage(state);
  if (!selected) return false;

  if (!dispatch) return true;

  dispatch(
    closeHistory(
      state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize).scrollIntoView(),
    ),
  );
  return true;
}

function createImageNodeExtension({
  name,
  display,
}: {
  name: typeof BLOCK_IMAGE_NODE_NAME | typeof INLINE_IMAGE_NODE_NAME;
  display: ImageDisplayMode;
}) {
  return Node.create<ImageNodeOptions>({
    name,

    addOptions() {
      return {
        HTMLAttributes: {},
        allowBase64: false,
      };
    },

    inline() {
      return display === 'inline';
    },

    group() {
      return display === 'inline' ? 'inline' : 'block';
    },

    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        src: {
          default: null,
        },
        mediaId: {
          default: null,
          renderHTML: attributes =>
            attributes.mediaId ? { 'data-media-id': attributes.mediaId } : {},
        },
        mimeType: {
          default: null,
          renderHTML: attributes =>
            attributes.mimeType ? { 'data-mime-type': attributes.mimeType } : {},
        },
        fileName: {
          default: null,
          renderHTML: attributes =>
            attributes.fileName ? { 'data-file-name': attributes.fileName } : {},
        },
        fileSize: {
          default: null,
          renderHTML: attributes =>
            attributes.fileSize != null ? { 'data-file-size': attributes.fileSize } : {},
        },
        alt: {
          default: null,
        },
        title: {
          default: null,
        },
        width: {
          default: null,
        },
        height: {
          default: null,
        },
        imageOffsetPct: {
          default: null,
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: this.options.allowBase64
            ? 'img[src]'
            : 'img[src]:not([src^="data:"])',
          getAttrs: (element) =>
            element instanceof HTMLElement
              ? parseImageAttributes(element)
              : false,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'img',
        mergeAttributes(
          this.options.HTMLAttributes,
          renderImageAttributes(HTMLAttributes, display),
        ),
      ] satisfies DOMOutputSpec;
    },

    renderMarkdown: (node) => {
      const src = node.attrs?.src ?? '';
      const alt = node.attrs?.alt ?? '';
      const title = node.attrs?.title ?? '';
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    },
  });
}

export const InlineImageNode = createImageNodeExtension({
  name: INLINE_IMAGE_NODE_NAME,
  display: 'inline',
});

export const BlockImageNode = createImageNodeExtension({
  name: BLOCK_IMAGE_NODE_NAME,
  display: 'block',
}).extend({
  addCommands() {
    return {
      setImage:
        (options: SetKnowledgeBaseImageOptions) =>
        ({ editor, commands }) =>
          editor.isEditable &&
          commands.insertContent({
            type: BLOCK_IMAGE_NODE_NAME,
            attrs: options,
          }),
      setInlineImage:
        (options: SetKnowledgeBaseImageOptions) =>
        ({ editor, commands }) =>
          editor.isEditable &&
          commands.insertContent({
            type: INLINE_IMAGE_NODE_NAME,
            attrs: options,
          }),
      setImageDisplay:
        (display: ImageDisplayMode) =>
        ({ editor, state, dispatch }) =>
          editor.isEditable &&
          convertSelectedImageDisplay({ state, dispatch, display }),
      deleteSelectedImage:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && deleteSelectedImage({ state, dispatch }),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match;
          return { src, alt, title };
        },
      }),
    ];
  },
});

export const ImageInteractions = Extension.create({
  name: 'imageInteractions',

  addProseMirrorPlugins() {
    return [ImageResizePlugin()];
  },
});

export const imageExtensions = [
  InlineImageNode,
  BlockImageNode,
  ImageInteractions,
];

export { isImageNode };
