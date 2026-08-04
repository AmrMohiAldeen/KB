import type { ChainedCommands } from '@tiptap/core';
import {
  applyTextDirectionToActiveTable,
  type TextDirection,
} from '../extensions/TextDirection';
import { runContentBlockInsert } from '../lib/commands/contentBlockCommands';
import {
  isContentBlockKind,
  type SlashCommandKind,
} from './catalog';

function runListCommandWithDirection(
  chain: ChainedCommands,
  toggleList: () => ChainedCommands,
  direction: TextDirection | null,
): boolean {
  const nextChain = toggleList();
  if (direction) nextChain.setTextDirection(direction);

  return nextChain.run();
}

export function runSlashCommandInsert(
  chain: ChainedCommands,
  kind: SlashCommandKind,
  query = '',
  direction: TextDirection | null = null,
): boolean {
  if (isContentBlockKind(kind)) return runContentBlockInsert(chain, kind);

  switch (kind) {
    case 'paragraph':
      return chain.setParagraph().run();
    case 'heading-1':
      return chain.setHeading({ level: 1 }).run();
    case 'heading-2':
      return chain.setHeading({ level: 2 }).run();
    case 'heading-3':
      return chain.setHeading({ level: 3 }).run();
    case 'bullet-list':
      return runListCommandWithDirection(
        chain,
        () => chain.toggleBulletList(),
        direction,
      );
    case 'ordered-list':
      return runListCommandWithDirection(
        chain,
        () => chain.toggleOrderedList(),
        direction,
      );
    case 'task-list':
      return runListCommandWithDirection(
        chain,
        () => chain.toggleTaskList(),
        direction,
      );
    case 'blockquote':
      return chain.toggleBlockquote().run();
    case 'code-block':
      return chain.toggleCodeBlock().run();
    case 'horizontal-rule':
      return chain.setHorizontalRule().run();
    case 'glossary':
      return chain
        .setGlossary({
          term: 'Term',
          definition: 'Add a definition.',
        })
        .run();
    case 'table':
      // /table:5x4 creates a table with 5 rows and 4 cols
      const match = /^table:(\d+)x(\d+)$/i.exec(query); 
      const rows = match ? Math.max(1, Math.min(100, Number(match[1]))) : 3;
      const cols = match ? Math.max(1, Math.min(20, Number(match[2]))) : 3;
      return chain
        .insertTable({ rows, cols, withHeaderRow: true })
        .command(({ tr }) => {
          if (direction) applyTextDirectionToActiveTable(tr, direction);
          return true;
        })
        .run();
    case 'upload-image':
    case 'upload-video':
    case 'upload-attachment':
    case 'media-library':
    case 'youtube':
      return false;
  }
}
