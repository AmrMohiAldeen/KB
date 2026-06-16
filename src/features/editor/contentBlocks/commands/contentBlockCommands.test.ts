import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertContentBlock } from './contentBlockCommands';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('content block commands', () => {
  it('logs unexpected command errors in development and still fails safely', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const error = new Error('Unexpected command failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = {
      isDestroyed: false,
      isEditable: true,
      chain: () => {
        throw error;
      },
    } as unknown as Editor;

    expect(insertContentBlock(editor, 'tabs')).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      'Content block command failed:',
      error,
    );
  });
});
