import { Editor, type JSONContent } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { TextSelection, type Plugin } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEditorExtensions } from '.';
import type { EditorFileUploadAdapter } from './FileHandlerIntegration';
import {
  EDITOR_EXTENSION_BLOCKERS,
  resolveEditorExtensionFeatureFlags,
} from './editorFeatureFlags';

const editors: Editor[] = [];

type RuntimePluginKey = {
  key?: unknown;
};

function getPluginKeyName(plugin: Plugin): string {
  const key = plugin.spec.key as RuntimePluginKey | undefined;

  return typeof key?.key === 'string' ? key.key : '';
}

function createEditor(options: {
  content?: JSONContent | string;
  editable?: boolean;
  upload?: EditorFileUploadAdapter;
  allowedMimeTypes?: readonly string[];
} = {}): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    editable: options.editable ?? true,
    content: options.content,
    extensions: getEditorExtensions({
      fileHandler: options.upload
        ? {
            adapter: options.upload,
            allowedMimeTypes: options.allowedMimeTypes,
          }
        : undefined,
    }),
  });
  editors.push(editor);
  return editor;
}

function file(name: string, type: string): File {
  return new File(['file body'], name, { type });
}

function getFileHandlerPlugin(editor: Editor): Plugin {
  const plugin = editor.state.plugins.find((candidate) =>
    getPluginKeyName(candidate).startsWith('fileHandler$'),
  );
  expect(plugin).toBeDefined();
  return plugin!;
}

function pasteFiles(
  editor: Editor,
  files: File[],
  options: { html?: string; text?: string } = {},
): { event: Event; handled: boolean | void } {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      getData: (type: string) =>
        type === 'text/html'
          ? options.html ?? ''
          : type === 'text/plain'
            ? options.text ?? ''
            : '',
      },
  });

  const plugin = getFileHandlerPlugin(editor);
  const handled = plugin.props.handlePaste?.call(
    plugin,
    editor.view,
    event as ClipboardEvent,
    Slice.empty,
  );
  return { event, handled };
}

