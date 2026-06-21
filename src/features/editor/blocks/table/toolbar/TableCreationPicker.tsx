"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useState, type MouseEvent } from 'react';

const MAX_GRID_ROWS = 6;
const MAX_GRID_COLS = 8;
const MAX_MANUAL_ROWS = 100;
const MAX_MANUAL_COLS = 20;
const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;

type TableSize = {
  rows: number;
  cols: number;
};

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : Math.max(min, Math.min(max, parsed));
}

export function TableCreationPicker({
  onInsert,
}: {
  onInsert: (rows: number, cols: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredSize, setHoveredSize] = useState<TableSize>({ rows: 0, cols: 0 });
  const [manualRows, setManualRows] = useState('');
  const [manualCols, setManualCols] = useState('');
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-end',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context, { outsidePressEvent: 'mousedown' }),
    useRole(context, { role: 'dialog' }),
  ]);

  const close = () => {
    setIsOpen(false);
    setHoveredSize({ rows: 0, cols: 0 });
  };

  const insert = (rows: number, cols: number) => {
    onInsert(rows, cols);
    close();
  };

  const insertManualSize = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    insert(
      clampNumber(manualRows, DEFAULT_ROWS, 1, MAX_MANUAL_ROWS),
      clampNumber(manualCols, DEFAULT_COLS, 1, MAX_MANUAL_COLS),
    );
    setManualRows('');
    setManualCols('');
  };

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        title="Insert Table"
        aria-label="Insert Table"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        {...getReferenceProps({ onMouseDown: (event) => event.preventDefault() })}
        className={`flex h-8 items-center gap-1 rounded p-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isOpen
            ? 'bg-gray-200 text-gray-900'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-6-8v8m12-8v8M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
        </svg>
        <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} visuallyHiddenDismiss="Close table picker">
            <div
              // Floating UI exposes callback refs, not mutable React refs.
              // eslint-disable-next-line react-hooks/refs
              ref={refs.setFloating}
              {...getFloatingProps()}
              className="z-50 min-w-max rounded-lg bg-white p-3 shadow-xl ring-1 ring-black/10"
              style={floatingStyles}
            >
              <p className="mb-2 text-xs font-medium text-gray-500" aria-live="polite">
                {hoveredSize.rows > 0 && hoveredSize.cols > 0
                  ? `${hoveredSize.rows} by ${hoveredSize.cols} table`
                  : 'Select table size'}
              </p>

              <div
                className="mb-3 grid gap-1"
                style={{ gridTemplateColumns: `repeat(${MAX_GRID_COLS}, 1fr)` }}
                onMouseLeave={() => setHoveredSize({ rows: 0, cols: 0 })}
              >
                {Array.from({ length: MAX_GRID_ROWS }, (_, rowIndex) =>
                  Array.from({ length: MAX_GRID_COLS }, (_, columnIndex) => {
                    const rows = rowIndex + 1;
                    const cols = columnIndex + 1;
                    const highlighted =
                      rows <= hoveredSize.rows && cols <= hoveredSize.cols;

                    return (
                      <button
                        key={`${rows}-${cols}`}
                        type="button"
                        aria-label={`Insert ${rows} by ${cols} table`}
                        className={`h-5 w-5 rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          highlighted
                            ? 'border-blue-600 bg-blue-500'
                            : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-100'
                        }`}
                        onMouseEnter={() => setHoveredSize({ rows, cols })}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insert(rows, cols)}
                      />
                    );
                  }),
                )}
              </div>

              <div className="border-t border-gray-100 pt-2">
                <p className="mb-1.5 text-xs text-gray-400">Custom size</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    aria-label="Table rows"
                    min="1"
                    max={MAX_MANUAL_ROWS}
                    placeholder="Rows"
                    value={manualRows}
                    onChange={(event) => setManualRows(event.target.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="w-14 rounded border border-gray-200 px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">by</span>
                  <input
                    type="number"
                    aria-label="Table columns"
                    min="1"
                    max={MAX_MANUAL_COLS}
                    placeholder="Cols"
                    value={manualCols}
                    onChange={(event) => setManualCols(event.target.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="w-14 rounded border border-gray-200 px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={insertManualSize}
                    className="rounded bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Insert
                  </button>
                </div>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
