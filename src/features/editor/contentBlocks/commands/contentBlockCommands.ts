import type { ChainedCommands, Editor } from '@tiptap/core';
import { logDevError } from '../../utils/logDevError';
import type { CalloutVariant } from '../callout/model';
import type { ContentBlockKind } from '../catalog';

export type { ContentBlockKind } from '../catalog';

export function runContentBlockInsert(
  chain: ChainedCommands,
  kind: ContentBlockKind,
): boolean {
  if (kind === 'tabs') return chain.insertTabs().run();
  if (kind === 'accordion') return chain.insertAccordion().run();

  return chain
    .insertCallout({
      variant: kind.replace('callout-', '') as CalloutVariant,
    })
    .run();
}

export function insertContentBlock(
  editor: Editor | null | undefined,
  kind: ContentBlockKind,
): boolean {
  if (!editor || editor.isDestroyed || !editor.isEditable) return false;

  try {
    return runContentBlockInsert(editor.chain().focus(), kind);
  } catch (error) {
    logDevError('Content block command failed:', error);
    return false;
  }
}
