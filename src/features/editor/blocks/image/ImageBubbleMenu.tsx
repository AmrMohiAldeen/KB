'use client';

import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import { ImageIcon, Square, Trash2 } from 'lucide-react';
import type React from 'react';
import {
  getSelectedImage,
  isImageNodeSelection,
} from './imageDom';

type ImageMenuState = {
  isEditable: boolean;
  display: 'block' | 'inline' | null;
};

const EMPTY_IMAGE_MENU_STATE: ImageMenuState = {
  isEditable: false,
  display: null,
};

function ImageMenuButton({
  title,
  onActivate,
  danger = false,
  children,
}: {
  title: string;
  onActivate: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onActivate();
      }}
      className={[
        'flex h-8 min-w-8 items-center justify-center rounded px-2',
        'text-sm transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-blue-500',
        danger
          ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function shouldShowImageBubbleMenu({
  editor,
  state,
}: {
  editor: Editor;
  state: EditorState;
}): boolean {
  return editor.isEditable && isImageNodeSelection(state);
}

export function ImageBubbleMenu({ editor }: { editor: Editor }) {
  const imageState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (currentEditor.isDestroyed || !currentEditor.isEditable) {
        return EMPTY_IMAGE_MENU_STATE;
      }

      const selected = getSelectedImage(currentEditor.state);
      return {
        isEditable: currentEditor.isEditable,
        display: selected?.display ?? null,
      } satisfies ImageMenuState;
    },
  });

  if (!imageState.isEditable) return null;

  const nextDisplay = imageState.display === 'block' ? 'inline' : 'block';
  const switchTitle =
    nextDisplay === 'inline' ? 'Convert to inline image' : 'Convert to block image';

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      updateDelay={0}
      shouldShow={({ editor: menuEditor, state }) =>
        shouldShowImageBubbleMenu({ editor: menuEditor, state })
      }
      options={{
        placement: 'top',
        offset: 8,
        strategy: 'fixed',
      }}
      className="kb-image-bubble-menu flex items-center gap-0.5 rounded-md bg-white p-1 shadow-lg ring-1 ring-black/10"
    >
      <ImageMenuButton
        title={switchTitle}
        onActivate={() =>
          editor.chain().focus().setImageDisplay(nextDisplay).run()
        }
      >
        {nextDisplay === 'inline' ? (
          <ImageIcon size={16} aria-hidden="true" />
        ) : (
          <Square size={16} aria-hidden="true" />
        )}
      </ImageMenuButton>

      <ImageMenuButton
        title="Delete image"
        danger
        onActivate={() => editor.chain().focus().deleteSelectedImage().run()}
      >
        <Trash2 size={16} aria-hidden="true" />
      </ImageMenuButton>
    </BubbleMenu>
  );
}
