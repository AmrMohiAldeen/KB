import type { JSONContent } from '@tiptap/core';
import type {
  Node as ProseMirrorNode,
  Schema,
} from '@tiptap/pm/model';
import { CALLOUT_NODE_NAME } from './callout/model';

export const TABS_NODE_NAME = 'tabs';
export const TAB_ITEM_NODE_NAME = 'tabItem';
export const ACCORDION_NODE_NAME = 'accordion';
export const ACCORDION_ITEM_NODE_NAME = 'accordionItem';
export const CONTENT_BLOCK_CONTAINER_NODE_NAMES = [
  TABS_NODE_NAME,
  ACCORDION_NODE_NAME,
] as const;
export const DRAGGABLE_CONTENT_BLOCK_NODE_NAMES = [
  ...CONTENT_BLOCK_CONTAINER_NODE_NAMES,
  CALLOUT_NODE_NAME,
] as const;

// Keeps pathological pasted values bounded without constraining normal titles.
export const MAX_ITEM_LABEL_LENGTH = 2_000;

export type ContentBlockItemIdPrefix = 'accordion' | 'tab';
export type ContentBlockContainerNodeName =
  | typeof ACCORDION_NODE_NAME
  | typeof TABS_NODE_NAME;
export type ContentBlockItemNodeName =
  | typeof ACCORDION_ITEM_NODE_NAME
  | typeof TAB_ITEM_NODE_NAME;
export type AccordionItemAttributes = {
  itemId: string | null;
  open: boolean;
  title: string;
};
export type TabItemAttributes = {
  itemId: string | null;
  label: string;
};
export type ContentBlockItemAttributesByNodeName = {
  [ACCORDION_ITEM_NODE_NAME]: AccordionItemAttributes;
  [TAB_ITEM_NODE_NAME]: TabItemAttributes;
};

export function isContentBlockContainerNodeName(
  value: string,
): value is ContentBlockContainerNodeName {
  return CONTENT_BLOCK_CONTAINER_NODE_NAMES.some((name) => name === value);
}

export function isDraggableContentBlockNodeName(value: string): boolean {
  return DRAGGABLE_CONTENT_BLOCK_NODE_NAMES.some((name) => name === value);
}

let fallbackId = 0;

export function createContentBlockItemId(
  prefix: ContentBlockItemIdPrefix,
): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

export function normalizeItemLabel(value: unknown, fallback: string): string {
  const label = typeof value === 'string' ? value.trim() : '';
  return label.slice(0, MAX_ITEM_LABEL_LENGTH) || fallback;
}

export function readContentBlockItemId(
  value: unknown,
  fallback: string,
): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createItemNode(
  schema: Schema,
  typeName: ContentBlockItemNodeName,
  attrs: AccordionItemAttributes | TabItemAttributes,
): ProseMirrorNode | null {
  const item = schema.nodes[typeName];
  const paragraph = schema.nodes.paragraph;
  if (!item || !paragraph) return null;

  return item.create(attrs, paragraph.create());
}

function createTabItemAttributes(label: string): TabItemAttributes {
  return {
    itemId: createContentBlockItemId('tab'),
    label: normalizeItemLabel(label, 'Tab'),
  };
}

export function createTabItem(label: string): JSONContent {
  return {
    type: TAB_ITEM_NODE_NAME,
    attrs: createTabItemAttributes(label),
    content: [{ type: 'paragraph' }],
  };
}

export function createTabItemNode(
  schema: Schema,
  label: string,
): ProseMirrorNode | null {
  return createItemNode(
    schema,
    TAB_ITEM_NODE_NAME,
    createTabItemAttributes(label),
  );
}

export function createTabsContent(): JSONContent {
  return {
    type: TABS_NODE_NAME,
    content: [createTabItem('Tab 1'), createTabItem('Tab 2')],
  };
}

function createAccordionItemAttributes(title: string): AccordionItemAttributes {
  return {
    itemId: createContentBlockItemId('accordion'),
    open: false,
    title: normalizeItemLabel(title, 'Section'),
  };
}

export function createAccordionItem(title: string): JSONContent {
  return {
    type: ACCORDION_ITEM_NODE_NAME,
    attrs: createAccordionItemAttributes(title),
    content: [{ type: 'paragraph' }],
  };
}

export function createAccordionItemNode(
  schema: Schema,
  title: string,
): ProseMirrorNode | null {
  return createItemNode(
    schema,
    ACCORDION_ITEM_NODE_NAME,
    createAccordionItemAttributes(title),
  );
}

export function createAccordionContent(): JSONContent {
  return {
    type: ACCORDION_NODE_NAME,
    content: [
      createAccordionItem('Section 1'),
      createAccordionItem('Section 2'),
    ],
  };
}
