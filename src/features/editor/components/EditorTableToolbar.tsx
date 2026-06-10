"use client"

import { Editor } from '@tiptap/react';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TableMap } from '@tiptap/pm/tables';



// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ROWS = 8;
const MAX_COLS = 8;
const ICON_SIZE = 'w-3.5 h-3.5';

const IconBtn = ({
  title,
  onMouseDown,
  isActive,
  danger,
  children,
}: {
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
  isActive?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onMouseDown={onMouseDown}
    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap
      ${danger
        ? 'text-red-600 hover:bg-red-50'
        : isActive
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-gray-600 hover:bg-gray-100'}
    `}
  >
    {children}
  </button>
);

const Sep = () => <div className="w-px h-4 bg-amber-200 mx-0.5" />;


// ─── Shared helper: find the .tableWrapper DOM node for the active table ──────
function getTableWrapper(editor: Editor): HTMLElement | null {
  const { state, view } = editor;
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      const pos = $from.before(depth);
      const domNode = view.nodeDOM(pos);
      if (domNode instanceof HTMLElement) {
        return (domNode.closest('.tableWrapper') as HTMLElement) ?? domNode;
      }
    }
    depth--;
  }
  return null;
}

// ─── TableCreationPicker ──────────────────────────────────────────────────────
export const TableCreationPicker = ({
  onInsert,
}: {
  onInsert: (rows: number, cols: number) => void;
}) => {
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const [manualRows, setManualRows] = useState('');
  const [manualCols, setManualCols] = useState('');
  
  const buttonRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const handleGridClick = (rows: number, cols: number) => {
    onInsert(rows, cols);
    setIsOpen(false);
    setHover({ rows: 0, cols: 0 });
  };

  const handleManualInsert = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = Math.max(1, Math.min(100, parseInt(manualRows) || 3));
    const c = Math.max(1, Math.min(20, parseInt(manualCols) || 3));
    onInsert(r, c);
    setIsOpen(false);
    setManualRows('');
    setManualCols('');
  };

  return (
    <div ref={buttonRef} className="relative inline-block">
      <button
        type="button"
        title="Insert Table"
        aria-label="Insert Table"
        onMouseDown={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={`p-1.5 h-8 flex items-center gap-1 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300
          ${isOpen ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        `}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-6-8v8m12-8v8M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
        </svg>
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onMouseDown={(e) => { e.preventDefault(); setIsOpen(false); }}
          />

          {createPortal(
            <div 
              className="fixed z-50 rounded-lg bg-white shadow-xl ring-1 ring-black ring-opacity-5 p-3 min-w-max"
              style={{
                top: `${coords.top}px`,
                right: `${coords.right}px`,
              }}
            >
              <p className="text-xs text-gray-500 mb-2 font-medium">
                {hover.rows > 0 && hover.cols > 0
                  ? `${hover.rows} × ${hover.cols} table`
                  : 'Select table size'}
              </p>

              <div
                className="grid gap-1 mb-3"
                style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}
                onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
              >
                {Array.from({ length: MAX_ROWS }, (_, r) =>
                  Array.from({ length: MAX_COLS }, (_, c) => {
                    const row = r + 1;
                    const col = c + 1;
                    const highlighted = row <= hover.rows && col <= hover.cols;
                    return (
                      <div
                        key={`${row}-${col}`}
                        className={`w-5 h-5 rounded-sm border transition-colors cursor-pointer ${
                          highlighted
                            ? 'bg-blue-500 border-blue-600'
                            : 'bg-gray-50 border-gray-200 hover:bg-blue-100 hover:border-blue-300'
                        }`}
                        onMouseEnter={() => setHover({ rows: row, cols: col })}
                        onMouseDown={(e) => { e.preventDefault(); handleGridClick(row, col); }}
                      />
                    );
                  })
                )}
              </div>

              <div className="border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-400 mb-1.5">Custom size</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Rows"
                    value={manualRows}
                    onChange={(e) => setManualRows(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-14 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-gray-400 text-xs">×</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Cols"
                    value={manualCols}
                    onChange={(e) => setManualCols(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-14 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onMouseDown={handleManualInsert}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  >
                    Insert
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};

// ─── TableControls ─────────────────────────────────────────────────────────────
export const TableControls = ({ editor }: { editor: Editor }) => {
  const [visible, setVisible] = useState(false);
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const check = () => {
      setVisible(editor.isActive('table'));
      tick((n) => n + 1);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
    return () => {
      editor.off('selectionUpdate', check);
      editor.off('transaction', check);
    };
  }, [editor]);

  if (!visible) return null;

  const cmd = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); fn(); };

  const isOuterBorderOff = () => getTableWrapper(editor)?.classList.contains('no-outer-border') ?? false;
  const isInnerBorderOff = () => getTableWrapper(editor)?.classList.contains('no-inner-border') ?? false;

  const getHeaderStates = () => {
    if (!editor || !editor.isActive('table')) {
      return { hasHeaderRow: false, hasHeaderColumn: false };
    }

    const { state } = editor;
    const { $from } = state.selection;
    let tableNode = null;

    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tableNode = $from.node(d);
        break;
      }
    }

    if (!tableNode) return { hasHeaderRow: false, hasHeaderColumn: false };

    const map = TableMap.get(tableNode);

    const rowCheckIndex = map.width > 1 ? 1 : 0;
    const isHeaderRow = tableNode.nodeAt(map.map[rowCheckIndex])?.type.name === 'tableHeader';

    const colCheckIndex = map.height > 1 ? map.width : 0;
    const isHeaderColumn = tableNode.nodeAt(map.map[colCheckIndex])?.type.name === 'tableHeader';

    return { hasHeaderRow: isHeaderRow, hasHeaderColumn: isHeaderColumn };
  };

  // Call it directly on render
  const { hasHeaderRow, hasHeaderColumn } = getHeaderStates();

  return (
    <div
      className="flex items-center gap-0.5 flex-wrap px-2 py-1 border-b border-amber-100 bg-amber-50/70"
      role="toolbar"
      aria-label="Table controls"
    >
      <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mr-1">Table</span>
      <Sep />

      {/* Insert */}
      <IconBtn title="Insert row above" onMouseDown={cmd(() => editor.chain().focus().addRowBefore().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m-8-8h16" /></svg>
        Row ↑
      </IconBtn>
      <IconBtn title="Insert row below" onMouseDown={cmd(() => editor.chain().focus().addRowAfter().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m-8-8h16" /></svg>
        Row ↓
      </IconBtn>
      <IconBtn title="Insert column before" onMouseDown={cmd(() => editor.chain().focus().addColumnBefore().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m-8-8h16" /></svg>
        Col ←
      </IconBtn>
      <IconBtn title="Insert column after" onMouseDown={cmd(() => editor.chain().focus().addColumnAfter().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m-8-8h16" /></svg>
        Col →
      </IconBtn>

      <Sep />

      {/* Merge / Split */}
      <IconBtn title="Merge cells" onMouseDown={cmd(() => editor.chain().focus().mergeCells().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v6a2 2 0 002 2h3m8-11h3a2 2 0 012 2v6a2 2 0 01-2 2h-3M12 7v10" /></svg>
        Merge
      </IconBtn>
      <IconBtn title="Split cell" onMouseDown={cmd(() => editor.chain().focus().splitCell().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16M4 12h16" /></svg>
        Split
      </IconBtn>

      <Sep />

      {/* Delete */}
      <IconBtn title="Delete row" danger onMouseDown={cmd(() => editor.chain().focus().deleteRow().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7H5M10 11v6m4-6v6M9 7V4h6v3" /></svg>
        Del Row
      </IconBtn>
      <IconBtn title="Delete column" danger onMouseDown={cmd(() => editor.chain().focus().deleteColumn().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7H5M10 11v6m4-6v6M9 7V4h6v3" /></svg>
        Del Col
      </IconBtn>
      <IconBtn title="Delete table" danger onMouseDown={cmd(() => editor.chain().focus().deleteTable().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7H5M10 11v6m4-6v6M9 7V4h6v3" /></svg>
        Del Table
      </IconBtn>

      <Sep />

      {/* Header toggles */}
      <IconBtn title="Toggle header row" isActive={hasHeaderRow} onMouseDown={cmd(() => editor.chain().focus().toggleHeaderRow().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16" /></svg>
        Header
      </IconBtn>
      <IconBtn title="Toggle header column" isActive={hasHeaderColumn} onMouseDown={cmd(() => editor.chain().focus().toggleHeaderColumn().run())}>
        <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 4v16M10 4v16" /></svg>
        H-Col
      </IconBtn>

      <Sep />

      {/* Dynamic Unified Border Custom Widget */}
      <div className="relative inline-flex items-center gap-1 bg-amber-100/60 px-2 py-1 rounded text-xs border border-amber-200/80">
        <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-700 select-none">
          <input
            type="checkbox"
            title="Toggle All Borders"
            checked={!isOuterBorderOff() || !isInnerBorderOff()}
            onChange={() => {
              const wrapper = getTableWrapper(editor);
              if (!wrapper) return;
              const turningOff = !isOuterBorderOff() || !isInnerBorderOff();
              if (turningOff) {
                wrapper.classList.add('no-outer-border', 'no-inner-border');
              } else {
                wrapper.classList.remove('no-outer-border', 'no-inner-border');
              }
              tick((n) => n + 1);
            }}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
          />
          <span>Borders</span>
        </label>
        
        {/* Dropdown Options Indicator Button */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setBorderMenuOpen(!borderMenuOpen); }}
          className={`p-0.5 rounded transition-colors ${borderMenuOpen ? 'bg-amber-200 text-gray-900' : 'hover:bg-amber-200/60 text-gray-500'}`}
          title="Customize individual borders"
          aria-label="Customize borders"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Selection Card */}
        {borderMenuOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-transparent" onMouseDown={() => setBorderMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-md shadow-xl p-2 flex flex-col gap-1.5 min-w-[125px]">
              <label className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-50 rounded text-gray-700 text-[11px] font-medium select-none">
                <input
                  type="checkbox"
                  checked={!isOuterBorderOff()}
                  onChange={() => {
                    getTableWrapper(editor)?.classList.toggle('no-outer-border');
                    tick((n) => n + 1);
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Outer Border</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-50 rounded text-gray-700 text-[11px] font-medium select-none">
                <input
                  type="checkbox"
                  checked={!isInnerBorderOff()}
                  onChange={() => {
                    getTableWrapper(editor)?.classList.toggle('no-inner-border');
                    tick((n) => n + 1);
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Inner Border</span>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

