"use client"

import { Editor } from '@tiptap/react';
import React, { useCallback, useState, useEffect } from 'react';
import {
  TableCreationPicker,
  TableControls,
} from './EditorTableToolbar';

export interface EditorToolbarProps {
  editor: Editor;
}

// Reusable Toolbar Button
const ToolbarButton = ({
  onMouseDown,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={isActive}
    disabled={disabled}
    onMouseDown={onMouseDown}
    className={`p-1.5 min-w-[32px] h-8 flex items-center justify-center rounded text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300
      ${isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {children}
  </button>
);

// Clean Dropdown Component
const ToolbarDropdown = ({ 
  label, 
  isActive = false, 
  children 
}: { 
  label: React.ReactNode; 
  isActive?: boolean; 
  children: React.ReactNode 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={`p-1.5 h-8 flex items-center gap-1 justify-center rounded text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300
          ${isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        `}
      >
        {label}
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </button>

      {isOpen && (
        <>
          {/* Invisible backdrop to handle closing when clicking outside */}
          <div className="fixed inset-0 z-40" onMouseDown={(e) => { e.preventDefault(); setIsOpen(false); }} />
          <div className="absolute left-0 z-50 mt-1 w-40 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" onClick={() => setIsOpen(false)}>
            <div className="py-1 flex flex-col gap-1 p-1">{children}</div>
          </div>
        </>
      )}
    </div>
  );
};

const DropdownItem = ({ onMouseDown, isActive, children }: { onMouseDown: (e: React.MouseEvent) => void, isActive?: boolean, children: React.ReactNode }) => (
  <button
    onMouseDown={onMouseDown}
    className={`flex w-full items-center px-2 py-1.5 text-sm rounded-md transition-colors ${isActive ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden="true" />;

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handler = () => forceUpdate(n => n + 1);
    editor.on('transaction', handler);
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('transaction', handler);
      editor.off('selectionUpdate', handler);
    };
  }, [editor]);

  const cmd = useCallback((fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  }, []);

  const setLink = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return <div className="h-12 border-b border-gray-200 bg-white flex items-center px-2" />;
  }

  // Determine active heading for dropdown label
  const getActiveHeading = () => {
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    return 'Normal text';
  };

  return (
    <>
      <div role="toolbar" aria-label="Editor formatting" className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
        
        {/* History */}
        <ToolbarButton title="Undo" disabled={!editor.can().undo()} onMouseDown={cmd(() => editor.chain().focus().undo().run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
        </ToolbarButton>
        <ToolbarButton title="Redo" disabled={!editor.can().redo()} onMouseDown={cmd(() => editor.chain().focus().redo().run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
        </ToolbarButton>

        <Divider />

        {/* Heading Dropdown */}
        <ToolbarDropdown label={<span className="w-20 text-left truncate">{getActiveHeading()}</span>} isActive={editor.isActive('heading')}>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().setParagraph().run())} isActive={editor.isActive('paragraph')}>Normal text</DropdownItem>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} isActive={editor.isActive('heading', { level: 1 })}><span className="text-xl font-bold">Heading 1</span></DropdownItem>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} isActive={editor.isActive('heading', { level: 2 })}><span className="text-lg font-bold">Heading 2</span></DropdownItem>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} isActive={editor.isActive('heading', { level: 3 })}><span className="text-base font-bold">Heading 3</span></DropdownItem>
        </ToolbarDropdown>

        {/* Lists Dropdown */}
        <ToolbarDropdown 
          label={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>} 
          isActive={editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')}
        >
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleBulletList().run())} isActive={editor.isActive('bulletList')}>
            • Bullet List
          </DropdownItem>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleOrderedList().run())} isActive={editor.isActive('orderedList')}>
            1. Ordered List
          </DropdownItem>
          <DropdownItem onMouseDown={cmd(() => editor.chain().focus().toggleTaskList().run())} isActive={editor.isActive('taskList')}>
            ☑ Task List
          </DropdownItem>
        </ToolbarDropdown>

        {/* Blockquote Button */}
        <ToolbarButton 
          title="Blockquote" 
          isActive={editor.isActive('blockquote')} 
          disabled={!editor.can().toggleBlockquote()} 
          onMouseDown={cmd(() => editor.chain().focus().toggleBlockquote().run())}
        >
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </ToolbarButton>

        {/* Code Block Button */}
        <ToolbarButton 
          title="Code Block" 
          isActive={editor.isActive('codeBlock')} 
          disabled={!editor.can().toggleCodeBlock()} 
          onMouseDown={cmd(() => editor.chain().focus().toggleCodeBlock().run())}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 18l6-6-6-6M8 6L2 12l6 6" />
          </svg>
        </ToolbarButton>

        <Divider />

        {/* Marks */}
        <ToolbarButton title="Bold" isActive={editor.isActive('bold')} disabled={!editor.can().toggleBold()} onMouseDown={cmd(() => editor.chain().focus().toggleBold().run())}>
          <span className="font-bold font-serif">B</span>
        </ToolbarButton>
        <ToolbarButton title="Italic" isActive={editor.isActive('italic')} disabled={!editor.can().toggleItalic()} onMouseDown={cmd(() => editor.chain().focus().toggleItalic().run())}>
          <span className="italic font-serif">I</span>
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" isActive={editor.isActive('strike')} disabled={!editor.can().toggleStrike()} onMouseDown={cmd(() => editor.chain().focus().toggleStrike().run())}>
          <span className="line-through font-serif">S</span>
        </ToolbarButton>
        <ToolbarButton title="Code" isActive={editor.isActive('code')} disabled={!editor.can().toggleCode()} onMouseDown={cmd(() => editor.chain().focus().toggleCode().run())}>
          <span className="font-mono text-[10px]">{'</>'}</span>
        </ToolbarButton>
        <ToolbarButton title="Underline" isActive={editor.isActive('underline')} onMouseDown={cmd(() => editor.chain().focus().toggleUnderline?.().run())}>
          <span className="underline font-serif">U</span>
        </ToolbarButton>
        <ToolbarButton title="Highlight" isActive={editor.isActive('highlight')} onMouseDown={cmd(() => editor.chain().focus().toggleHighlight?.().run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
        </ToolbarButton>
        <ToolbarButton title="Link" isActive={editor.isActive('link')} onMouseDown={setLink}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
        </ToolbarButton>

        <Divider />

        {/* Script Group */}
        <ToolbarButton title="Superscript" isActive={editor.isActive('superscript')} onMouseDown={cmd(() => editor.chain().focus().toggleSuperscript?.().run())}>
          <span>x²</span>
        </ToolbarButton>
        <ToolbarButton title="Subscript" isActive={editor.isActive('subscript')} onMouseDown={cmd(() => editor.chain().focus().toggleSubscript?.().run())}>
          <span>x₂</span>
        </ToolbarButton>

        <Divider />

        {/* Alignment */}
        <ToolbarButton title="Align Left" isActive={editor.isActive({ textAlign: 'left' })} onMouseDown={cmd(() => editor.chain().focus().setTextAlign('left').run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h10M4 18h16"></path></svg>
        </ToolbarButton>
        <ToolbarButton title="Align Center" isActive={editor.isActive({ textAlign: 'center' })} onMouseDown={cmd(() => editor.chain().focus().setTextAlign('center').run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10M4 18h16"></path></svg>
        </ToolbarButton>
        <ToolbarButton title="Align Right" isActive={editor.isActive({ textAlign: 'right' })} onMouseDown={cmd(() => editor.chain().focus().setTextAlign('right').run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M10 12h10M4 18h16"></path></svg>
        </ToolbarButton>
        <ToolbarButton title="Justify" isActive={editor.isActive({ textAlign: 'justify' })} onMouseDown={cmd(() => editor.chain().focus().setTextAlign('justify').run())}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </ToolbarButton>

      <Divider />

      {/* Table insertion — delegates entirely to EditorTableToolbar */}
      <TableCreationPicker
        onInsert={(rows, cols) =>
          editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
        }
      />
    </div>
  
    {/* ── Contextual table controls (visible only when cursor is in a table) ── */}
    <TableControls editor={editor} />
  </>
  );
}