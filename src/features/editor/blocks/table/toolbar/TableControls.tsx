'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { selectionCell } from '@tiptap/pm/tables';
import { logDevError } from '../../../lib/utils/logDevError';
import { RgbColorItem } from '../../../components/toolbar/RgbColorItem';
import { HIGHLIGHT_COLORS } from '../../../components/toolbar/toolbarOptions';
import {
  Divider,
  DropdownCheckboxItem,
  DropdownItem,
  ToolbarButton,
  ToolbarDropdown,
} from '../../../components/toolbar/ToolbarPrimitives';
import {
  canRunTableCommand,
  getTableHeaderState,
  runTableActionCommand,
  runTableStructureCommand,
  updateTableBorders,
} from '../commands/tableCommands';
import {
  readTableBorderAttributes,
  type TableBorderAttributes,
} from '../utils/tableBorders';
import {
  BorderIcon,
  HeaderColumnIcon,
  HeaderRowIcon,
  InsertColumnAfterIcon,
  InsertColumnBeforeIcon,
  InsertRowAboveIcon,
  InsertRowBelowIcon,
  MergeIcon,
  SplitIcon,
  TrashIcon,
} from './TableIcons';

type TableControlState = {
  isVisible: boolean;
  headers: ReturnType<typeof getTableHeaderState>;
  borders: TableBorderAttributes;
  canAddRowBefore: boolean;
  canAddRowAfter: boolean;
  canAddColumnBefore: boolean;
  canAddColumnAfter: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
  canDeleteRow: boolean;
  canDeleteColumn: boolean;
  canDeleteTable: boolean;
  canToggleHeaderRow: boolean;
  canToggleHeaderColumn: boolean;
  cellBackgroundColor: string;
};

const INACTIVE_TABLE_CONTROL_STATE: TableControlState = {
  isVisible: false,
  headers: { hasHeaderRow: false, hasHeaderColumn: false },
  borders: readTableBorderAttributes({}),
  canAddRowBefore: false,
  canAddRowAfter: false,
  canAddColumnBefore: false,
  canAddColumnAfter: false,
  canMergeCells: false,
  canSplitCell: false,
  canDeleteRow: false,
  canDeleteColumn: false,
  canDeleteTable: false,
  canToggleHeaderRow: false,
  canToggleHeaderColumn: false,
  cellBackgroundColor: '',
};

export function getTableControlState(
  editor: Editor | null | undefined,
): TableControlState {
  if (!editor || editor.isDestroyed || !editor.isEditable) {
    return INACTIVE_TABLE_CONTROL_STATE;
  }

  try {
    if (!editor.isActive('table')) return INACTIVE_TABLE_CONTROL_STATE;

    return {
      isVisible: true,
      headers: getTableHeaderState(editor.state),
      borders: readTableBorderAttributes(editor.getAttributes('table')),
      canAddRowBefore: canRunTableCommand(editor, 'addRowBefore'),
      canAddRowAfter: canRunTableCommand(editor, 'addRowAfter'),
      canAddColumnBefore: canRunTableCommand(editor, 'addColumnBefore'),
      canAddColumnAfter: canRunTableCommand(editor, 'addColumnAfter'),
      canMergeCells: canRunTableCommand(editor, 'mergeCells'),
      canSplitCell: canRunTableCommand(editor, 'splitCell'),
      canDeleteRow: canRunTableCommand(editor, 'deleteRow'),
      canDeleteColumn: canRunTableCommand(editor, 'deleteColumn'),
      canDeleteTable: canRunTableCommand(editor, 'deleteTable'),
      canToggleHeaderRow: canRunTableCommand(editor, 'toggleHeaderRow'),
      canToggleHeaderColumn: canRunTableCommand(editor, 'toggleHeaderColumn'),
      cellBackgroundColor: String(
        selectionCell(editor.state).nodeAfter?.attrs.backgroundColor ?? '',
      ),
    };
  } catch (error) {
    logDevError('Table controls state lookup failed:', error);
    return INACTIVE_TABLE_CONTROL_STATE;
  }
}

