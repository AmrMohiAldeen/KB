# Slash Command Menu

## Purpose

Provides a `/` menu for quickly inserting editor blocks and formatting structures without using the toolbar.

## User Behavior

Users type `/` to open the menu, then type a query to filter commands.
Arrow keys move selection, `Enter` or `Tab` inserts the active item, `Escape` dismisses the menu, and mouse hover/click also works.

## Schema

No node or mark schema is added.

Extension name: `slashCommandMenu`
It uses a ProseMirror plugin and widget decoration for UI state only.

## Commands

No public editor commands are exposed.

Internally supports inserting:

- Paragraphs
- Headings 1–3
- Bullet, ordered, and task lists
- Blockquotes
- Code blocks
- Horizontal rules
- Tables
- Tabs, accordions, and callouts

Special table syntax:

```txt
/table:4x6
```

Creates a table with 4 rows and 6 columns.

## Rendering

In the editor, the menu is rendered as a floating portaled DOM menu using Floating UI.

Static/export rendering is not affected by this extension. Only the inserted blocks are saved and rendered by their own extensions.

## Storage Impact

The slash menu itself stores nothing in article JSON or backend records.

Only the inserted content is saved, such as heading nodes, table nodes, callout nodes, tabs, or accordions.

## Read-Only Behavior

The menu does not appear when the editor is not editable.

Even if triggered manually, insertion is blocked in read-only mode.

## Edge Cases

The menu does not open:

- Inside code blocks
- When text is selected
- When `/` is part of a word or URL-like text
- When no command matches the query
- After being dismissed at the same cursor position

Keyboard shortcuts with `Ctrl`, `Cmd`, or `Alt` are ignored so normal editor shortcuts still work.

## Tests

Automated tests cover:

- Opening and filtering the menu
- Invalid trigger contexts
- Keyboard navigation and insertion
- Mouse hover and click insertion
- Table dimension insertion
- Read-only behavior
- Portal rendering outside the editor/table DOM
- Menu cleanup when the editor is destroyed
