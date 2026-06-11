import type { Editor } from '@tiptap/core';

export type ContentBlockKind = 'accordion' | 'tabs';

export function insertContentBlock(
  editor: Editor | null | undefined,
  kind: ContentBlockKind,
): boolean {
  if (!editor || editor.isDestroyed || !editor.isEditable) return false;

  try {
    return kind === 'tabs'
      ? editor.chain().focus().insertTabs().run()
      : editor.chain().focus().insertAccordion().run();
  } catch {
    return false;
  }
}
