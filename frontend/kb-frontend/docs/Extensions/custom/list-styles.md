# List Styles

## Purpose

`ListStyles` extends Tiptap ordered and bullet lists so the editor can preserve explicit list marker styles in both editor JSON and rendered HTML.

It exists because the default list behavior is not enough for knowledge base articles that need structured, multi-level documentation. Authors need ordered lists such as decimal, lower-alpha, upper-alpha, lower-roman, and upper-roman, and bullet lists such as disc, circle, and square.

The extension also adds commands and keyboard behavior for applying the correct nested list style when users indent list items.

## User Behavior

Users interact with this extension through the editor toolbar and keyboard shortcuts.

For ordered lists, users can choose:

- Decimal
- Lower alpha
- Upper alpha
- Lower roman
- Upper roman

For bullet lists, users can choose:

- Disc
- Circle
- Square

When a user indents a list item using `Tab` or `Mod-]`, the item becomes nested under the previous list item and the nested list automatically advances to the next style for that list type.

When a user outdents a nested list item using `Shift + Tab` or `Mod-[`, the item moves back up one list level.

## Schema

This extension does not introduce a completely new node type. Instead, it extends Tiptap's existing list nodes:

- `orderedList`
- `bulletList`

### `orderedList`

Adds the following attribute:

```ts
listStyle: "decimal" |
  "lower-alpha" |
  "upper-alpha" |
  "lower-roman" |
  "upper-roman";
```

Default value:

```ts
decimal;
```

The existing ordered-list `start` attribute is still supported. When rendering HTML, `start="1"` is omitted because it is the browser default, while non-default values such as `start="4"` are preserved.

### `bulletList`

Adds the following attribute:

```ts
listStyle: "disc" | "circle" | "square";
```

Default value:

```ts
disc;
```

### Supported Style Constants

```ts
ORDERED_LIST_STYLES = [
  "decimal",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
];

BULLET_LIST_STYLES = ["disc", "circle", "square"];
```

## Commands

The extension exposes commands under `listStyle`.

### `setListStyle(type, style)`

Applies a specific style to the closest selected list of the requested type.

```ts
editor.commands.setListStyle("orderedList", "upper-roman");
editor.commands.setListStyle("bulletList", "square");
```

Behavior:

- Rejects invalid type/style combinations.
- Updates only the closest matching selected list.
- Returns `false` if no matching list is found.
- Returns `true` without dispatching a change if the list already has the requested style.

Example toolbar usage:

```ts
editor
  .chain()
  .focus()
  .toggleBulletList()
  .setListStyle("bulletList", "square")
  .run();
```

### `applyNestedListStyle(type)`

Applies the next expected nested style based on the parent list style.

```ts
editor.commands.applyNestedListStyle("orderedList");
editor.commands.applyNestedListStyle("bulletList");
```

For ordered lists, nesting advances through:

```txt
decimal → lower-alpha → upper-alpha → lower-roman → upper-roman → decimal
```

For bullet lists, nesting advances through:

```txt
disc → circle → square → disc
```

This command is mainly used internally after indenting a list item.

### Keyboard Shortcuts

| Shortcut      | Behavior                                                      |
| ------------- | ------------------------------------------------------------- |
| `Tab`         | Indent current list item and apply the next nested list style |
| `Mod-]`       | Indent current list item and apply the next nested list style |
| `Shift + Tab` | Outdent current nested list item                              |
| `Mod-[`       | Outdent current nested list item                              |

## Rendering

### Editor Rendering

The editor renders list styles using both a data attribute and inline CSS:

```html
<ol data-list-style="upper-roman" style="list-style-type: upper-roman;">
  ...
</ol>

<ul data-list-style="square" style="list-style-type: square;">
  ...
</ul>
```

Using both `data-list-style` and `list-style-type` makes the output useful for both editor re-parsing and browser display.

### Static / Export Rendering

Static HTML and export HTML should use the same rendered list attributes produced by Tiptap:

```html
data-list-style="..." style="list-style-type: ...;"
```

For PDF export, the renderer should preserve the CSS `list-style-type` value so list numbering and bullet markers match the editor.

### HTML Parsing

The extension can parse list styles from:

1. Saved editor HTML:

