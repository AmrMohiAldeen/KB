# Adding a New Editor Extension

## Purpose

This guide explains how to add a new editor extension to the Knowledge Base editor.

The editor uses Tiptap on top of ProseMirror. A new editor feature should be implemented at the correct layer: node, mark, attribute, command, plugin, decoration, NodeView, or TableView customization.

Use this guide when adding features such as callouts, custom media blocks, reusable blocks, comment anchors, suggestion behavior, custom table behavior, paste handling, keyboard shortcuts, slash-command insertions, or toolbar actions.

## Project Context

The Knowledge Base editor is a production feature, not a simple text area.

Current assumptions:

- Frontend: Next.js, React, TypeScript.
- Editor: Tiptap.
- Backend: ASP.NET Core Web API.
- Database: SQL Server
- Editing model: lock-based editing. One user edits a draft at a time.
- No real-time collaborative editing in the current version.
- Autosave still exists, but it saves the current locked user's draft with optimistic concurrency protection.

An editor extension must respect:

- read-only mode,
- article locks,
- role permissions,
- autosave,
- undo/redo,
- export rendering,
- paste/import behavior,
- large article performance,
- media reference rules,
- version snapshot stability.

## Before Adding an Extension

Before writing code, answer these questions:

1. Is this feature saved into article content?
2. Is it only temporary editor UI?
3. Does it affect export to HTML/PDF?
4. Does it need backend storage or media upload APIs?
5. Does it need toolbar or slash-command UI?
6. Does it need keyboard shortcuts?
7. Does it need to work inside tables, tabs, accordions, and nested blocks?
8. Does it behave correctly in read-only mode?
9. Does it need tests for paste/import/export?
10. Does it introduce security risk, such as unsafe HTML, unsafe URLs, or unvalidated uploads?

## Choosing the Correct Tiptap Layer

| Requirement | Use |
|---|---|
| New saved block, such as callout, accordion, media block, reusable block | Node extension |
| New inline formatting, such as comment anchor, suggestion mark, custom annotation | Mark extension |
| Extra saved data on an existing node or mark | Attribute |
| Toolbar/slash-menu/keyboard action | Command |
| Actual document modification | Transaction |
| Commit a transaction | Dispatch |
| Paste/drop/DOM event/automatic low-level behavior | ProseMirror plugin |
| Temporary visual UI that should not be saved | Decoration |
| Complex interactive editor rendering | NodeView |
| Advanced table DOM behavior | Extend Tiptap `TableView` |


Rule:

> Saved article data belongs in nodes, marks, or attributes. Temporary editor visuals belong in decorations or plugin state.

## Recommended File Structure

Use a feature-based structure. Keep extension logic separate from toolbar UI.



Suggested rule:

- `extensions/<feature>/<Feature>.ts` defines the Tiptap extension.
- `extensions/<feature>/<Feature>NodeView.ts` contains custom editor DOM if needed.
- `extensions/<feature>/<featureUtils>.ts` contains pure helpers.
- `components/EditorToolbar.tsx` only calls commands; it should not contain the extension's internal logic.
- `extensions/index.ts` exports and registers editor extensions in one place.

## Naming Rules

Use consistent names:

```ts
export const CALLOUT_NODE_NAME = 'callout';
export const Callout = Node.create({ name: CALLOUT_NODE_NAME });
```

For custom attributes, prefer explicit names:

```ts
variant
caption
mediaId
storagePath
alignment
widthPct
anchorData
```

For persisted HTML, prefer `data-kb-*` attributes:

```html
<section data-kb-callout data-kb-callout-variant="warning"></section>
```

This makes exported HTML easier to identify, sanitize, import, and debug.

## Basic Extension Skeleton

Use this for behavior that does not create a new node or mark.

```ts
import { Extension } from '@tiptap/core';

export const ExampleExtension = Extension.create({
  name: 'exampleExtension',

  addCommands() {
    return {
      doSomething:
        () =>
        ({ editor }) => {
          if (!editor.isEditable) return false;

          // editor action here
          return true;
        },
    };
  },
});
```

Add TypeScript command declarations when exposing commands:

```ts
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    exampleExtension: {
      doSomething: () => ReturnType;
    };
  }
}
```

Without the declaration, the command may work at runtime but TypeScript will not recognize it.

## Adding a New Block Node

Use a node when the feature is a saved structural document block.

Examples:

