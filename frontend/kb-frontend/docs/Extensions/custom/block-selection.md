# Block Selection

## Purpose

`BlockSelection` visually highlights full custom blocks when they are included in a text selection.

This makes multi-block selection clearer for large editor components such as tables, images, tabs, accordions, callouts, and other draggable content blocks.

## File

```txt
features/editor/extensions/BlockSelection.ts
```

## CSS Class

```ts
export const SELECTED_BLOCK_CLASS = "kb-block-selection";
```

This class is added to selected block nodes through a ProseMirror node decoration.

The class should be styled in editor CSS to make selected blocks visually obvious.

## Selectable Blocks

The extension only highlights block nodes listed in `SELECTABLE_BLOCK_NODE_NAMES`.

```ts
const SELECTABLE_BLOCK_NODE_NAMES = new Set<string>([
  "table",
  BLOCK_IMAGE_NODE_NAME,
  ...DRAGGABLE_CONTENT_BLOCK_NODE_NAMES, // this includes tabs, accordions & callouts
]);
```

## How It Works

The extension creates a ProseMirror plugin that checks the current editor selection.
If the selection is empty, it does nothing:

```ts
if (from === to) return null;
```

If the selection covers a selectable block completely, the extension adds a node decoration to that block:

```ts
Decoration.node(position, position + node.nodeSize, {
  class: SELECTED_BLOCK_CLASS,
});
```

This does not change the document content. It only changes how the selected block is displayed in the editor.

## Selection Rule

A block is highlighted only when the selection fully covers it:

```ts
from <= position && to >= position + node.nodeSize;
```

This avoids highlighting a block when the user only partially selects content near it.

## Storage Impact

This extension does not add nodes, marks, attributes, or saved content.

It only adds temporary editor decorations while the user is selecting content.

Nothing from this extension is stored in Tiptap JSON or rendered HTML.

## Notes

Keep this extension registered after the block and table extensions so all selectable node names already exist in the editor schema.

If a new custom block should visually highlight during selection, add its node name to `DRAGGABLE_CONTENT_BLOCK_NODE_NAMES` or directly to `SELECTABLE_BLOCK_NODE_NAMES`.
