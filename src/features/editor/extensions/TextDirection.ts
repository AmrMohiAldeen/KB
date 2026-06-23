import { Extension } from '@tiptap/core';
import type {
  Node as ProseMirrorNode,
  ResolvedPos,
} from '@tiptap/pm/model';
import {
  NodeSelection,
  type EditorState,
  type Selection,
  type Transaction,
} from '@tiptap/pm/state';
import { CellSelection, selectedRect } from '@tiptap/pm/tables';

export const TEXT_DIRECTION_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'orderedList',
  'bulletList',
  'listItem',
  'taskList',
  'taskItem',
  'table',
  'tableCell',
  'tableHeader',
  'callout',
  'tabs',
  'tabItem',
  'accordion',
  'accordionItem',
] as const;

export const TEXT_DIRECTION_VALUES = ['ltr', 'rtl'] as const;

export type TextDirection = (typeof TEXT_DIRECTION_VALUES)[number];
export type TextDirectionSelectionValue = TextDirection | '' | null;

type DirectionTarget = {
  node: ProseMirrorNode;
  pos: number;
};

const LIST_DIRECTION_NODE_TYPES = new Set([
  'orderedList',
  'bulletList',
  'listItem',
  'taskList',
  'taskItem',
]);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textDirectionControl: {
      toggleTextDirection: (direction: TextDirection) => ReturnType;
    };
  }
}

export function normalizeTextDirection(value: unknown): TextDirection | null {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  return TEXT_DIRECTION_VALUES.some((direction) => direction === normalized)
    ? (normalized as TextDirection)
    : null;
}

function nodeSupportsTextDirection(node: ProseMirrorNode): boolean {
  return Object.prototype.hasOwnProperty.call(node.attrs, 'dir');
}

function isTableCellNode(node: ProseMirrorNode): boolean {
  return node.type.spec.tableRole === 'cell' ||
    node.type.spec.tableRole === 'header_cell';
}

function isTableNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'table' || node.type.spec.tableRole === 'table';
}

function addTarget(
  targets: Map<number, DirectionTarget>,
  node: ProseMirrorNode | null | undefined,
  pos: number,
): void {
  if (!node || !nodeSupportsTextDirection(node)) return;

  targets.set(pos, { node, pos });
}

function addTableAndCells(
  targets: Map<number, DirectionTarget>,
  table: ProseMirrorNode,
  tablePos: number,
): void {
  addTarget(targets, table, tablePos);

  table.descendants((node, pos) => {
    if (isTableCellNode(node)) {
      addTarget(targets, node, tablePos + 1 + pos);
    }
    return true;
  });
}

function addSelectedFullTable(
  targets: Map<number, DirectionTarget>,
  state: EditorState,
): void {
  try {
    const rect = selectedRect(state);
    const isWholeTable =
      rect.left === 0 &&
      rect.top === 0 &&
      rect.right === rect.map.width &&
      rect.bottom === rect.map.height;

    if (!isWholeTable) return;

    addTarget(targets, rect.table, rect.tableStart - 1);
  } catch {
    // Not every selection has a selected table rectangle.
  }
}

function findAncestorTargetAtPos(
  $pos: ResolvedPos,
  predicate: (node: ProseMirrorNode) => boolean,
): DirectionTarget | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);

    if (predicate(node) && nodeSupportsTextDirection(node)) {
      return { node, pos: $pos.before(depth) };
    }
  }

  return null;
}

function findAncestorTarget(
  selection: Selection,
  predicate: (node: ProseMirrorNode) => boolean,
): DirectionTarget | null {
  return findAncestorTargetAtPos(selection.$from, predicate);
}

function findContainingCell(selection: Selection): DirectionTarget | null {
  const fromCell = findAncestorTargetAtPos(selection.$from, isTableCellNode);
  const toCell = findAncestorTargetAtPos(selection.$to, isTableCellNode);

  return fromCell && toCell && fromCell.pos === toCell.pos ? fromCell : null;
}

function addListAncestors(
  targets: Map<number, DirectionTarget>,
  selection: Selection,
): void {
  const { $from } = selection;

  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth);

    if (LIST_DIRECTION_NODE_TYPES.has(node.type.name)) {
      addTarget(targets, node, $from.before(depth));
    }
  }
}

function addCurrentBlockTarget(
  targets: Map<number, DirectionTarget>,
  selection: Selection,
): void {
  const textBlock = findAncestorTarget(selection, (node) => node.isTextblock);
  if (textBlock) {
    addTarget(targets, textBlock.node, textBlock.pos);
    return;
  }

  const nearestSupported = findAncestorTarget(
    selection,
    (node) => !node.isText,
  );
  if (nearestSupported) addTarget(targets, nearestSupported.node, nearestSupported.pos);
}

