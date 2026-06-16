// features/editor/extensions/FontSizeShortcuts.ts

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { changeFontSize } from "../components/toolbar/toolbarOptions";

function isCtrlShiftOnly(event: KeyboardEvent) {
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
}

export function isIncreaseFontSizeShortcut(event: KeyboardEvent) {
  return (
    isCtrlShiftOnly(event) &&
    (event.key === ">" || event.key === "." || event.code === "Period")
  );
}

export function isDecreaseFontSizeShortcut(event: KeyboardEvent) {
  return (
    isCtrlShiftOnly(event) &&
    (event.key === "<" || event.key === "," || event.code === "Comma")
  );
}

function isNativeControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="false"]'))
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