- callout,
- accordion,
- tabs,
- media block,
- reusable block,
- embedded object,
- custom section.

### Node Skeleton

```ts
import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_NODE_NAME = 'callout';

export type CalloutVariant = 'info' | 'warning' | 'success' | 'danger';

export const Callout = Node.create({
  name: CALLOUT_NODE_NAME,

  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) =>
          element.getAttribute('data-kb-callout-variant') ?? 'info',
        renderHTML: (attributes) => ({
          'data-kb-callout-variant': attributes.variant,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-kb-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-callout',
        'data-kb-callout': '',
      }),
      0,
    ];
  },
});
```

Important fields:

- `group: 'block'`: allows the node to behave like a block-level document element.
- `content: 'block+'`: allows nested block content inside it.
- `defining: true`: marks the node as structurally meaningful.
- `isolating: true`: prevents editing commands from accidentally crossing the node boundary.
- `draggable: true`: allows block-level dragging when drag behavior is enabled.
- `parseHTML`: controls import/paste parsing.
- `renderHTML`: controls static output for viewing/export.
- `0`: tells Tiptap where child content should render.

## Adding Attributes

Use attributes for saved metadata on a node or mark.

Attribute shape:

```ts
attributeName: {
  default: defaultValue,
  parseHTML: (element) => valueFromHTML,
  renderHTML: (attributes) => htmlAttributes,
}
```

Example:

```ts
alignment: {
  default: 'center',
  parseHTML: (element) => element.getAttribute('data-kb-align') ?? 'center',
  renderHTML: (attributes) => ({
    'data-kb-align': attributes.alignment,
  }),
},
```

Use normalization helpers for values that can be invalid:

```ts
function normalizeAlignment(value: unknown): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'right' || value === 'center'
    ? value
    : 'center';
}
```

Then use it in parsing and rendering:

```ts
alignment: {
  default: 'center',
  parseHTML: (element) => normalizeAlignment(element.getAttribute('data-kb-align')),
  renderHTML: (attributes) => ({
    'data-kb-align': normalizeAlignment(attributes.alignment),
  }),
},
```

## Adding Commands

Commands expose reusable actions to toolbar buttons, slash commands, keyboard shortcuts, and tests.

### Command Type Declaration

```ts
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (variant?: CalloutVariant) => ReturnType;
      setCalloutVariant: (variant: CalloutVariant) => ReturnType;
    };
  }
}
```

### Insert Command

```ts
addCommands() {
  return {
    insertCallout:
      (variant = 'info') =>
      ({ commands, editor }) => {
        if (!editor.isEditable) return false;

        return commands.insertContent({
          type: CALLOUT_NODE_NAME,
          attrs: { variant },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Write callout text here...' }],
            },
          ],
        });
      },
  };
},
```

### Update Attribute Command

```ts
setCalloutVariant:
  (variant) =>
  ({ commands, editor }) => {
    if (!editor.isEditable) return false;

    return commands.updateAttributes(CALLOUT_NODE_NAME, { variant });
  },
```

Command rules:

- Write commands must check `editor.isEditable`.
- Commands should return `true` when handled and `false` when not possible.
- Keep business logic out of React components.
- Prefer commands over duplicating editor transaction logic in toolbar buttons.

## Using Transactions and Dispatch

Use transactions when commands need lower-level document changes.

Basic pattern:

```ts
myCommand:
  () =>
  ({ state, tr, dispatch, editor }) => {
    if (!editor.isEditable) return false;

    tr.insertText('Hello');

    if (dispatch) {
      dispatch(tr);
    }

    return true;
  },
```

`tr` prepares the change. `dispatch(tr)` commits it.

`dispatch` can be undefined when Tiptap is only checking whether a command can run. For that reason, do not assume it always exists.

## Adding Keyboard Shortcuts

Keyboard shortcuts belong inside the extension when they are editor behavior.

```ts
addKeyboardShortcuts() {
  return {
    'Mod-Alt-C': () => {
      if (!this.editor.isEditable) return false;
      return this.editor.commands.insertCallout('info');
    },
  };
},
```

When extending an existing extension, preserve parent shortcuts:

```ts
addKeyboardShortcuts() {
  return {
    ...this.parent?.(),
    'Mod-Alt-C': () => this.editor.commands.insertCallout('info'),
  };
},
```

## Adding a NodeView

Use a NodeView when the block needs custom interactive editor UI.

Examples:

