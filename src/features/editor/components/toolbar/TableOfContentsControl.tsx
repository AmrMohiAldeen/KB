"use client";

import type { Editor } from "@tiptap/react";
import { ToolbarButton } from "./ToolbarPrimitives";

export function TableOfContentsControl({ editor }: { editor: Editor }) {
  return (
    <ToolbarButton
      title="Insert table of contents"
      disabled={!editor.isEditable}
      onActivate={() =>
        editor.chain().focus().insertTableOfContentsBlock().run()
      }
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11"
        />
      </svg>
    </ToolbarButton>
  );
}