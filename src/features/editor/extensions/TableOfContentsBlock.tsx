"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";

type TocItem = {
  id: string;
  pos: number;
  text: string;
  level: number;
  index: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContentsBlock: {
      insertTableOfContentsBlock: () => ReturnType;
    };
  }
}

function getHeadingId(attrs: Record<string, unknown>, fallback: string): string {
  const id = attrs.id;
  const tocId = attrs["data-toc-id"];

  if (typeof id === "string" && id.trim()) return id;
  if (typeof tocId === "string" && tocId.trim()) return tocId;

  return fallback;
}

function getTableOfContentsItems(editor: Editor): TocItem[] {
  const items: TocItem[] = [];
  const counters: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;

    const text = node.textContent.trim();
    if (!text) return;

    const rawLevel = node.attrs.level;
    const level = typeof rawLevel === "number" ? rawLevel : 1;

    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    counters.length = level;

    const index = counters.join(".");
    const id = getHeadingId(node.attrs, `heading-${pos}`);

    items.push({
      id,
      pos,
      text,
      level,
      index,
    });
  });

  return items;
}

function scrollToHeading(editor: Editor, item: TocItem) {
  const { id, pos } = item;
  const escapedId = CSS.escape(id);
  const domAtHeading = editor.view.domAtPos(pos + 1).node;
  const headingElement =
    domAtHeading instanceof HTMLElement ? domAtHeading : null;

  const element =
    editor.view.dom.querySelector(`#${escapedId}`) ??
    editor.view.dom.querySelector(`[data-toc-id="${escapedId}"]`) ??
    headingElement;

  element?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function TableOfContentsBlockView(props: NodeViewProps) {
  const { editor } = props;

  const items = useEditorState({
    editor,
    selector: ({ editor }) => getTableOfContentsItems(editor),
  });

  return (
    <NodeViewWrapper
      data-type="table-of-contents"
      className="my-4 rounded-md border border-gray-200 bg-gray-50 p-3"
      contentEditable={false}
    >
      <div className="mb-2 text-sm font-semibold text-gray-900">
        Table of contents
      </div>

      {items.length > 0 ? (
        <ol className="m-0 list-none space-y-1 p-0 text-sm">
          {items.map((item) => (
            <li
              key={`${item.id}-${item.index}`}
              style={{ paddingLeft: `${Math.max(item.level - 1, 0) * 16}px` }}
            >
              <button
                type="button"
                className="text-left text-blue-700 hover:underline"
                onClick={() => scrollToHeading(editor, item)}
              >
                <span className="mr-1 text-gray-500">{item.index}</span>
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-gray-500">
          Add headings to the article and they will appear here.
        </p>
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContentsBlock = Node.create({
  name: "tableOfContentsBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'section[data-type="table-of-contents"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-type": "table-of-contents",
        class: "kb-table-of-contents",
      }),
      ["h1", "Table of contents"],
      ["p", "This table of contents is generated from the article headings."],
    ];
  },

  addCommands() {
    return {
      insertTableOfContentsBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsBlockView);
  },
});
