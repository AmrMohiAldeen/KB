"use client";

import { Check, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
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
};

type IndexedTocItem = TocItem & {
  index: string;
};

const EXCLUDED_HEADING_IDS_ATTRIBUTE = "data-kb-toc-excluded-heading-ids";
const HEADING_NUMBER_PREFIX =
  /^\s*(?:(?:\d+(?:\.\d+)+(?:[.)])?)|(?:\d+[.)])|(?:\d+\s*[-:]))\s+/;

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

function normalizeExcludedHeadingIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  value.forEach((item) => {
    if (typeof item !== "string") return;

    const id = item.trim();
    if (!id || seen.has(id)) return;

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

function parseExcludedHeadingIdsAttribute(value: string | null): string[] {
  if (!value) return [];

  try {
    return normalizeExcludedHeadingIds(JSON.parse(value));
  } catch {
    return normalizeExcludedHeadingIds(value.split(","));
  }
}

function renderExcludedHeadingIdsAttribute(value: unknown) {
  const excludedHeadingIds = normalizeExcludedHeadingIds(value);

  if (excludedHeadingIds.length === 0) return {};

  return {
    [EXCLUDED_HEADING_IDS_ATTRIBUTE]: JSON.stringify(excludedHeadingIds),
  };
}

function normalizeTocHeadingText(text: string): string {
  const trimmed = text.trim();
  const normalized = trimmed.replace(HEADING_NUMBER_PREFIX, "").trim();

  return normalized || trimmed;
}

function getTableOfContentsItems(editor: Editor): TocItem[] {
  const items: TocItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;

    const text = normalizeTocHeadingText(node.textContent);
    if (!text) return;

    const rawLevel = node.attrs.level;
    const level = typeof rawLevel === "number" ? rawLevel : 1;
    const id = getHeadingId(node.attrs, `heading-${pos}`);

    items.push({
      id,
      pos,
      text,
      level,
    });
  });

  return items;
}

function addAutomaticIndexes(items: TocItem[]): IndexedTocItem[] {
  const counters = new Map<number, number>();
  const activeLevels: number[] = [];

  return items.map((item) => {
    for (let index = activeLevels.length - 1; index >= 0; index -= 1) {
      const level = activeLevels[index];

      if (level > item.level) {
        counters.delete(level);
        activeLevels.splice(index, 1);
      }
    }

    counters.set(item.level, (counters.get(item.level) ?? 0) + 1);

    if (!activeLevels.includes(item.level)) {
      activeLevels.push(item.level);
      activeLevels.sort((a, b) => a - b);
    }

    return {
      ...item,
      index: activeLevels
        .filter((level) => level <= item.level)
        .map((level) => String(counters.get(level) ?? 0))
        .join("."),
    };
  });
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
  const { editor, node, updateAttributes } = props;
  const [isEditing, setIsEditing] = useState(false);
  const updateTableOfContentsAttributes = updateAttributes as (attributes: {
    excludedHeadingIds: string[];
  }) => void;

  const items = useEditorState({
    editor,
    selector: ({ editor }) => getTableOfContentsItems(editor),
  });
  const excludedHeadingIds = normalizeExcludedHeadingIds(
    node.attrs.excludedHeadingIds,
  );
  const excludedHeadingIdsSet = useMemo(
    () => new Set(excludedHeadingIds),
    [excludedHeadingIds],
  );
  const visibleItems = useMemo(
    () =>
      addAutomaticIndexes(
        items.filter((item) => !excludedHeadingIdsSet.has(item.id)),
      ),
    [excludedHeadingIdsSet, items],
  );

  const setHeadingIncluded = (id: string, included: boolean) => {
    const availableIds = new Set(items.map((item) => item.id));
    const nextExcludedHeadingIds = included
      ? excludedHeadingIds.filter((headingId) => headingId !== id)
      : [...excludedHeadingIds, id];

    updateTableOfContentsAttributes({
      excludedHeadingIds: normalizeExcludedHeadingIds(
        nextExcludedHeadingIds,
      ).filter((headingId) => availableIds.has(headingId)),
    });
  };

  return (
    <NodeViewWrapper
      data-type="table-of-contents"
      className="my-4 rounded-md border border-gray-200 bg-gray-50 p-3"
      contentEditable={false}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">
          Table of contents
        </div>

        {editor.isEditable && items.length > 0 && (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={
              isEditing
                ? "Finish editing table of contents"
                : "Edit table of contents"
            }
            aria-pressed={isEditing}
            onClick={() => setIsEditing((current) => !current)}
          >
            {isEditing ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isEditing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {isEditing && editor.isEditable && items.length > 0 && (
        <div className="mb-3 rounded border border-gray-200 bg-white p-2">
          <div className="mb-2 text-xs font-semibold text-gray-600">
            Headings
          </div>
          <ul className="m-0 list-none space-y-1 p-0 text-sm">
            {items.map((item) => {
              const isIncluded = !excludedHeadingIdsSet.has(item.id);

              return (
                <li
                  key={`${item.id}-${item.pos}`}
                  style={{
                    paddingLeft: `${Math.max(item.level - 1, 0) * 16}px`,
                  }}
                >
                  <label className="flex min-h-7 cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={isIncluded}
                      aria-label={`Include ${item.text} in table of contents`}
                      onChange={(event) =>
                        setHeadingIncluded(item.id, event.target.checked)
                      }
                    />
                    <span
                      className={
                        isIncluded
                          ? "break-words"
                          : "break-words text-gray-400 line-through"
                      }
                    >
                      {item.text}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visibleItems.length > 0 ? (
        <ol
          className="m-0 list-none space-y-1 p-0 text-sm"
          aria-label="Table of contents"
        >
          {visibleItems.map((item) => (
            <li
              key={`${item.id}-${item.pos}`}
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
      ) : items.length > 0 ? (
        <p className="text-xs text-gray-500">No headings selected.</p>
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

  addAttributes() {
    return {
      excludedHeadingIds: {
        default: [],
        parseHTML: (element) =>
          parseExcludedHeadingIdsAttribute(
            element.getAttribute(EXCLUDED_HEADING_IDS_ATTRIBUTE),
          ),
        renderHTML: (attributes) =>
          renderExcludedHeadingIdsAttribute(attributes.excludedHeadingIds),
      },
    };
  },

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
