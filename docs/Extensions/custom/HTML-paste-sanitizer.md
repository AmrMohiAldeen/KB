# HTML Paste Sanitizer

## Purpose

Sanitizes pasted HTML before it enters the Tiptap editor.

It protects the editor from unsafe HTML, broken Word/Google Docs markup, invalid tables, unsafe links, unsafe styles, and pasted media/base64 content.

## User Behavior

Users can paste from browsers, Word, Google Docs, or copied HTML source.

The extension:

- Sanitizes real `text/html` clipboard content.
- Sanitizes plain text that looks like HTML.
- Leaves normal plain text paste unchanged.
- Does not convert HTML-looking text inside code blocks.

## Schema

No custom schema.

The extension only cleans pasted HTML before Tiptap parses it into the existing editor schema.

Supported pasted structures include:

- Paragraphs
- Headings `h1`–`h4`
- Inline marks such as bold, italic, underline, strike, code, links, color, highlight
- Ordered/unordered/task lists
- Tables
- App-owned KB blocks such as callouts, tabs, and accordions

## Commands

No commands.

Behavior is handled through a ProseMirror `handlePaste` plugin.

## Rendering

The extension does not define rendering.

Sanitized HTML is parsed by Tiptap into editor content. Static/export rendering is handled by the normal editor/export renderers.

## Storage Impact

Only sanitized editor content is stored.

Raw pasted HTML, scripts, unsafe attributes, invalid styles, and raw pasted media HTML are not stored. Media must go through the approved upload/media-reference flow instead of being preserved as pasted HTML or base64.

## Edge Cases

Sanitization flow:

1. Rejects unsupported environments, oversized HTML, too many nodes, or excessive nesting.
2. Parses HTML with `DOMParser`.
3. Removes comments.
4. Normalizes Word/Apple paste noise.
5. Sanitizes unsafe tags and attributes.
6. Normalizes structure, tables, inline runs, highlights, and empty wrappers.
7. Runs a second sanitization pass after normalization.

Rejected or removed content:

- Dangerous tags: `script`, `style`, `iframe`, `object`, `embed`, `svg`, `form`, `input`, `canvas`, `math`, `meta`, `link`, etc.
- Raw media tags: `img`, `video`, `audio`, `picture`, `source`, `track`.
- Namespaced Office tags like `o:p` and `v:shape`.
- Unsafe URLs such as `javascript:`, `data:`, protocol-relative URLs, malformed relative URLs, backslashes, control characters, spaces, quotes, or angle brackets.
- Unsafe CSS such as `url()`, `expression()`, `@import`, `javascript:`, `data:`, `var()`, and `calc()`.
- Arbitrary classes, event handlers, unknown attributes, and editor-breaking attributes.
- Invalid table fragments, invalid spans, invalid row heights, invalid col widths, and invalid colspan/rowspan values.
- Empty meaningless inline wrappers.

Preserved when safe:

- `http`, `https`, `mailto`, and `tel` links.
- Safe link `title`, `target="_blank"` with forced `rel="noopener noreferrer"`.
- Safe text styles: color, background color, font size, line height, font weight, italic, underline, strike, text alignment, list style.
- Safe table metadata: width, offset, borders, cell background, row height, colspan, rowspan, colwidth.
- Safe app-owned KB attributes for callouts, tabs, and accordions.

## Tests

Automated tests cover:

- Empty, plain text, rich HTML, and HTML-looking plain text paste.
- Script/style/event-handler removal.
- Unsafe link rejection and safe link preservation.
- Raw media HTML removal.
- Headings, lists, nested lists, task lists, and inline formatting.
- Word/Google Docs cleanup.
- Table normalization and invalid table cleanup.
- Safe/unsafe style filtering.
- KB callout, tab, and accordion attribute preservation.
- Large paste, too-large paste, too-many-nodes, too-deep HTML, malformed HTML, parser failure, and unsupported DOM environments.
- Tiptap schema round-trip and paste pipeline behavior.

Manual tests should verify paste behavior from Word, Google Docs, browser pages, copied HTML source, and code blocks.
