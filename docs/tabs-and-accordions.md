# Tabs and Accordions

## Data model

- `tabs` contains one or more `tabItem` nodes.
- `accordion` contains one or more `accordionItem` nodes.
- Item bodies use `block+`, so headings, lists, tables, formatted paragraphs, and other block nodes remain normal ProseMirror content.
- Labels and titles are attributes capped at 2,000 characters to bound pathological pasted values without constraining normal content. Empty values fall back to `Tab` or `Section`.
- Item IDs are generated on insertion and retained through JSON/HTML serialization. Legacy imported items may have no ID, and duplicate IDs are disambiguated locally in the read-only tab view.

## Rendering

- Editor Tiptap instances show tabs as stacked title/body cards so every panel is directly editable. Read-only Tiptap instances use a horizontal tab switcher.
- Static HTML uses labeled `<section>` elements for tabs and native `<details>/<summary>` elements for accordions.
- Static tab HTML intentionally shows every panel. This keeps exports readable without JavaScript.
- Accordion `open` state is persisted; the active tab is intentionally local viewer/editor UI state.

## Editing behavior

- Tabs use stacked cards with editable title rows, collapsible bodies, contextual action menus for move/remove operations, and a small list-level add button.
- While editing a tab label, use Alt+Up/Alt+Down to reorder tabs; plain arrow keys move the text caret.
- Accordions use separate rounded cards, wrapped inline title editing, circular right-side chevrons, contextual action menus for move/remove operations, a list-level add button, and persisted expand/collapse.
- Accordion expand/collapse persists without adding an undo/redo history step.
- Selecting a tabs, accordion, or table block highlights it in blue; Select All highlights every selected block.
- Tabs and accordions use the shared block drag handle and vertical move transaction used by other draggable editor blocks.
- Title and action-control interactions activate the enclosing content block, dismiss stale table controls, and return focus to the editor after mutations so undo/redo works immediately.
- Item action menus support Arrow Up/Down, Home, End, and Escape.
- The schema and controls prevent deleting the final item.
- Toolbar insertion is under **Insert content block**.
- Typing `/tabs` or `/accordion` opens the slash menu. Arrow keys choose an item, Enter/Tab inserts it, and Escape dismisses the current menu.

## Edge cases

- Compound items are isolating nodes so Backspace/Delete cannot accidentally merge content across item boundaries.
- Pasted legacy HTML without item IDs remains readable; controls use a positional fallback until the content is edited/reinserted.
- Read-only viewers omit all mutation controls but keep tab switching and native accordion toggling.
- Reordering swaps only the adjacent pair in one transaction, so it is one undo step and unaffected item controls remain stable.
- Very large item counts remain valid; consider an application-level item limit if the product requires one.
- Long tab labels truncate in read-only tab pills and retain the full value in the tooltip. Editor tab labels and accordion titles wrap while editing.
- Static export styling should include `tiptap-content-blocks.css` when the exported page should match the in-app presentation.
