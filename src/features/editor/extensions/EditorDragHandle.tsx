'use client';

import DragHandle from '@tiptap/extension-drag-handle-react';
import type {
  DragHandleRule,
  NestedOptions,
  RuleContext,
} from '@tiptap/extension-drag-handle';
import { useEditorState, type Editor } from '@tiptap/react';
import { CALLOUT_NODE_NAME } from '../contentBlocks/callout/model';
import {
  ACCORDION_ITEM_NODE_NAME,
  ACCORDION_NODE_NAME,
  TAB_ITEM_NODE_NAME,
  TABS_NODE_NAME,
} from '../contentBlocks/model';
import { useTableDragOffset } from '../table/drag/useTableDragOffset';

const EXCLUDE_FROM_DRAG_TARGETS = 1000;
const LIST_ITEM_NODE_NAMES = new Set<string>(['listItem', 'taskItem']);
const TABLE_NODE_NAME = 'table';
const TABLE_INTERNAL_NODE_NAMES = new Set<string>([
  'tableRow',
  'tableCell',
  'tableHeader',
]);
const CUSTOM_CONTAINER_NODE_NAMES = new Set<string>([
  CALLOUT_NODE_NAME,
  ACCORDION_NODE_NAME,
  TABS_NODE_NAME,
]);
const INTERNAL_CONTENT_BLOCK_ITEM_NODE_NAMES = new Set<string>([
  ACCORDION_ITEM_NODE_NAME,
  TAB_ITEM_NODE_NAME,
]);

export type EditorDragHandleRuleInput = {
  nodeName: string;
  parentName?: string | null;
  ancestorNames?: readonly string[];
  isFirst?: boolean;
  isInline?: boolean;
  isText?: boolean;
};

function hasAncestor(
  input: Pick<EditorDragHandleRuleInput, 'ancestorNames'>,
  nodeName: string,
): boolean {
  return input.ancestorNames?.includes(nodeName) ?? false;
}

export function getEditorDragHandleRuleDeduction(
  input: EditorDragHandleRuleInput,
): number {
  if (input.isInline || input.isText) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (
    input.isFirst &&
    input.parentName &&
    LIST_ITEM_NODE_NAMES.has(input.parentName)
  ) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (TABLE_INTERNAL_NODE_NAMES.has(input.nodeName)) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  if (hasAncestor(input, TABLE_NODE_NAME) && input.nodeName !== TABLE_NODE_NAME) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  for (const containerName of CUSTOM_CONTAINER_NODE_NAMES) {
    if (hasAncestor(input, containerName) && input.nodeName !== containerName) {
      return EXCLUDE_FROM_DRAG_TARGETS;
    }
  }

  if (INTERNAL_CONTENT_BLOCK_ITEM_NODE_NAMES.has(input.nodeName)) {
    return EXCLUDE_FROM_DRAG_TARGETS;
  }

  return 0;
}

function getAncestorNodeNames(context: RuleContext): string[] {
  const names: string[] = [];

  for (let depth = 1; depth < context.depth; depth += 1) {
    names.push(context.$pos.node(depth).type.name);
  }

  return names;
}

const knowledgeBaseDragTargetRules: DragHandleRule = {
  id: 'kbOfficialDragTargets',
  evaluate: (context) =>
    getEditorDragHandleRuleDeduction({
      nodeName: context.node.type.name,
      parentName: context.parent?.type.name ?? null,
      ancestorNames: getAncestorNodeNames(context),
      isFirst: context.isFirst,
      isInline: context.node.isInline,
      isText: context.node.isText,
    }),
};

export const EDITOR_DRAG_HANDLE_NESTED_OPTIONS: NestedOptions = {
  defaultRules: false,
  edgeDetection: {
    edges: ['left', 'top'],
    threshold: 24,
    strength: 500,
  },
  rules: [knowledgeBaseDragTargetRules],
};

export function EditorDragHandle({ editor }: { editor: Editor }) {
  const tableDragOffset = useTableDragOffset(editor);
  const isEditable = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      !currentEditor.isDestroyed && currentEditor.isEditable,
  });

  if (!isEditable) return null;

  return (
    <DragHandle
      editor={editor}
      className="kb-block-drag-handle kb-official-drag-handle"
      nested={EDITOR_DRAG_HANDLE_NESTED_OPTIONS}
      onNodeChange={tableDragOffset.onNodeChange}
      onElementDragStart={tableDragOffset.onElementDragStart}
      onElementDragEnd={tableDragOffset.onElementDragEnd}
      computePositionConfig={{
        placement: 'left-start',
        strategy: 'absolute',
      }}
      dragImageProperties={[
        'background-color',
        'border',
        'border-radius',
        'box-shadow',
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'margin',
        'padding',
      ]}
    >
      <span className="sr-only">Drag block</span>
    </DragHandle>
  );
}