function dropFiles(editor: Editor, files: File[]): boolean | void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: 1 },
    clientY: { value: 1 },
    dataTransfer: {
      value: {
        files,
        types: [],
      },
    },
  });

  const originalPosAtCoords = editor.view.posAtCoords;
  editor.view.posAtCoords = (() => ({ pos: 1, inside: -1 })) as typeof editor.view.posAtCoords;
  try {
    const plugin = getFileHandlerPlugin(editor);
    return plugin.props.handleDrop?.call(
      plugin,
      editor.view,
      event as DragEvent,
      Slice.empty,
      false,
    );
  } finally {
    editor.view.posAtCoords = originalPosAtCoords;
  }
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('official Tiptap extension integration', () => {
  it('initializes with the requested public extensions and without legacy drag plugins', () => {
    const extensions = getEditorExtensions({
      fileHandler: {
        adapter: vi.fn<EditorFileUploadAdapter>(),
      },
    });
    const names = extensions.map((extension) => extension.name);

    expect(names).toContain('fileHandler');
    expect(names).toContain('Mathematics');
    expect(names).toContain('selection');
    expect(names).toContain('characterCount');
    expect(names).not.toContain('contentBlockDragHandle');
    expect(names).not.toContain('tableDragHandle');

    const editor = createEditor({ upload: vi.fn<EditorFileUploadAdapter>() });
    expect(editor.storage.characterCount.characters()).toBe(0);
    expect(
      editor.state.plugins.some((plugin) =>
        getPluginKeyName(plugin).startsWith('fileHandler$'),
      ),
    ).toBe(true);
    expect(
      editor.state.plugins.some((plugin) =>
        /contentBlockDragHandle|tableDragHandle/.test(
          getPluginKeyName(plugin),
        ),
      ),
    ).toBe(false);
  });

  it('calls the upload adapter for supported pasted and dropped files', () => {
    const upload = vi.fn<EditorFileUploadAdapter>();
    const editor = createEditor({
      upload,
      allowedMimeTypes: ['image/png'],
    });
    const image = file('diagram.png', 'image/png');

    expect(pasteFiles(editor, [image]).handled).toBe(true);
    expect(dropFiles(editor, [image])).toBe(true);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0]).toBe(image);
    expect(upload.mock.calls[0][1]).toMatchObject({ source: 'paste' });
    expect(upload.mock.calls[1][1]).toMatchObject({ source: 'drop' });
  });

  it('rejects unsupported file types and does not upload in read-only editors', () => {
    const upload = vi.fn<EditorFileUploadAdapter>();
    const editor = createEditor({
      upload,
      allowedMimeTypes: ['image/png'],
    });

    const unsupportedPaste = pasteFiles(editor, [
      file('notes.txt', 'text/plain'),
    ]);
    expect(unsupportedPaste.event.defaultPrevented).toBe(false);
    expect(unsupportedPaste.handled).toBe(false);
    expect(upload).not.toHaveBeenCalled();

    const readOnly = createEditor({
      editable: false,
      upload,
      allowedMimeTypes: ['image/png'],
    });
    pasteFiles(readOnly, [file('diagram.png', 'image/png')]);
    dropFiles(readOnly, [file('diagram.png', 'image/png')]);

    expect(upload).not.toHaveBeenCalled();
  });

  it('leaves HTML transformation to the existing paste sanitizer when files are present', () => {
    const upload = vi.fn<EditorFileUploadAdapter>();
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
      },
      upload,
      allowedMimeTypes: ['image/png'],
    });
    editor.commands.selectAll();

    const paste = pasteFiles(editor, [file('diagram.png', 'image/png')], {
      html: '<p onclick="alert(1)"><strong>Pasted once</strong></p>',
      text: 'Pasted once',
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(paste.handled).toBe(false);
    expect(editor.state.doc.textContent).toBe('Before');
  });

  it('serializes and restores inline and block mathematics', () => {
    const editor = createEditor();

    editor.commands.insertInlineMath({ latex: 'x^2 + y^2 = z^2' });
    editor.commands.insertBlockMath({ latex: '\\sum_{i=1}^{n} i' });

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('inlineMath');
    expect(JSON.stringify(json)).toContain('blockMath');
    expect(editor.getHTML()).toContain('data-type="inline-math"');
    expect(editor.getHTML()).toContain('data-type="block-math"');

    const restored = createEditor({ content: json });
    expect(restored.getJSON()).toEqual(json);
  });

  it('keeps the selection class decorated after editor focus leaves', () => {
    const editor = createEditor({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Selected text' }] },
        ],
      },
    });

    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 9)),
    );
    editor.view.dom.dispatchEvent(new FocusEvent('blur', { bubbles: false }));

    const selectionPlugin = editor.state.plugins.find((plugin) =>
      getPluginKeyName(plugin).startsWith('selection$'),
    );
    const decorations = selectionPlugin?.props.decorations?.call(
      selectionPlugin,
      editor.state,
    );
    let decorationCount = 0;
    decorations?.forEachSet((set) => {
      decorationCount += set.find().length;
    });

    expect(decorationCount).toBe(1);
  });

  it('keeps plan/backend dependent extensions feature-flagged with documented blockers', () => {
    const flags = resolveEditorExtensionFeatureFlags();

    expect(flags.comments).toBe(false);
    expect(flags.import).toBe(false);
    expect(flags.export).toBe(false);
    expect(flags.pages).toBe(false);
    expect(flags.pasteHandler).toBe(false);
    expect(EDITOR_EXTENSION_BLOCKERS.comments).toContain('Start plan');
    expect(EDITOR_EXTENSION_BLOCKERS.pages).toContain('Team plan');
    expect(EDITOR_EXTENSION_BLOCKERS.fileHandlerBackend).toContain('upload adapter');
    expect(EDITOR_EXTENSION_BLOCKERS.realtimeCollaboration).toContain('not registered');
  });
});