export function collectTextDirectionTargets(
  state: EditorState,
): DirectionTarget[] {
  const targets = new Map<number, DirectionTarget>();
  const { doc, selection } = state;

  if (selection instanceof CellSelection) {
    selection.forEachCell((cell, pos) => addTarget(targets, cell, pos));
    addSelectedFullTable(targets, state);
    return Array.from(targets.values());
  }

  if (selection instanceof NodeSelection) {
    if (selection.node.type.name === 'table') {
      addTableAndCells(targets, selection.node, selection.from);
    } else {
      addTarget(targets, selection.node, selection.from);
    }
    return Array.from(targets.values());
  }

  const containingCell = findContainingCell(selection);
  if (containingCell) {
    addTarget(targets, containingCell.node, containingCell.pos);
    return Array.from(targets.values());
  }

  if (selection.empty) {
    addListAncestors(targets, selection);
    if (targets.size === 0) addCurrentBlockTarget(targets, selection);
    return Array.from(targets.values());
  }

  selection.ranges.forEach((range) => {
    doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      addTarget(targets, node, pos);
      return true;
    });
  });

  if (targets.size === 0) addCurrentBlockTarget(targets, selection);

  return Array.from(targets.values());
}

export function readSharedTextDirection(
  state: EditorState,
): TextDirectionSelectionValue {
  const targets = collectTextDirectionTargets(state);
  let sharedValue: TextDirectionSelectionValue | undefined;

  for (const target of targets) {
    const value = normalizeTextDirection(target.node.attrs.dir) ?? '';

    if (sharedValue === undefined) {
      sharedValue = value;
      continue;
    }

    if (sharedValue !== value) return null;
  }

  return sharedValue ?? '';
}

export function readInheritedTextDirection(state: EditorState): TextDirection | null {
  const direction = readSharedTextDirection(state);

  return direction === 'ltr' || direction === 'rtl' ? direction : null;
}

export function applyTextDirectionToTable(
  tr: Transaction,
  table: ProseMirrorNode,
  tablePos: number,
  direction: TextDirection,
): boolean {
  const targets = new Map<number, DirectionTarget>();

  addTableAndCells(targets, table, tablePos);

  targets.forEach(({ node, pos }) => {
    if (normalizeTextDirection(node.attrs.dir) === direction) return;

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      dir: direction,
    });
  });

  return targets.size > 0;
}

export function applyTextDirectionToActiveTable(
  tr: Transaction,
  direction: TextDirection,
): boolean {
  if (
    tr.selection instanceof NodeSelection &&
    isTableNode(tr.selection.node)
  ) {
    return applyTextDirectionToTable(
      tr,
      tr.selection.node,
      tr.selection.from,
      direction,
    );
  }

  const tableTarget = findAncestorTargetAtPos(tr.selection.$from, isTableNode);
  if (!tableTarget) return false;

  return applyTextDirectionToTable(
    tr,
    tableTarget.node,
    tableTarget.pos,
    direction,
  );
}

function applyTextDirection(
  state: EditorState,
  direction: TextDirection | null,
): boolean {
  const { tr } = state;
  const targets = collectTextDirectionTargets(state);

  targets.forEach(({ node, pos }) => {
    if (normalizeTextDirection(node.attrs.dir) === direction) return;

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      dir: direction,
    });
  });

  return targets.length > 0;
}

export const TextDirectionExtension = Extension.create({
  name: 'textDirectionControl',

  // Core Tiptap registers broad text-direction commands first; lower priority
  // lets these editor-specific commands override them during command merging.
  priority: 1,

  addGlobalAttributes() {
    return [
      {
        types: [...TEXT_DIRECTION_NODE_TYPES],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeTextDirection(element.getAttribute('dir')),
            renderHTML: (attributes) => {
              const direction = normalizeTextDirection(attributes.dir);
              return direction ? { dir: direction } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction: TextDirection | 'auto') =>
        ({ editor, state }) => {
          const normalized = normalizeTextDirection(direction);
          if (!editor.isEditable || !normalized) return false;

          return applyTextDirection(state, normalized);
        },

      unsetTextDirection:
        () =>
        ({ editor, state }) => {
          if (!editor.isEditable) return false;

          return applyTextDirection(state, null);
        },

      toggleTextDirection:
        (direction: TextDirection) =>
        ({ editor, state }) => {
          const normalized = normalizeTextDirection(direction);
          if (!editor.isEditable || !normalized) return false;

          return applyTextDirection(
            state,
            readSharedTextDirection(state) === normalized ? null : normalized,
          );
        },
    };
  },
});