```html
<ol data-list-style="lower-alpha"></ol>
```

2. Inline CSS:

```html
<ol style="list-style-type: upper-roman;"></ol>
```

3. Native ordered-list `type` attributes:

```html
<ol type="i"></ol>
```

Native ordered-list type mapping:

| HTML `type` | Parsed `listStyle` |
| ----------- | ------------------ |
| `1`         | `decimal`          |
| `a`         | `lower-alpha`      |
| `A`         | `upper-alpha`      |
| `i`         | `lower-roman`      |
| `I`         | `upper-roman`      |

## Storage Impact

The selected list style is saved in the article's Tiptap JSON as a node attribute.

Example ordered list JSON:

```json
{
  "type": "orderedList",
  "attrs": {
    "listStyle": "upper-roman"
  },
  "content": []
}
```

Example bullet list JSON:

```json
{
  "type": "bulletList",
  "attrs": {
    "listStyle": "square"
  },
  "content": []
}
```

This extension does not create media references, backend records, upload records, or separate database rows.

For the Knowledge Base storage model, the list style is part of the article content JSON stored in object/file storage through the draft or version content path.

## Read-Only Behavior

In read-only mode, users should be able to view styled lists exactly as saved, but they should not be able to change list styles, indent list items, or outdent list items.

Expected behavior:

- Toolbar list-style controls should be hidden or disabled.
- Keyboard shortcuts should not modify the document when the editor is not editable.
- Rendered article HTML should still preserve `data-list-style` and `list-style-type`.
- Published/static article views do not need the command extension; they only need the rendered output.

## Edge Cases

### Invalid Attributes

Invalid list styles are normalized to safe defaults.

For ordered lists:

```txt
invalid value → decimal
```

For bullet lists:

```txt
invalid value → disc
```

Example:

```html
<ol data-list-style="square"></ol>
```

This is invalid because `square` belongs to bullet lists, so it is parsed as:

```txt
decimal
```

### Invalid Type / Style Command Combinations

The command rejects invalid combinations.

Example:

```ts
editor.commands.setListStyle("orderedList", "disc");
```

This returns `false` and does not change the document.

### Nested Lists

When applying a style inside nested content, only the closest selected matching list is changed. Parent lists are not accidentally restyled.

### Pasted HTML

The extension supports pasted or imported HTML that uses:

- `data-list-style`
- `style="list-style-type: ..."`
- native ordered-list `type` attributes

Unsupported or invalid pasted styles are normalized to the correct default for that list type.

### Delete Behavior

The extension does not add custom delete behavior. List deletion, joining, splitting, and lifting are handled by Tiptap/ProseMirror list behavior.

### Media Cleanup

No media is created or referenced by this extension, so no media cleanup is required.

## Tests

### Automated Tests

The test file covers:

- Preserving ordered-list and bullet-list styles in editor JSON.
- Preserving styles in rendered editor HTML.
- Ensuring `generateHTML(editor.getJSON(), getEditorExtensions())` matches editor HTML.
- Parsing styles from `data-list-style`.
- Parsing styles from inline `list-style-type` CSS.
- Parsing native ordered-list `type` attributes.
- Falling back to safe defaults for invalid style values.
- Changing only the closest nested selected list.
- Rejecting invalid style/type command combinations.
- Creating and styling a list in one toolbar-style command chain.
- Indenting list items with `Tab` and applying the next nested style.
- Outdenting list items with `Shift + Tab`.
- Removing `start="1"` from rendered ordered lists.
- Preserving non-default ordered-list start values such as `start="4"`.

### Manual Tests

Recommended manual checks:

1. Create an ordered list and switch between every ordered style.
2. Create a bullet list and switch between every bullet style.
3. Create a multi-level ordered list using `Tab` and confirm nested styles advance correctly.
4. Create a multi-level bullet list using `Tab` and confirm nested styles advance correctly.
5. Use `Shift + Tab` to outdent nested items and confirm document structure remains valid.
6. Paste HTML containing `<ol type="a">`, `<ol type="I">`, and `list-style-type` CSS.
7. Save and reload an article draft and confirm list styles are preserved.
8. Generate static/export HTML and confirm list markers match the editor.
9. Open the same content in read-only mode and confirm styled lists render without editable controls.
