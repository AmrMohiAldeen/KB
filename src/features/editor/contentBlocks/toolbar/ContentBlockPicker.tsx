"use client";

import type { Editor } from "@tiptap/react";
import {
  DropdownItem,
  ToolbarDropdown,
} from "../../components/toolbar/ToolbarPrimitives";
import {
  insertContentBlock,
  type ContentBlockKind,
} from "../commands/contentBlockCommands";

const ITEMS: Array<{
  description: string;
  kind: ContentBlockKind;
  label: string;
}> = [
  {
    kind: "tabs",
    label: "Tabs",
    description: "Switchable labeled panels",
  },
  {
    kind: "accordion",
    label: "Accordion",
    description: "Expandable content sections",
  },
];

export function ContentBlockPicker({ editor }: { editor: Editor }) {
  return (
    <ToolbarDropdown
      title="Insert content block"
      label={
        <span className="flex items-center gap-1">
          <span className="text-base leading-none">+</span>
          <span>Blocks</span>
        </span>
      }
      menuClassName="w-56"
    >
      {ITEMS.map((item) => (
        <DropdownItem
          key={item.kind}
          onActivate={() => insertContentBlock(editor, item.kind)}
        >
          <span className="flex flex-col">
            <span className="font-medium">{item.label}</span>
            <span className="text-[11px] font-normal text-gray-500">
              {item.description}
            </span>
          </span>
        </DropdownItem>
      ))}
    </ToolbarDropdown>
  );
}
