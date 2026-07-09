# Native Tiptap Extensions

This document explains the native Tiptap extensions used by the Knowledge Base editor.

## Purpose

The editor is built on Tiptap and uses native Tiptap extensions for the base document schema, text formatting, lists, media embeds, tables, selection preservation, character counting, and mathematics support.

Native extensions should be documented from the project’s point of view:

* why the extension is used,
* how it is configured,
* what depends on it,
* and what behavior it enables in the Knowledge Base editor.

This document should not duplicate the full official Tiptap documentation.


# Core Schema

## StarterKit

```ts
StarterKit.configure({
  bulletList: false,
  heading: {
    levels: [1, 2, 3, 4],
  },
  orderedList: false,
})
```

`StarterKit` provides the base editor schema and common editing behavior.

It includes common nodes, marks, and editor utilities needed by almost every Tiptap editor.

## Included Nodes

`StarterKit` includes:

* `Document`
* `Paragraph`
* `Text`
* `Heading`
* `Blockquote`
* `CodeBlock`
* `HardBreak`
* `HorizontalRule`
* `BulletList`
* `OrderedList`
* `ListItem`

In this project, `BulletList` and `OrderedList` are disabled because the editor uses custom styled list extensions instead:

```ts
bulletList: false,
orderedList: false,
```

The custom replacements are:

```ts
StyledBulletList
StyledOrderedList
ListStyleCommands
```

## Included Marks

`StarterKit` includes common inline formatting marks such as:

* `Bold`
* `Italic`
* `Strike`
* `Code`
* `Link`
* `Underline`

These provide the base inline formatting used by the toolbar.

## Included Editor Extensions

`StarterKit` also includes important editing behavior such as:

* undo/redo history,
* gap cursor,
* drop cursor,
* list keymap behavior,
* trailing node behavior.

These make the editor feel like a normal rich text editor instead of a plain contenteditable field.

## Project Configuration

The editor limits heading levels to:

```ts
levels: [1, 2, 3, 4]
```

This keeps article structure consistent and avoids deeply nested heading levels that are usually unnecessary in Knowledge Base articles.

---

# Lists

## TaskList

```ts
TaskList
```

`TaskList` enables checklist-style list containers.

It is used together with `TaskItem`.

## TaskItem

```ts
TaskItem.configure({
  HTMLAttributes: {
    class: 'kb-task-item',
  },
  nested: true,
})
```

`TaskItem` represents each individual checkbox item inside a task list.

## Project Configuration

The project adds a custom class:

```ts
class: 'kb-task-item'
```

This allows styling task items consistently in the Knowledge Base editor.

Nested task items are enabled:

```ts
nested: true
```

This allows task lists inside task lists.

## Related Custom Extensions

Normal bullet and ordered lists are handled by custom project extensions:

```ts
StyledBulletList
StyledOrderedList
ListStyleCommands
```

These are not native Tiptap extensions and should be documented in:

```txt
docs/editor/extensions/custom/list-styles.md
```

---

# Text Styling and Marks

## TextStyle

```ts
TextStyle
```

`TextStyle` is a required base mark for several inline style extensions.

It allows inline style attributes to be stored on text.

## Used By

The following extensions depend on `TextStyle`:

* `FontFamily`
* `FontSize`
* `Color`
* `LineHeight`

Because of this, `TextStyle` must be registered before those extensions.

---

## FontFamily


`FontFamily` allows selected text to use a specific font family.

This is used by the toolbar font family control.

The font family value is stored as an attribute on the `TextStyle` mark.

---

## FontSize

`FontSize` allows selected text to use a specific font size.

This is used by:

* the font size toolbar control,
* increase/decrease font size behavior,
* pasted content normalization when supported.

The font size value is stored as an attribute on the `TextStyle` mark.

---

## Color


`Color` allows text color to be applied to selected text.

This is used by the text color toolbar control.

The color value is stored as an attribute on the `TextStyle` mark.

---

## Highlight

