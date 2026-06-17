# Tiptap editor extension integration

Verified on 2026-06-16 against Tiptap 3.26.0 package metadata and current
Tiptap docs.

## Public npm extensions installed

- Drag Handle React: `@tiptap/extension-drag-handle-react` with
  `@tiptap/extension-drag-handle`, `@tiptap/extension-node-range`, and the
  DragHandle peer packages. These packages are public npm packages and MIT
  licensed. Collaboration peer packages are installed for dependency
  resolution only; the Collaboration extension is not registered.
- File Handler: `@tiptap/extension-file-handler`, public npm, MIT. This
  handles paste/drop events only. It does not upload files by itself, so the
  editor keeps it inactive until an upload adapter is provided.
- Mathematics: `@tiptap/extension-mathematics` plus `katex@0.16.x`, public
  npm, MIT. KaTeX CSS is imported globally for rendering.
- Selection and CharacterCount: imported from `@tiptap/extensions`, public
  npm, MIT.

## Intentional skips and blockers

- Comments: feature-flagged off. Official package is
  `@tiptap-pro/extension-comments`, available from the Start plan and Tiptap's
  private npm registry. It also needs a document server/provider.
- Import/Export: feature-flagged off. Tiptap Conversion extensions are Pro
  packages from the private npm registry. Import needs conversion credentials
  and schema/UX work; export packages also need product-specific export UX.
- Pages: feature-flagged off. Official packages are private-registry Pro
  packages, available in the Team plan, and require a Pages-compatible schema
  stack.
- Paste Handler: feature-flagged off. It is a Team/private-registry extension.
  The current editor keeps the existing `PasteSanitizer` as the single paste
  transformation path.

The feature flags and blocker strings live in
`src/features/editor/extensions/editorFeatureFlags.ts`.

## Drag handle support notes

- Supported direct official DragHandle targets: paragraphs, headings,
  list items, list containers near the list edge, tables, callouts, tab
  containers, and accordion containers.
- Tables use the same official DragHandle for vertical block movement and
  table-specific horizontal offset preview/commit. Horizontal dragging updates
  `tableOffsetPct` and is constrained by the current table width.
- Table rows, table cells, and table headers intentionally fall back to the
  table container. Direct row/cell dragging needs table-specific UI and is not
  handled by the generic official DragHandle.
- Tab items and accordion items intentionally fall back to their outer
  container. Reordering individual items should be implemented in the
  corresponding node views so labels, ids, and open/active state stay coherent.
