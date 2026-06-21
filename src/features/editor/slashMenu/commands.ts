import type { ChainedCommands } from '@tiptap/core';
import { runContentBlockInsert } from '../lib/commands/contentBlockCommands';
import {
  isContentBlockKind,
  type SlashCommandKind,
} from './catalog';

export function runSlashCommandInsert(
  chain: ChainedCommands,
  kind: SlashCommandKind,
  query = '',
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
      return chain.toggleBulletList().run();
    case 'ordered-list':
      return chain.toggleOrderedList().run();
    case 'task-list':
      return chain.toggleTaskList().run();
    case 'blockquote':
      return chain.toggleBlockquote().run();
    case 'code-block':
      return chain.toggleCodeBlock().run();
    case 'horizontal-rule':
      return chain.setHorizontalRule().run();
    case 'table':
      // /table:5x4 creates a table with 5 rows and 4 cols
      const match = /^table:(\d+)x(\d+)$/i.exec(query); 
      const rows = match ? Math.max(1, Math.min(100, Number(match[1]))) : 3;
      const cols = match ? Math.max(1, Math.min(20, Number(match[2]))) : 3;
      return chain
        .insertTable({ rows, cols, withHeaderRow: true })
        .run();
  }
}