- inline controls,
- add/remove buttons,
- resize handles,
- editable title area,
- type dropdown,
- custom media preview,
- nested editable content area.

Do not use a NodeView only for static styling. Use `renderHTML` and CSS for that.

### NodeView Skeleton

```ts
import type { NodeViewRendererProps } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';

export function createCalloutNodeView(props: NodeViewRendererProps): NodeView {
  const dom = document.createElement('section');
  const toolbar = document.createElement('div');
  const contentDOM = document.createElement('div');

  dom.className = 'kb-callout';
  toolbar.className = 'kb-callout__toolbar';
  toolbar.contentEditable = 'false';
  contentDOM.className = 'kb-callout__content';

  dom.append(toolbar, contentDOM);

  return {
    dom,
    contentDOM,

    update(updatedNode) {
      return updatedNode.type === props.node.type;
    },

    stopEvent(event) {
      return toolbar.contains(event.target as Node);
    },

    ignoreMutation(mutation) {
      return !contentDOM.contains(mutation.target);
    },

    destroy() {
      // Remove event listeners, observers, timers, or subscriptions here.
    },
  };
}
```

Attach it to the node:

```ts
addNodeView() {
  return createCalloutNodeView;
},
```

NodeView rules:

- `dom` is the root editor DOM for the node.
- `contentDOM` is where ProseMirror renders editable child content.
- UI controls must use `contentEditable = 'false'`.
- `stopEvent` should stop ProseMirror from handling clicks on custom controls.
- `ignoreMutation` must not hide mutations inside editable content.
- `destroy` must clean up side effects.

## Adding a Mark Extension

Use a mark when the feature is inline and applies to text.

Examples:

- comment anchor,
- suggestion mark,
- mention,
- inline status label,
- custom annotation.

Skeleton:

```ts
import { Mark, mergeAttributes } from '@tiptap/core';

export const COMMENT_MARK_NAME = 'commentAnchor';

export const CommentAnchor = Mark.create({
  name: COMMENT_MARK_NAME,

  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-kb-comment-id'),
        renderHTML: (attributes) => ({
          'data-kb-comment-id': attributes.commentId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-kb-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-comment-anchor',
      }),
      0,
    ];
  },
});
```

Important:

- Use marks for inline ranges.
- Use nodes for block structures.
- For comments/suggestions, the mark should usually store an ID or anchor reference, not the full comment body.
- The actual comment/suggestion record belongs to backend storage.

## Adding a ProseMirror Plugin

Use a plugin for low-level automatic editor behavior.

Good plugin use cases:

- paste handling,
- drop handling,
- DOM events,
- decorations,
- transaction hooks,
- automatic formatting behavior,
- selection behavior,
- custom keyboard handling that needs state.

Skeleton:

```ts
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export const ExamplePluginExtension = Extension.create({
  name: 'examplePluginExtension',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            if (!view.editable) return false;

            // custom paste behavior
            return false;
          },
        },
      }),
    ];
  },
});
```

Return values matter:

- `true`: event was handled; stop default behavior.
- `false`: event was not handled; let other handlers/default behavior continue.
- `null`: often used in transaction hooks to mean no follow-up transaction.

## Adding Decorations

Use decorations for temporary visuals that should not be saved into article JSON.

Examples:

- selected block outline,
- search highlight,
- drop indicator,
- resize preview,
- comment hover highlight,
- validation warning.

Skeleton:

```ts
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const ExampleDecorations = Extension.create({
  name: 'exampleDecorations',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            // Add Decoration.node or Decoration.inline here.

            return decorations.length > 0
              ? DecorationSet.create(state.doc, decorations)
              : null;
          },
        },
      }),
    ];
  },
});
```

Do not use decorations for saved properties like callout type, table width, image caption, or accordion state.

## Extending an Existing Tiptap Extension

Use `.extend()` when Tiptap already provides the base feature.

Example: customizing the table extension.

```ts
import { Table } from '@tiptap/extension-table';

export const KnowledgeBaseTable = Table.extend({
  name: 'table',
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidthPct: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute('data-table-width-pct') ?? 100),
        renderHTML: (attributes) => ({
          'data-table-width-pct': String(attributes.tableWidthPct),
          style: `width: ${attributes.tableWidthPct}%;`,
        }),
      },
    };
  },
});
```

Important:

```ts
...this.parent?.()
```

This preserves the original extension behavior. Without it, you may accidentally remove existing Tiptap attributes, shortcuts, commands, or behavior.

