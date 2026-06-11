import type { JSONContent } from '@tiptap/core';

export const TABS_NODE_NAME = 'tabs';
export const TAB_ITEM_NODE_NAME = 'tabItem';
export const ACCORDION_NODE_NAME = 'accordion';
export const ACCORDION_ITEM_NODE_NAME = 'accordionItem';

// Keeps pathological pasted values bounded without constraining normal titles.
export const MAX_ITEM_LABEL_LENGTH = 2_000;

let fallbackId = 0;

export function createContentBlockItemId(prefix: 'tab' | 'accordion'): string {
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

export function createTabItem(label: string): JSONContent {
  return {
    type: TAB_ITEM_NODE_NAME,
    attrs: {
      itemId: createContentBlockItemId('tab'),
      label: normalizeItemLabel(label, 'Tab'),
    },
    content: [{ type: 'paragraph' }],
  };
}

export function createTabsContent(): JSONContent {
  return {
    type: TABS_NODE_NAME,
    content: [createTabItem('Tab 1'), createTabItem('Tab 2')],
  };
}

export function createAccordionItem(title: string): JSONContent {
  return {
    type: ACCORDION_ITEM_NODE_NAME,
    attrs: {
      itemId: createContentBlockItemId('accordion'),
      title: normalizeItemLabel(title, 'Section'),
      open: false,
    },
    content: [{ type: 'paragraph' }],
  };
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
