# Font Size Shortcuts

## Purpose

`FontSizeShortcuts` adds keyboard shortcuts for increasing and decreasing the selected text’s font size inside the editor.

It provides keyboard behavior only. The actual font size changing logic is reused from the toolbar through `changeFontSize`.

## File

```txt
features/editor/extensions/FontSizeShortcuts.ts
```

## Shortcuts

| Shortcut           | Action             |
| ------------------ | ------------------ |
| `Ctrl + Shift + >` | Increase font size |
| `Ctrl + Shift + .` | Increase font size |
| `Ctrl + Shift + <` | Decrease font size |
| `Ctrl + Shift + ,` | Decrease font size |

Both symbol keys and physical key codes are checked to support different keyboard layouts.

## How It Works

The extension creates a ProseMirror plugin and listens for `keydown` events.

When a matching shortcut is detected:

```ts
changeFontSize(editor, 1);
```

is called to increase the font size.

When the decrease shortcut is detected:

```ts
changeFontSize(editor, -1);
```

is called to decrease the font size.

The event is then prevented and stopped so the browser does not handle the shortcut separately.

## Safety Checks

The shortcut is ignored when:

```ts
!editor.isEditable;
```

The editor is read-only.

```ts
event.isComposing;
```

The user is composing text through an IME/input method.

```ts
isNativeControl(event.target);
```

The user is inside a native control such as:

```txt
input
textarea
select
[contenteditable="false"]
```

This prevents the shortcut from interfering with toolbar inputs, dialogs, forms, or non-editable UI.

## Dependencies

```ts
changeFontSize;
```

from:

```txt
features/editor/components/toolbar/toolbarOptions
```

The extension depends on the same font-size behavior used by the toolbar, so keyboard shortcuts and toolbar buttons stay consistent.

## Storage Impact

This extension does not add new nodes, marks, or attributes.

It only triggers existing font size behavior.

The actual font size value is stored through the editor’s text styling system.

## Tests

The shortcut behavior is covered by a dedicated Vitest test file:

```txt
features/editor/extensions/FontSizeShortcuts.test.ts
```

The tests verify that:

- `Ctrl + Shift + >` and `Ctrl + Shift + .` increase font size on Windows/Linux.
- `Ctrl + Shift + <` and `Ctrl + Shift + ,` decrease font size on Windows/Linux.
- `Cmd + Shift + >` and `Cmd + Shift + .` increase font size on macOS.
- `Cmd + Shift + <` and `Cmd + Shift + ,` decrease font size on macOS.
- shortcuts with conflicting modifiers, such as `Ctrl + Cmd + Shift`, are rejected.
- shortcuts are ignored when triggered inside native controls such as inputs.
- valid shortcuts prevent the default browser behavior after being handled by the editor.

To run only this test file:

```bash
npx vitest run src/features/editor/extensions/FontSizeShortcuts.test.ts
```

## Notes

Keep this extension registered after the text styling extensions, especially `TextStyle` and `FontSize`, because it depends on font size behavior already being available in the editor.
