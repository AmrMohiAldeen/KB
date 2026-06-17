import type { Editor } from '@tiptap/react';
import type {} from '@tiptap/extension-mathematics';

export const DEFAULT_MATH_FORMULA =
  String.raw`x = {-b \pm \sqrt{b^2-4ac} \over 2a}`;

export function insertInlineFormula(editor: Editor, latex: string): boolean {
  const formula = latex.trim();

  if (!editor.isEditable) return false;
  if (!formula) return false;

  return editor
    .chain()
    .focus()
    .insertInlineMath({ latex: formula })
    .run();
}

export function insertBlockFormula(editor: Editor, latex: string): boolean {
  const formula = latex.trim();

  if (!editor.isEditable) return false;
  if (!formula) return false;

  return editor
    .chain()
    .focus()
    .insertBlockMath({ latex: formula })
    .run();
}
