"use client";

import type { Editor } from "@tiptap/react";
import {
  DropdownItem,
  DropdownSubmenu,
  ToolbarDropdown,
} from "./ToolbarPrimitives";
import {
  insertContentBlock,
} from "../../lib/commands/contentBlockCommands";
import { CONTENT_BLOCK_OPTIONS } from "../../blocks/catalog";

export function ContentBlockPicker({ editor }: { editor: Editor }) {
  const callouts = CONTENT_BLOCK_OPTIONS.filter((item) =>
    item.kind.startsWith("callout-"),
  );
  const blocks = CONTENT_BLOCK_OPTIONS.filter(
    (item) => !item.kind.startsWith("callout-"),
  );

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
      {blocks.map((item) => (
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
      <DropdownSubmenu
        label={
          <span className="flex flex-col">
            <span className="font-medium">Callouts</span>
            <span className="text-[11px] font-normal text-gray-500">
              Notices, tips, and warnings
            </span>
          </span>
        }
      >
        {callouts.map((item) => (
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
      </DropdownSubmenu>
    </ToolbarDropdown>
  );
}
