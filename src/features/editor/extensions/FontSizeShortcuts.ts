// features/editor/extensions/FontSizeShortcuts.ts

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { changeFontSize } from "../components/toolbar/toolbarOptions";

function isModShiftOnly(event: KeyboardEvent): boolean {
  const hasExactlyOneModKey = event.ctrlKey !== event.metaKey;

  return hasExactlyOneModKey && event.shiftKey && !event.altKey;
}

export function isIncreaseFontSizeShortcut(event: KeyboardEvent): boolean {
  return (
    isModShiftOnly(event) &&
    (event.key === ">" || event.key === "." || event.code === "Period")
  );
}

export function isDecreaseFontSizeShortcut(event: KeyboardEvent): boolean {
  return (
    isModShiftOnly(event) &&
    (event.key === "<" || event.key === "," || event.code === "Comma")
  );
}

function isNativeControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, button, [contenteditable="false"]',
      ),
    )
  );
}

export const FontSizeShortcuts = Extension.create({
  name: "fontSizeShortcuts",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown: (_view, event) => {
              // Do not hijack shortcuts when the editor is read-only,
              // while the user is composing text through an IME,
              // or when the event started inside a native/editor control.
              if (
                !editor.isEditable ||
                event.isComposing ||
                isNativeControl(event.target)
              ) {
                return false;
              }

              if (isIncreaseFontSizeShortcut(event)) {
                event.preventDefault();
                event.stopPropagation();
                changeFontSize(editor, 1);
                return true;
              }

              if (isDecreaseFontSizeShortcut(event)) {
                event.preventDefault();
                event.stopPropagation();
                changeFontSize(editor, -1);
                return true;
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});