# Text Direction

## Purpose

The text direction extension stores explicit left-to-right or right-to-left writing direction on supported block nodes. It is intended for Arabic and mixed-language knowledge base content where alignment alone is not enough.

## Supported Nodes

Direction is stored in a `dir` attribute on supported block nodes only:

- `paragraph`, `heading`, `blockquote`
- `orderedList`, `bulletList`, `listItem`
- `taskList`, `taskItem`
- `table`, `tableCell`, `tableHeader`
- `callout`
- `tabs`, `tabItem`
- `accordion`, `accordionItem`

Inline marks do not receive direction attributes.

## Commands

The extension exposes:

```ts
editor.commands.setTextDirection('rtl')
editor.commands.setTextDirection('ltr')
editor.commands.unsetTextDirection()
editor.commands.toggleTextDirection('rtl')
editor.commands.toggleTextDirection('ltr')
```

`auto` is not supported by this project extension. Invalid values are ignored.

## Toolbar Behavior

The toolbar has LTR and RTL buttons beside text alignment. A button is active only when the selected supported direction targets all share that value. Mixed selections show no active direction. In read-only mode the editor does not render the toolbar, so direction controls are unavailable.

## Lists

List containers and list items can store `dir`. Empty cursor changes inside a list target the current list ancestors so markers and nested indentation can mirror through CSS logical properties without rebuilding the list.

When the current selection has a shared explicit direction, toolbar and slash-menu list creation apply that direction to the new list container and item.

List style attributes such as decimal, roman, alpha, disc, circle, and square are not changed by direction commands.

## Tables

Tables and individual cells can store direction. Cell selections update the selected cells only. Selecting the full table updates the table and its cells.

When the current selection has a shared explicit direction, toolbar and slash-menu table creation apply that direction to the new table and cells.

Table column order is not changed in JSON and ProseMirror `TableMap` indexes are not reversed. Project CSS keeps table layout in document order while allowing table-level RTL to flow cell text RTL unless a cell has its own `dir`.

For RTL tables, keyboard cell traversal swaps horizontal direction: `Tab` moves to the previous model cell and `Shift+Tab` moves to the next model cell. Horizontal arrow handling also swaps left and right at table-cell boundaries.

## JSON And Storage

Direction is stored only in Tiptap JSON as:

```json
{
  "type": "paragraph",
  "attrs": {
    "dir": "rtl"
  }
}
```

Unset direction is `null` and does not render a `dir` HTML attribute.

## Paste And Rendering

The paste sanitizer preserves safe `dir="rtl"` and `dir="ltr"` values on supported block HTML tags and removes unsupported values. Tiptap HTML rendering emits `dir` attributes for saved values, so editor, viewer, and generated HTML output share the same stored direction.

## Edge Cases

- Text selections inside a table cell update the current cell.
- Cell selections update selected cells; full-table selections also update the table node.
- Mixed direction selections intentionally show no active toolbar button.
- Direction changes are normal Tiptap transactions and participate in undo/redo.

## Tests

Coverage lives in:

- `src/features/editor/extensions/TextDirection.test.ts`
- `src/features/editor/components/toolbar/EditorToolbar.test.ts`
- `src/features/editor/paste/sanitizePastedHtml.test.ts`
