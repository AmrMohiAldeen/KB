# Glossary

## Purpose

The glossary extension lets authors define organization-specific terms inline inside Knowledge Base articles.

## User Behavior

Authors select text or place the cursor, then use the glossary toolbar control or `/glossary` slash command to insert a term. Hovering or focusing the term shows its definition.

## Schema

Node name: `glossary`

The node is inline, atom-based, and selectable.

Attributes:

```ts
term: string
definition: string
id?: string | null
```

`term` and `definition` are stored as plain sanitized text. `id` is optional and limited to safe short identifiers.

## Commands

```ts
editor.commands.setGlossary({ term, definition, id })
editor.commands.unsetGlossary()
editor.commands.updateGlossary({ term, definition })
```

Write commands return `false` in read-only editors.

## Rendering

Editor and static rendering use a focusable inline `<span>` with `data-kb-glossary-*` attributes, dotted underline styling, `aria-describedby`, and a child `role="tooltip"` span.

The editor NodeView adds hover, focus, and Escape-close behavior. Static/export HTML keeps hover and focus tooltip behavior through CSS without requiring a live editor instance.

## Storage Impact

Glossary data is stored only in Tiptap JSON. No backend tables or media records are required.

## Read-Only Behavior

Read-only viewers cannot modify glossary nodes. The inline term remains focusable and still exposes its definition on hover or focus.

## Edge Cases

Empty `term` or `definition` values are rejected by commands and paste parsing. HTML-like input is stripped to plain text before storage or rendering. Invalid JSON attrs render with safe fallback text.

## Tests

Automated tests cover command insert/update/unset, JSON persistence, static HTML rendering, read-only tooltip markup, invalid attrs, keyboard Escape behavior, toolbar insertion, slash-menu insertion, and paste sanitizer round-trips.
