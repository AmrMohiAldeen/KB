# Editor Authoring Blocks

## Callouts

- The `callout` Tiptap node accepts rich `block+` content, so paragraphs, headings,
  lists, tables, tabs, accordions, and nested callouts remain normal schema content.
- Supported variants are `info`, `warning`, `success`, `danger`, and `tip`.
  Imported `error` values normalize to `danger`; unknown values normalize to `info`.
- Use `insertCallout({ variant })` to insert and `setCalloutVariant(variant)` to
  change the active callout. The editor toolbar exposes the variant picker while
  the selection is inside a callout.
- Static HTML uses a semantic `<aside role="note" data-kb-callout>` shell and a
  `data-kb-callout-content` body. It contains no editor-only controls.
- Read-only Tiptap rendering and `generateHTML()` use the same semantic output.
  Include `tiptap-content-blocks.css` in exported pages when matching presentation
  is required.

## Slash Menu

- Typing `/` after whitespace or at the start of a text block opens the menu.
- Search matches labels, command IDs, and keywords. More direct matches rank first.
- Arrow Up/Down changes the active item, Enter or Tab inserts, and Escape dismisses
  the current menu without deleting typed text.
- Modified keys, composition input, code blocks, URLs, and read-only editors do not
  trigger or consume slash-menu behavior.
- The menu currently inserts text, headings, lists, blockquote, divider, code block,
  a default 3 by 3 table, tabs, accordions, and every callout variant.

## Windows Shortcuts

- Standard Tiptap shortcuts remain available: Ctrl+B, Ctrl+I, Ctrl+U,
  Ctrl+Shift+S, Ctrl+E, Ctrl+Shift+7, Ctrl+Shift+8, Ctrl+Z, Ctrl+Y, and
  Ctrl+Shift+Z.
- Font size uses Ctrl+Shift+`>` and Ctrl+Shift+`<`. The implementation accepts the
  Windows `Period`/`Comma` key-code forms and ignores native inputs and modifier
  combinations that would conflict.
- Toolbar labels show the most useful shortcuts. Node-view title inputs keep their
  own typing and focus behavior.

## Paste Handling

- Pasted HTML is normalized before Tiptap parses it into the schema.
- Scripts, embedded/form controls, event attributes, unsafe links, Office metadata,
  comments, and unsupported Word styles are removed.
- Supported inline formatting, safe links, headings, lists, tables, dimensions,
  alignment, and custom `data-kb-*`/`data-table-*` attributes are retained.
- Consecutive Word list paragraphs are converted to semantic ordered or unordered
  lists. Complex Word list nesting is flattened because Word clipboard nesting
  metadata is inconsistent across versions.
- Plain-text paste and Tiptap link-on-paste behavior continue to use Tiptap's normal
  handlers. Read-only editors do not accept paste mutations.

## Intentional Limitations

- Image/media insertion is not shown because this repository has no media node,
  upload/storage contract, or asset picker. Adding a dead slash action would create
  non-serializable content. Register the product media extension and command before
  adding it to the slash catalog.
- Reusable blocks are not shown because no reusable-block provider or identifier
  schema exists yet.
- Callout headings use the stable variant label rather than a custom editable title.

## Manual QA

1. In Chrome and Edge on Windows, type `/`, navigate the full menu with Arrow keys,
   insert with Enter and Tab, then dismiss with Escape.
2. Insert every callout variant, edit nested formatted content, change the variant
   from the toolbar, and verify undo/redo.
3. Paste representative content from current Microsoft Word and Google Docs,
   including nested lists, links, and tables.
4. Load the resulting JSON in `KnowledgeBaseViewer` and compare it with
   `generateHTML()` output using the export stylesheet.
