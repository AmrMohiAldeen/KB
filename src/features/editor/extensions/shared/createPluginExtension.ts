import { Extension } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';

export function createPluginExtension(name: string, createPlugin: () => Plugin) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [createPlugin()];
    },
  });
}