```ts
Highlight.configure({
  multicolor: true,
})
```

`Highlight` allows background highlighting on selected text.

## Project Configuration

The editor enables multiple highlight colors:

This allows the toolbar to support different highlight colors instead of only one default highlight color.

---

## LineHeight

`LineHeight` allows line height formatting to be applied.

This is used by the line height toolbar control.

Line height formatting is stored through text style attributes.

---

## Superscript

`Superscript` allows selected text to be displayed above the normal text baseline.

Common use cases include:

* mathematical notation,
* footnote-like text,
* scientific notation.

---

## Subscript

`Subscript` allows selected text to be displayed below the normal text baseline.

Common use cases include:

* chemical formulas,
* mathematical notation,
* technical documentation.

---

## TextAlign

```ts
TextAlign.configure({
  alignments: ['left', 'center', 'right', 'justify'],
  types: ['paragraph', 'heading'],
})
```

`TextAlign` allows block-level text alignment.

## Project Configuration

Supported alignments:

```ts
['left', 'center', 'right', 'justify']
```

Supported node types:

```ts
['paragraph', 'heading']
```

This means alignment can be applied to normal paragraphs and headings, but not to every block type.

This avoids unexpected behavior in complex blocks such as tables, accordions, tabs, and custom node views.

---

# Media

## Youtube

`Youtube` allows YouTube videos to be embedded inside editor content.

It supports video-by-link behavior and stores the video reference in the editor document.

## Notes

Uploaded videos and non-YouTube media are not fully handled by this extension alone.

Application-level media handling is still required for:

* file validation,
* upload APIs,
* storage paths,
* media references,
* permissions,
* cleanup rules.

## Related Custom Extensions

Image handling is implemented through custom project extensions:

These should be documented separately in:

```txt
docs/editor/extensions/blocks/images.md
```

---

# Tables

## TableKit

```ts
TableKit.configure({
  table: false,
  tableCell: false,
  tableHeader: false,
  tableRow: false,
})
```

`TableKit` provides the base table-related Tiptap functionality.

## Project Configuration

The native table pieces are disabled:

```ts
table: false,
tableCell: false,
tableHeader: false,
tableRow: false,
```

This is done because the project uses custom table extensions instead:

The custom table implementation handles project-specific behavior such as:

* table node customization,
* table cell behavior,
* row and column controls,
* resizing,
* dragging,
* table-specific UI behavior,
* custom attributes.

## Related Custom Extensions

Custom table behavior should be documented separately in:

```txt
docs/editor/extensions/blocks/tables.md
```

---

# Selection and Utilities

## Selection

```ts
Selection.configure({
  className: 'kb-preserved-selection',
})
```

`Selection` preserves the visual selection state in situations where the editor selection may otherwise disappear visually.

This is useful when toolbar controls, floating menus, or external UI elements interact with the editor.

## Project Configuration

The preserved selection uses this CSS class:

```ts
className: 'kb-preserved-selection'
```

This class should be styled in the editor CSS so users can still understand what content is selected while interacting with toolbar UI.

---

## CharacterCount

```ts
CharacterCount.configure({
  limit: null,
})
```

`CharacterCount` tracks document length.

It can be used to display:

* character count,
* word count,
* document size indicators.

## Project Configuration

The editor does not enforce a hard character limit:

```ts
limit: null
```

This means the extension is used for reporting, not blocking input.

This is important because Knowledge Base articles may be long.

---

# Mathematics

## Mathematics

```ts
Mathematics.configure({
  katexOptions: {
    throwOnError: false,
  },
})
```

`Mathematics` enables mathematical formula support inside the editor.

It is used for technical documentation where formulas or equations may be required.

## Project Configuration

KaTeX rendering errors are prevented from breaking the editor:

```ts
throwOnError: false
```

This means invalid math input should not crash the editor. Instead, the formula can fail gracefully.



# Native Extensions Not Documented Here

Some extensions in the editor setup are custom or project-specific and should not be documented deeply in this file.