export function TableControls({ editor }: { editor: Editor }) {
  const tableState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => getTableControlState(currentEditor),
  });

  if (!tableState.isVisible) return null;

  const { hasHeaderRow, hasHeaderColumn } = tableState.headers;
  const {
    borderTopEnabled,
    borderRightEnabled,
    borderBottomEnabled,
    borderLeftEnabled,
    borderInnerEnabled,
  } = tableState.borders;
  const outerBorderEnabled =
    borderTopEnabled &&
    borderRightEnabled &&
    borderBottomEnabled &&
    borderLeftEnabled;
  const allBordersEnabled = outerBorderEnabled && borderInnerEnabled;
  const hasAnyBorderEnabled = Object.values(tableState.borders).some(Boolean);

  const updateBorders = (attributes: Partial<TableBorderAttributes>) => {
    updateTableBorders(editor, attributes);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-amber-100 bg-amber-50/70 px-2 py-1"
      role="toolbar"
      aria-label="Table controls"
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
        Table
      </span>
      <Divider className="bg-amber-200" />

      <ToolbarDropdown
        title="Insert table row or column"
        label={
          <>
            <InsertRowBelowIcon />
            <span className="text-xs">Insert</span>
          </>
        }
        menuClassName="w-40"
      >
        <DropdownItem
          disabled={!tableState.canAddRowBefore}
          onActivate={() => runTableStructureCommand(editor, 'addRowBefore')}
        >
          <InsertRowAboveIcon />Row above
        </DropdownItem>
        <DropdownItem
          disabled={!tableState.canAddRowAfter}
          onActivate={() => runTableStructureCommand(editor, 'addRowAfter')}
        >
          <InsertRowBelowIcon />Row below
        </DropdownItem>
        <DropdownItem
          disabled={!tableState.canAddColumnBefore}
          onActivate={() => runTableStructureCommand(editor, 'addColumnBefore')}
        >
          <InsertColumnBeforeIcon />Col before
        </DropdownItem>
        <DropdownItem
          disabled={!tableState.canAddColumnAfter}
          onActivate={() => runTableStructureCommand(editor, 'addColumnAfter')}
        >
          <InsertColumnAfterIcon />Col after
        </DropdownItem>
      </ToolbarDropdown>

      <ToolbarDropdown
        title="Table cell background color"
        isActive={Boolean(tableState.cellBackgroundColor)}
        label={
          <>
            <span
              className="h-3.5 w-3.5 rounded-sm border border-amber-300"
              style={{
                backgroundColor: tableState.cellBackgroundColor || '#ffffff',
              }}
            />
            <span className="text-xs">Cell color</span>
          </>
        }
        menuClassName="w-44"
      >
        {({ close }) => (
          <>
            {HIGHLIGHT_COLORS.map((color) => (
              <DropdownItem
                key={color.value}
                isActive={tableState.cellBackgroundColor === color.value}
                onActivate={() =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute('backgroundColor', color.value)
                    .run()
                }
              >
                <span
                  className="h-3 w-3 rounded-sm border border-gray-300"
                  style={{ backgroundColor: color.value }}
                />
                {color.label}
              </DropdownItem>
            ))}
            <DropdownItem
              onActivate={() =>
                editor
                  .chain()
                  .focus()
                  .setCellAttribute('backgroundColor', null)
                  .run()
              }
            >
              Remove cell color
            </DropdownItem>
            <div className="my-1 border-t border-gray-200" />
            <RgbColorItem
              label="RGB cell color"
              onApply={(color) =>
                editor
                  .chain()
                  .focus()
                  .setCellAttribute('backgroundColor', color)
                  .run()
              }
              onClose={close}
            />
          </>
        )}
      </ToolbarDropdown>

      <Divider className="bg-amber-200" />
      <ToolbarButton
        title="Merge cells"
        className="text-xs"
        disabled={!tableState.canMergeCells}
        onActivate={() => runTableActionCommand(editor, 'mergeCells')}
      >
        <MergeIcon />Merge
      </ToolbarButton>
      <ToolbarButton
        title="Split cell"
        className="text-xs"
        disabled={!tableState.canSplitCell}
        onActivate={() => runTableActionCommand(editor, 'splitCell')}
      >
        <SplitIcon />Split
      </ToolbarButton>

      <Divider className="bg-amber-200" />
      <ToolbarDropdown
        title="Delete table row, column, or table"
        danger
        label={
          <>
            <TrashIcon />
            <span className="text-xs">Delete</span>
          </>
        }
        menuClassName="w-32"
      >
        <DropdownItem
          danger
          disabled={!tableState.canDeleteRow}
          onActivate={() => runTableStructureCommand(editor, 'deleteRow')}
        >
          <TrashIcon />Delete row
        </DropdownItem>
        <DropdownItem
          danger
          disabled={!tableState.canDeleteColumn}
          onActivate={() => runTableStructureCommand(editor, 'deleteColumn')}
        >
          <TrashIcon />Delete column
        </DropdownItem>
        <DropdownItem
          danger
          disabled={!tableState.canDeleteTable}
          onActivate={() => runTableActionCommand(editor, 'deleteTable')}
        >
          <TrashIcon />Delete table
        </DropdownItem>
      </ToolbarDropdown>

      <Divider className="bg-amber-200" />
      <ToolbarDropdown
        title="Toggle table headers"
        isActive={hasHeaderRow || hasHeaderColumn}
        label={
          <>
            <HeaderRowIcon />
            <span className="text-xs">Header</span>
          </>
        }
        menuClassName="w-36"
      >
        <DropdownItem
          isActive={hasHeaderRow}
          disabled={!tableState.canToggleHeaderRow}
          onActivate={() => runTableActionCommand(editor, 'toggleHeaderRow')}
        >
          <HeaderRowIcon />Header row
        </DropdownItem>
        <DropdownItem
          isActive={hasHeaderColumn}
          disabled={!tableState.canToggleHeaderColumn}
          onActivate={() => runTableActionCommand(editor, 'toggleHeaderColumn')}
        >
          <HeaderColumnIcon />Header column
        </DropdownItem>
      </ToolbarDropdown>

      <Divider className="bg-amber-200" />
      <ToolbarDropdown
        title="Customize table borders"
        isActive={hasAnyBorderEnabled}
        label={
          <>
            <BorderIcon />
            <span className="text-xs">Borders</span>
          </>
        }
        menuClassName="w-36"
      >
        <DropdownCheckboxItem
          checked={allBordersEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({
              borderTopEnabled: enabled,
              borderRightEnabled: enabled,
              borderBottomEnabled: enabled,
              borderLeftEnabled: enabled,
              borderInnerEnabled: enabled,
            })
          }
        >
          All borders
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={outerBorderEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({
              borderTopEnabled: enabled,
              borderRightEnabled: enabled,
              borderBottomEnabled: enabled,
              borderLeftEnabled: enabled,
            })
          }
        >
          Outer border
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={borderInnerEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({ borderInnerEnabled: enabled })
          }
        >
          Inner border
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={borderTopEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({ borderTopEnabled: enabled })
          }
        >
          Top border
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={borderRightEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({ borderRightEnabled: enabled })
          }
        >
          Right border
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={borderBottomEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({ borderBottomEnabled: enabled })
          }
        >
          Bottom border
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={borderLeftEnabled}
          onCheckedChange={(enabled) =>
            updateBorders({ borderLeftEnabled: enabled })
          }
        >
          Left border
        </DropdownCheckboxItem>
      </ToolbarDropdown>
    </div>
  );
}
