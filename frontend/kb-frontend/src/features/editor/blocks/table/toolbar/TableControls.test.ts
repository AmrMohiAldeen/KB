import { Editor } from '@tiptap/core';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../../../extensions';
import { getActiveTable } from '../dom/tableDom';
import { updateTableBorders } from '../commands/tableCommands';
import { getTableControlState } from './TableControls';

describe('table control state', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('stays inactive without a usable active table', () => {
    expect(getTableControlState(null).isVisible).toBe(false);

    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    expect(getTableControlState(editor).isVisible).toBe(false);

    editor.destroy();
    expect(getTableControlState(editor).isVisible).toBe(false);
    editor = null;
  });

  it('tracks selection capabilities and persisted border state', () => {
    const element = document.createElement('div');
    document.body.append(element);
    editor = new Editor({ element, extensions: getEditorExtensions() });
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    let controls = getTableControlState(editor);
    expect(controls.isVisible).toBe(true);
    expect(controls.canDeleteRow).toBe(true);
    expect(controls.canDeleteColumn).toBe(true);

    const activeTable = getActiveTable(editor.state);
    expect(activeTable).not.toBeNull();
    const map = TableMap.get(activeTable!.node);
    const tableStart = activeTable!.pos + 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(
          editor.state.doc,
          tableStart + map.map[0],
          tableStart + map.map[map.map.length - 1],
        ),
      ),
    );

    controls = getTableControlState(editor);
    expect(controls.canDeleteRow).toBe(false);
    expect(controls.canDeleteColumn).toBe(false);
    expect(controls.canMergeCells).toBe(true);

    expect(updateTableBorders(editor, { borderInnerEnabled: false })).toBe(true);
    controls = getTableControlState(editor);
    expect(controls.borders.borderInnerEnabled).toBe(false);
  });
});