## Extending TableView

Use a custom `TableView` when saved table attributes must be applied to the real editor table DOM.

This is needed because the table extension controls its own live DOM.

Skeleton:

```ts
import { Table, TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

class KnowledgeBaseTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.applyStoredAttributes(node);
  }

  update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);
    if (updated) this.applyStoredAttributes(node);
    return updated;
  }

  private applyStoredAttributes(node: ProseMirrorNode): void {
    const width = Number(node.attrs.tableWidthPct ?? 100);
    this.table.dataset.tableWidthPct = String(width);
    this.table.style.width = `${width}%`;
  }
}

export const KnowledgeBaseTable = Table.extend({
  // table config
}).configure({
  View: KnowledgeBaseTableView,
});
```

Use this for:

- table width,
- table horizontal offset,
- custom borders,
- live DOM behavior not handled by normal `renderHTML`.

## Registering the Extension

Add the extension to the editor extension list.

Example:

```ts
import { Callout } from './callout/Callout';

export const editorExtensions = [
  StarterKit,
  // other extensions...
  Callout,
];
```

If the project uses a factory function:

```ts
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      // config
    }),
    Callout,
  ];
}
```

Registration rules:

- Register schema extensions before features that depend on them.
- Avoid duplicate extension names.
- If extending a built-in extension, replace the original extension instead of registering both.
- Keep extension order intentional, especially for paste handling, keyboard shortcuts, and marks.

## Adding Toolbar Integration

Toolbar components should call commands. They should not implement document transformation logic directly.

Good:

```tsx
<button
  type="button"
  disabled={!toolbarState.isEditable}
  onClick={() => editor.chain().focus().insertCallout('info').run()}
>
  Callout
</button>
```

Avoid:

```tsx
// Bad: complex ProseMirror transaction logic directly inside the toolbar component.
```

Toolbar checklist:

- Hide or disable controls when `editor.isEditable` is false.
- Use `editor.chain().focus()` before commands that modify content.
- Update toolbar active state through shared toolbar state helpers.
- Do not directly mutate editor DOM.

## Adding Slash Command Integration

If the feature can be inserted as a block, add it to the slash-command menu.

Example item shape:

```ts
{
  title: 'Callout',
  description: 'Insert a highlighted notice block',
  keywords: ['notice', 'info', 'warning'],
  command: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertCallout('info')
      .run();
  },
}
```

Slash command rules:

- Delete the slash trigger range before inserting the block.
- Check read-only mode where the command is implemented.
- Keep slash command entries small; call editor commands instead of duplicating logic.

## Adding Paste / Import Support

If users may paste or import this feature from HTML, implement `parseHTML` carefully.

Example:

```ts
parseHTML() {
  return [
    { tag: 'section[data-kb-callout]' },
    { tag: 'div.callout' }, // optional legacy import support
  ];
}
```

Rules:

- Prefer `data-kb-*` attributes for reliable import/export.
- Normalize unsafe or invalid values.
- Do not trust pasted HTML.
- Do not allow scripts, event handlers, unsafe URLs, or dangerous styles.
- Keep sanitizer behavior separate from node parsing logic.
- Test paste from Word, copied HTML, and internal editor copy/paste.

## Adding Static Rendering / Export Support

Every saved editor feature must render correctly outside the editor.

This matters for:

- published article viewing,
- PDF export,
- HTML export,
- version history preview,
- search plain-text extraction,
- restore.

For simple nodes, `renderHTML` may be enough.

For interactive blocks, define export behavior clearly:

| Editor Feature | Static HTML/PDF Strategy |
|---|---|
| Accordion | Render as expanded sections or `<details>` depending on output target |
| Tabs | Render all tabs as stacked sections for PDF/export |
| Callout | Render as static notice box |
| Media block | Render image/video/embed/attachment link from stored media reference |
| Reusable block | Render resolved content or reference placeholder, based on product decision |
| Comments/suggestions | Usually hidden in published view, visible in review/version views |

Do not assume the NodeView is used in export. NodeViews are for the editing experience. Static output comes from `renderHTML` or a separate renderer/export pipeline.

## Media Extension Rules

Media upload is not solved by Tiptap alone.

For image, GIF, video, or attachment extensions, use this flow:

