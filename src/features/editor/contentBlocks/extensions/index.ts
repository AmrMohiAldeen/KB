import { Extension } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import { ContentBlockDragHandlePlugin } from '../plugins/ContentBlockDragHandlePlugin';
import { Accordion, AccordionItem } from './Accordion';
import { Callout } from './Callout';
import { TabItem, Tabs } from './Tabs';

function createPluginExtension(name: string, createPlugin: () => Plugin) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [createPlugin()];
    },
  });
}

export const contentBlockExtensions = [
  Tabs,
  TabItem,
  Accordion,
  AccordionItem,
  Callout,
  createPluginExtension('contentBlockDragHandle', ContentBlockDragHandlePlugin),
];