## Custom List Extensions

```ts
StyledBulletList
StyledOrderedList
ListStyleCommands
```

Document in:

```txt
docs/editor/extensions/custom/list-styles.md
```

## Font Size Shortcuts

```ts
FontSizeShortcuts
```

Document in:

```txt
docs/editor/extensions/custom/font-size-shortcuts.md
```

## Image Extensions

```ts
imageExtensions
```

Document in:

```txt
docs/editor/extensions/blocks/images.md
```

## Table of Contents Block

```ts
TableOfContentsBlock
```

Document in:

```txt
docs/editor/extensions/blocks/table-of-contents.md
```

## Content Block Extensions

```ts
contentBlockExtensions
```

Document each block separately where possible:

```txt
docs/editor/extensions/blocks/tabs.md
docs/editor/extensions/blocks/accordions.md
docs/editor/extensions/blocks/callouts.md
```

## Slash Command Menu

```ts
SlashCommandMenu
```

Document in:

```txt
docs/editor/extensions/custom/slash-command-menu.md
```

## Paste Sanitizer

```ts
PasteSanitizer
```

Document in:

```txt
docs/editor/extensions/custom/paste-sanitizer.md
```

## Block Selection

```ts
BlockSelection
```

Document in:

```txt
docs/editor/extensions/custom/block-selection.md
```

## File Handler Integration

```ts
createFileHandlerExtension
```

Document in:

```txt
docs/editor/extensions/custom/file-handler-integration.md
```

---

# Current Native Extension Summary

| Extension        | Purpose                                        | Project Notes                                                             |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `StarterKit`     | Base editor schema and common editing behavior | Bullet and ordered lists disabled because custom list extensions are used |
| `TaskList`       | Checklist container                            | Used with `TaskItem`                                                      |
| `TaskItem`       | Checklist item                                 | Nested task items enabled; custom class added                             |
| `TextStyle`      | Base mark for inline style attributes          | Required by font/color/line-height extensions                             |
| `FontFamily`     | Font family formatting                         | Depends on `TextStyle`                                                    |
| `FontSize`       | Font size formatting                           | Depends on `TextStyle`                                                    |
| `Color`          | Text color formatting                          | Depends on `TextStyle`                                                    |
| `Highlight`      | Text highlight formatting                      | Multicolor enabled                                                        |
| `LineHeight`     | Line height formatting                         | Depends on `TextStyle`                                                    |
| `Superscript`    | Superscript text                               | Used for technical notation                                               |
| `Subscript`      | Subscript text                                 | Used for technical notation                                               |
| `TextAlign`      | Paragraph and heading alignment                | Supports left, center, right, justify                                     |
| `Youtube`        | YouTube embeds                                 | Upload-based videos still require app-level media handling                |
| `TableKit`       | Native table foundation                        | Native table nodes disabled because custom table extensions are used      |
| `Selection`      | Preserved visual selection                     | Uses `kb-preserved-selection` class                                       |
| `CharacterCount` | Character/word count support                   | No hard limit                                                             |
| `Mathematics`    | Formula support                                | KaTeX errors do not throw                                                 |


# Native Tiptap Commands

This section lists the editor commands provided by the native Tiptap extensions used in this editor setup.

It only covers commands from native Tiptap extensions. Commands from custom project extensions such as `StyledBulletList`, `StyledOrderedList`, `ListStyleCommands`, `FontSizeShortcuts`, `PasteSanitizer`, `BlockSelection`, `imageExtensions`, and `tableExtensions` should be documented in their own extension documents.

## Important Notes

Not every extension adds commands.

Some extensions provide schema only, visual behavior, keyboard behavior, storage helpers, or decorations.

Examples:

* `Document` does not add project-facing commands.
* `Text` does not add project-facing commands.
* `Dropcursor` does not add project-facing commands.
* `Gapcursor` does not add project-facing commands.
* `ListKeymap` mainly changes keyboard behavior.
* `TrailingNode` mainly ensures the document ends with a valid trailing node.
* `Selection` adds a CSS class to preserve selection styling; it does not add editor commands.
* `CharacterCount` exposes storage helpers, not normal commands.