1. User inserts, drops, or pastes a file.
2. Frontend validates basic type/size if possible.
3. Frontend uploads file to backend.
4. Backend validates and stores the file in file/object storage.
5. Backend returns a media ID and URL/storage reference.
6. Tiptap inserts a media node containing the reference, not the raw binary.
7. Backend creates or updates `MediaFiles` and `MediaReferences`.

Do not store large Base64 media in article JSON.

Suggested media node attrs:

```ts
mediaId: string;
src: string;
alt?: string;
caption?: string;
mimeType?: string;
widthPct?: number;
alignment?: 'left' | 'center' | 'right';
```

Media deletion rule:

- Removing media from the current draft should remove the draft-scoped reference.
- It should not immediately delete the physical media file.
- The physical file should only be deleted when no draft, version, published article, comment, reusable block, or restore point references it.

## Read-Only and Locking Requirements

Every write action must respect read-only mode.

Use guards like:

```ts
if (!editor.isEditable) return false;
```

or inside extension methods:

```ts
if (this.editor.isDestroyed || !this.editor.isEditable) return false;
```

Expected behavior:

- Viewer users cannot modify content.
- Users without the lock cannot edit the draft.
- Submitted/review states may restrict editing depending on workflow rules.
- Toolbar controls should be disabled or hidden in read-only mode.
- NodeView buttons should be disabled/hidden in read-only mode.
- Plugins handling paste/drop/keyboard write behavior should return `false` or avoid mutation when not editable.

## Autosave Requirements

A new extension should not bypass autosave.

If the extension changes document content through Tiptap transactions, normal editor update handling should detect the change.

Check that:

- extension changes modify the Tiptap document, not only DOM,
- important data is stored in attrs/content/marks,
- content serializes correctly to Tiptap JSON,
- undo/redo works,
- autosave sees the changed JSON,
- storage/export receives stable content.

For backend saves, the draft should use optimistic concurrency through `RowVersion` or equivalent protection.

## Security Rules

Editor extensions are a common source of security issues.

Check:

- Pasted HTML is sanitized.
- `parseHTML` does not preserve unsafe attributes.
- Links only allow safe protocols such as `http`, `https`, and `mailto` if allowed.
- Image/video/embed URLs are validated.
- File uploads validate MIME type, size, extension, and storage path.
- User-provided strings are rendered as text, not injected as raw HTML.
- Do not use `innerHTML` in NodeViews unless sanitized and absolutely necessary.
- Do not store secrets, tokens, or temporary upload credentials in article JSON.

Unsafe example:

```ts
dom.innerHTML = userProvidedHtml;
```

Safer example:

```ts
dom.textContent = userProvidedText;
```

## Performance Rules

The editor must handle large articles, including long documents with tables, media, tabs, accordions, and custom blocks.

When adding an extension:

- Avoid scanning the entire document on every keystroke.
- Avoid creating large decorations on every transaction unless necessary.
- Avoid expensive DOM reads/writes inside frequent update paths.
- Debounce expensive UI calculations.
- Clean up event listeners and observers in NodeViews.
- Keep NodeView `update` efficient.
- Test with large documents, not only small examples.

Bad pattern:

```ts
appendTransaction: (_transactions, _oldState, newState) => {
  newState.doc.descendants(() => {
    // expensive full-document logic on every transaction
  });
}
```

Better pattern:

```ts
appendTransaction: (transactions, _oldState, newState) => {
  if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;

  // Only do the minimum required work.
  return null;
}
```

## Testing Checklist

Every editor extension should have tests where relevant.

Minimum checklist:

- [ ] Inserts correctly from toolbar command.
- [ ] Inserts correctly from slash command if supported.
- [ ] Serializes to Tiptap JSON correctly.
- [ ] Renders to HTML correctly.
- [ ] Parses supported HTML correctly.
- [ ] Works with undo/redo.
- [ ] Works in read-only mode without modifying content.
- [ ] Does not crash when editor is destroyed.
- [ ] Works inside or near tables, tabs, accordions, lists, and callouts where relevant.
- [ ] Works with paste/import if relevant.
- [ ] Works with autosave.
- [ ] Has safe fallback behavior for invalid attrs.
- [ ] Does not store unsafe HTML or large Base64 media.
- [ ] Does not noticeably lag in a large document.

## Manual QA Checklist

Use this checklist before marking the extension ready:

- [ ] Create a new article and insert the feature.
- [ ] Edit text before and after the feature.
- [ ] Insert the feature inside nested content if allowed.
- [ ] Copy/paste the feature within the same article.
- [ ] Paste from external HTML if supported.
- [ ] Undo and redo all major actions.
- [ ] Save, refresh, and confirm the feature remains correct.
- [ ] Switch to read-only mode and confirm controls are blocked.
- [ ] Publish or preview static rendering.
- [ ] Export to HTML/PDF if applicable.
- [ ] Test with a large article.

## Documentation Required for Each New Extension

Add a short documentation file under the relevant docs area.

Suggested format:

```md
# Extension Name

## Purpose

What the extension does and why it exists.

## User Behavior

How users interact with it.

## Schema

Node/mark name, content model, and attributes.

## Commands

Commands exposed by the extension.

## Rendering

Editor rendering and static/export rendering.

## Storage Impact

What is saved in article JSON, media references, or backend records.

## Read-Only Behavior

What happens when the editor is not editable.

## Edge Cases

Invalid attrs, paste behavior, delete behavior, nested content, media cleanup, etc.

## Tests

Automated and manual tests.
```

## Example: Complete Callout Extension

```ts
import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_NODE_NAME = 'callout';

export type CalloutVariant = 'info' | 'warning' | 'success' | 'danger';

function normalizeCalloutVariant(value: unknown): CalloutVariant {
  return value === 'warning' ||
    value === 'success' ||
    value === 'danger' ||
    value === 'info'
    ? value
    : 'info';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (variant?: CalloutVariant) => ReturnType;
      setCalloutVariant: (variant: CalloutVariant) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: CALLOUT_NODE_NAME,

  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) =>
          normalizeCalloutVariant(
            element.getAttribute('data-kb-callout-variant'),
          ),
        renderHTML: (attributes) => ({
          'data-kb-callout-variant': normalizeCalloutVariant(
            attributes.variant,
          ),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-kb-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        class: 'kb-callout',
        'data-kb-callout': '',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (variant = 'info') =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;

          return commands.insertContent({
            type: CALLOUT_NODE_NAME,
            attrs: { variant: normalizeCalloutVariant(variant) },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Write callout text here...' }],
              },
            ],
          });
        },

      setCalloutVariant:
        (variant) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;

          return commands.updateAttributes(CALLOUT_NODE_NAME, {
            variant: normalizeCalloutVariant(variant),
          });
        },
    };
  },
});
```

## Common Mistakes

Avoid these mistakes:

1. Storing saved state only in DOM classes instead of node/mark attributes.
2. Putting complex transaction logic directly inside React toolbar components.
3. Forgetting `editor.isEditable` checks.
4. Registering both the default extension and the custom extension that replaces it.
5. Forgetting `...this.parent?.()` when extending existing Tiptap extensions.
6. Using NodeViews for static output instead of `renderHTML` or export renderers.
7. Using decorations for data that must survive save/refresh/export.
8. Trusting pasted HTML.
9. Storing Base64 files in article JSON.
10. Forgetting undo/redo testing.
11. Ignoring read-only users and locked drafts.
12. Adding expensive full-document scans on every transaction.
13. Forgetting to clean up NodeView event listeners.
14. Letting comments/suggestions store full business data only inside editor JSON.
15. Building real-time collaboration behavior even though the current version is lock-based.

## Final Production Checklist

Before merging a new editor extension:

- [ ] Correct Tiptap layer was chosen.
- [ ] Saved data is represented in schema attrs/content/marks.
- [ ] Temporary UI uses decorations/plugin state.
- [ ] Commands are typed through `declare module '@tiptap/core'`.
- [ ] Write commands guard against read-only mode.
- [ ] Toolbar/slash commands call extension commands instead of duplicating logic.
- [ ] Parent behavior is preserved when extending built-in extensions.
- [ ] NodeView has correct `dom`, `contentDOM`, `stopEvent`, `ignoreMutation`, and cleanup.
- [ ] HTML parsing/rendering is stable.
- [ ] Export behavior is defined.
- [ ] Paste/import behavior is tested.
- [ ] Autosave sees document changes.
- [ ] Undo/redo works.
- [ ] Large document performance is acceptable.
- [ ] Security risks are handled.
- [ ] Tests and documentation are added.

## One-Sentence Rule

When adding a Tiptap extension, first decide whether the feature is saved content, temporary editor UI, or application/backend state; then implement it using the correct Tiptap layer and make sure it works with read-only mode, autosave, export, paste, undo/redo, and large documents.