---

# StarterKit Commands

`StarterKit` includes several native nodes, marks, and extensions. The commands below come from those included extensions.

## Paragraph

```ts
editor.commands.setParagraph()
```

Transforms the selected block into a paragraph.

---

## Heading

```ts
editor.commands.setHeading({ level: 1 })
editor.commands.toggleHeading({ level: 1 })
```

Creates or toggles a heading.

In this project, only heading levels 1 to 4 are enabled:

```ts
levels: [1, 2, 3, 4]
```

Valid project heading levels:

```ts
editor.commands.setHeading({ level: 1 })
editor.commands.setHeading({ level: 2 })
editor.commands.setHeading({ level: 3 })
editor.commands.setHeading({ level: 4 })

editor.commands.toggleHeading({ level: 1 })
editor.commands.toggleHeading({ level: 2 })
editor.commands.toggleHeading({ level: 3 })
editor.commands.toggleHeading({ level: 4 })
```

---

## Blockquote

```ts
editor.commands.setBlockquote()
editor.commands.toggleBlockquote()
editor.commands.unsetBlockquote()
```

Used to wrap, toggle, or remove blockquote formatting.

---

## CodeBlock

```ts
editor.commands.setCodeBlock()
editor.commands.toggleCodeBlock()
```

Used to create or toggle a fenced code block.

This is block-level code, not inline code.

---

## HardBreak

```ts
editor.commands.setHardBreak()
```

Inserts a hard line break, rendered as `<br>`.

Usually triggered through:

```txt
Shift + Enter
```

---

## HorizontalRule

```ts
editor.commands.setHorizontalRule()
```

Inserts a horizontal rule, rendered as `<hr>`.

---

## Bold

```ts
editor.commands.setBold()
editor.commands.toggleBold()
editor.commands.unsetBold()
```

Applies, toggles, or removes bold formatting.

---

## Italic

```ts
editor.commands.setItalic()
editor.commands.toggleItalic()
editor.commands.unsetItalic()
```

Applies, toggles, or removes italic formatting.

---

## Strike

```ts
editor.commands.setStrike()
editor.commands.toggleStrike()
editor.commands.unsetStrike()
```

Applies, toggles, or removes strikethrough formatting.

---

## Underline

```ts
editor.commands.setUnderline()
editor.commands.toggleUnderline()
editor.commands.unsetUnderline()
```

Applies, toggles, or removes underline formatting.

---

## Inline Code

```ts
editor.commands.setCode()
editor.commands.toggleCode()
editor.commands.unsetCode()
```

Applies, toggles, or removes inline code formatting.

This is different from `CodeBlock`.

Inline code:

```html
<code>example</code>
```

Code block:

```html
<pre><code>example</code></pre>
```

---

## Link

```ts
editor.commands.setLink({ href: 'https://example.com' })
editor.commands.toggleLink({ href: 'https://example.com' })
editor.commands.unsetLink()
```

Used to apply, toggle, or remove links.

Example with target:

```ts
editor.commands.setLink({
  href: 'https://example.com',
  target: '_blank',
})
```

The Link extension is headless. It provides the document behavior and commands, but the project must provide the actual link UI.

---

## Undo / Redo

```ts
editor.commands.undo()
editor.commands.redo()
```

Used for editor history.

This is included through StarterKit’s Undo/Redo support.

---

## Native BulletList and OrderedList Commands

StarterKit normally includes these commands:

```ts
editor.commands.toggleBulletList()
editor.commands.toggleOrderedList()
```

However, in this project, native bullet and ordered lists are disabled:

```ts
bulletList: false,
orderedList: false,
```

This means the project should not rely on the native StarterKit bullet/ordered list commands directly.

Instead, list behavior is handled by:

```ts
StyledBulletList
StyledOrderedList
ListStyleCommands
```

Those custom list commands should be documented in:

```txt
docs/editor/extensions/custom/list-styles.md
```

---

## ListItem-Related Commands

The native list system also uses list item behavior such as:

```ts
editor.commands.splitListItem('listItem')
editor.commands.sinkListItem('listItem')
editor.commands.liftListItem('listItem')
```

These are usually triggered by list keyboard behavior:

```txt
Enter
Tab
Shift + Tab
```

Because this project replaces native bullet and ordered lists with custom styled list extensions, list item behavior should be tested carefully with the custom list implementation.

---

# Task List Commands

## TaskList

```ts
editor.commands.toggleTaskList()
```

Toggles the selected content into a task list.

Task lists require both:

```ts
TaskList
TaskItem
```

## TaskItem

`TaskItem` does not mainly expose a separate project-facing command.

It provides the task item node rendered as a checkbox list item and supports task-list keyboard behavior.

In this project it is configured with:

```ts
TaskItem.configure({
  HTMLAttributes: {
    class: 'kb-task-item',
  },
  nested: true,
})
```

---

# Text Style Commands

## TextStyle

```ts
editor.commands.removeEmptyTextStyle()
```

Removes empty `<span>` tags that do not contain any inline style.

This is useful after removing font size, font family, color, or line height formatting.

---

## FontFamily

```ts
editor.commands.setFontFamily('Inter')
editor.commands.unsetFontFamily()
```

Applies or removes font family formatting.

Depends on:

```ts
TextStyle
```

---

## FontSize

```ts
editor.commands.setFontSize('14px')
editor.commands.unsetFontSize()
```

Applies or removes font size formatting.

Depends on:

```ts
TextStyle
```

---

## Color

```ts
editor.commands.setColor('#ff0000')
editor.commands.unsetColor()
```

Applies or removes text color.

Depends on:

```ts
TextStyle
```

---

## Highlight

```ts
editor.commands.setHighlight()
editor.commands.setHighlight({ color: '#ffcc00' })

editor.commands.toggleHighlight()
editor.commands.toggleHighlight({ color: '#ffcc00' })

editor.commands.unsetHighlight()
```

Applies, toggles, or removes text highlight.

In this project, multiple highlight colors are enabled:

```ts
Highlight.configure({
  multicolor: true,
})
```

---

## LineHeight

```ts
editor.commands.setLineHeight('1.5')
editor.commands.unsetLineHeight()
```

Applies or removes line height formatting.

Depends on:

```ts
TextStyle
```

---

## Superscript

```ts
editor.commands.setSuperscript()
editor.commands.toggleSuperscript()
editor.commands.unsetSuperscript()
```

Applies, toggles, or removes superscript formatting.

---

## Subscript

```ts
editor.commands.setSubscript()
editor.commands.toggleSubscript()
editor.commands.unsetSubscript()
```

Applies, toggles, or removes subscript formatting.

---

## TextAlign

```ts
editor.commands.setTextAlign('left')
editor.commands.setTextAlign('center')
editor.commands.setTextAlign('right')
editor.commands.setTextAlign('justify')

editor.commands.toggleTextAlign('left')
editor.commands.toggleTextAlign('center')
editor.commands.toggleTextAlign('right')
editor.commands.toggleTextAlign('justify')

editor.commands.unsetTextAlign()
```

Applies, toggles, or removes text alignment.

In this project, text alignment is configured for:

```ts
types: ['paragraph', 'heading']
```

This means alignment is intended for paragraphs and headings only.

---

# Media Commands

## Youtube

```ts
editor.commands.setYoutubeVideo({
  src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  width: 640,
  height: 480,
})
```

Inserts a YouTube iframe embed at the current editor position.

Only `src` is required.

`width` and `height` are optional.

Uploaded videos are not handled by this command. Upload-based media requires application-level media handling.

---

# Table Commands

The native Tiptap table extension provides the following commands:

```ts
editor.commands.insertTable()
editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false })

editor.commands.addColumnBefore()
editor.commands.addColumnAfter()
editor.commands.deleteColumn()

editor.commands.addRowBefore()
editor.commands.addRowAfter()
editor.commands.deleteRow()

editor.commands.deleteTable()

editor.commands.mergeCells()
editor.commands.splitCell()
editor.commands.mergeOrSplit()

editor.commands.toggleHeaderColumn()
editor.commands.toggleHeaderRow()
editor.commands.toggleHeaderCell()

editor.commands.setCellAttribute('backgroundColor', '#000')

editor.commands.goToNextCell()
editor.commands.goToPreviousCell()

editor.commands.fixTables()
```

However, in this project, the native table nodes from `TableKit` are disabled:

```ts
TableKit.configure({
  table: false,
  tableCell: false,
  tableHeader: false,
  tableRow: false,
})
```

The project uses custom table extensions instead:

```ts
tableExtensions
```

Because of that, the final available table commands depend on what the custom table extensions extend or re-register.

Document actual project table behavior in:

```txt
docs/editor/extensions/blocks/tables.md
```

---

# Mathematics Commands

## Inline Math

```ts
editor.commands.insertInlineMath({
  latex: '\\frac{a}{b}',
})

editor.commands.insertInlineMath({
  latex: '\\frac{a}{b}',
  pos: 38,
})
```

Inserts inline math at the current selection or at a specific document position.

```ts
editor.commands.updateInlineMath({
  latex: '\\frac{a}{b}',
})

editor.commands.updateInlineMath({
  latex: '\\frac{a}{b}',
  pos: 38,
})
```

Updates an inline math node.

```ts
editor.commands.deleteInlineMath()
editor.commands.deleteInlineMath({ pos: 38 })
```

Deletes an inline math node.

---

## Block Math

```ts
editor.commands.insertBlockMath({
  latex: '\\frac{a}{b}',
})

editor.commands.insertBlockMath({
  latex: '\\frac{a}{b}',
  pos: 38,
})
```

Inserts block math at the current selection or at a specific document position.

```ts
editor.commands.updateBlockMath({
  latex: '\\frac{a}{b}',
})

editor.commands.updateBlockMath({
  latex: '\\frac{a}{b}',
  pos: 38,
})
```

Updates a block math node.

```ts
editor.commands.deleteBlockMath()
editor.commands.deleteBlockMath({ pos: 38 })
```

Deletes a block math node.

---

## Math Utilities

The Mathematics extension also exports utilities, but these are not normal `editor.commands`.

```ts
mathMigrationRegex
createMathMigrateTransaction(editor, transaction, regex)
migrateMathStrings(editor, regex)
```

These are useful for migrating plain LaTeX-style text into math nodes.

---

# Selection Extension

```ts
Selection.configure({
  className: 'kb-preserved-selection',
})
```

The Selection extension does not add editor commands.

It adds a CSS class to the current selection when the editor is blurred.

This helps preserve visible selection styling while the user interacts with toolbar controls or floating UI.

---

# CharacterCount Extension

```ts
CharacterCount.configure({
  limit: null,
})
```

The CharacterCount extension does not add normal editor commands.

It exposes storage helpers instead:

```ts
editor.storage.characterCount.characters()
editor.storage.characterCount.words()
```

It can also count a specific node:

```ts
editor.storage.characterCount.characters({ node: someNode })
editor.storage.characterCount.words({ node: someNode })
```

In this project, `limit` is set to `null`, so CharacterCount is used for reporting, not blocking input.

---

# Extensions With No Direct Project-Facing Commands

The following native extensions do not add commands that the project normally calls directly:

```ts
Document
Text
Dropcursor
Gapcursor
ListKeymap
TrailingNode
Selection
CharacterCount
```

They still matter because they provide schema, editing behavior, cursor behavior, list keyboard behavior, selection styling, or editor metadata.

---

# Quick Command Reference

| Extension          | Commands                                                                                                                                                                                                                                                                                                  
| Paragraph          | `setParagraph`                                                                                                                                                                                                                                                                                             |
| Heading            | `setHeading`, `toggleHeading`                                                                                                                                                                                                                                                                              |
| Blockquote         | `setBlockquote`, `toggleBlockquote`, `unsetBlockquote`                                                                                                                                                                                                                                                     |
| CodeBlock          | `setCodeBlock`, `toggleCodeBlock`                                                                                                                                                                                                                                                                          |
| HardBreak          | `setHardBreak`                                                                                                                                                                                                                                                                                             |
| HorizontalRule     | `setHorizontalRule`                                                                                                                                                                                                                                                                                        |
| Bold               | `setBold`, `toggleBold`, `unsetBold`                                                                                                                                                                                                                                                                       |
| Italic             | `setItalic`, `toggleItalic`, `unsetItalic`                                                                                                                                                                                                                                                                 |
| Strike             | `setStrike`, `toggleStrike`, `unsetStrike`                                                                                                                                                                                                                                                                 |
| Underline          | `setUnderline`, `toggleUnderline`, `unsetUnderline`                                                                                                                                                                                                                                                        |
| Inline Code        | `setCode`, `toggleCode`, `unsetCode`                                                                                                                                                                                                                                                                       |
| Link               | `setLink`, `toggleLink`, `unsetLink`                                                                                                                                                                                                                                                                       |
| Undo/Redo          | `undo`, `redo`                                                                                                                                                                                                                                                                                             |
| Native BulletList  | `toggleBulletList`, disabled in this project                                                                                                                                                                                                                                                               |
| Native OrderedList | `toggleOrderedList`, disabled in this project                                                                                                                                                                                                                                                              |
| ListItem           | `splitListItem`, `sinkListItem`, `liftListItem`                                                                                                                                                                                                                                                            |
| TaskList           | `toggleTaskList`                                                                                                                                                                                                                                                                                           |
| TextStyle          | `removeEmptyTextStyle`                                                                                                                                                                                                                                                                                     |
| FontFamily         | `setFontFamily`, `unsetFontFamily`                                                                                                                                                                                                                                                                         |
| FontSize           | `setFontSize`, `unsetFontSize`                                                                                                                                                                                                                                                                             |
| Color              | `setColor`, `unsetColor`                                                                                                                                                                                                                                                                                   |
| Highlight          | `setHighlight`, `toggleHighlight`, `unsetHighlight`                                                                                                                                                                                                                                                        |
| LineHeight         | `setLineHeight`, `unsetLineHeight`                                                                                                                                                                                                                                                                         |
| Superscript        | `setSuperscript`, `toggleSuperscript`, `unsetSuperscript`                                                                                                                                                                                                                                                  |
| Subscript          | `setSubscript`, `toggleSubscript`, `unsetSubscript`                                                                                                                                                                                                                                                        |
| TextAlign          | `setTextAlign`, `toggleTextAlign`, `unsetTextAlign`                                                                                                                                                                                                                                                        |
| Youtube            | `setYoutubeVideo`                                                                                                                                                                                                                                                                                          |
| Table              | `insertTable`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `addRowBefore`, `addRowAfter`, `deleteRow`, `deleteTable`, `mergeCells`, `splitCell`, `mergeOrSplit`, `toggleHeaderColumn`, `toggleHeaderRow`, `toggleHeaderCell`, `setCellAttribute`, `goToNextCell`, `goToPreviousCell`, `fixTables` |
| Mathematics        | `insertInlineMath`, `updateInlineMath`, `deleteInlineMath`, `insertBlockMath`, `updateBlockMath`, `deleteBlockMath`                                                                                                                                                                                        |
| CharacterCount     | No commands; uses `editor.storage.characterCount`                                                                                                                                                                                                                                                          |
| Selection          | No commands; adds selection CSS class                                                                                                                                                                                                                                                                     
