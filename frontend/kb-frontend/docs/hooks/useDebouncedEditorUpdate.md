# useDebouncedEditorUpdate

## Purpose

`useDebouncedEditorUpdate` debounces Tiptap editor updates before calling the editor `onChange` handler.

It prevents autosave/update logic from running on every keystroke while still flushing the latest editor content safely.

## Where It Is Used

`KnowledgeBaseEditor` uses this hook inside Tiptap’s `onUpdate` callback:

```ts
onUpdate: ({ editor }) => {
  scheduleChange(editor);
};
```

`ArticleEditorShell` passes changes to `useArticleDraftEditor`, which owns draft loading, locking, autosave, retries, and release.

## API

```ts
useDebouncedEditorUpdate(
  onChange: (content: JSONContent) => void | Promise<void>,
  delayMs: number,
  onError?: (error: unknown) => void,
): (editor: Editor) => void
```

## Behavior

- Stores the latest changed editor instance.
- Waits for the debounce delay before serializing content.
- Resets the timer when more edits happen before the delay finishes.
- Serializes content with `editor.getJSON()`.
- Calls the latest `onChange` handler with `JSONContent`, rendered HTML, and plain text when available.
- Flushes pending changes when the component unmounts.
- Skips flushing if the editor is already destroyed.
- Uses `1000ms` when `delayMs` is invalid; `0` flushes immediately for the draft coordinator.

## Editor Integration

`KnowledgeBaseEditor` exposes:

```ts
changeDebounceMs?: number
onChange: EditorChangeHandler
onChangeError?: EditorUpdateErrorHandler
```

The default debounce delay is:

```ts
const DEFAULT_CHANGE_DEBOUNCE_MS = 1000;
```

The editor itself is rendered client-side only through `ArticleEditorShell` using `next/dynamic` with `ssr: false`.

## Autosave Status Integration

`ArticleDraftAutosaveCoordinator` uses the debounced `onChange` flow to update save status:

- `saving` when autosave starts.
- `saved` when autosave succeeds.
- `failed` when autosave throws or the hook reports an error.

## Error Handling

The hook catches:

- `editor.getJSON()` errors.
- Synchronous `onChange` errors.
- Async rejected `onChange` promises.

If `onError` is provided, it is called. Otherwise, the error is logged with `logDevError`.

The caller can use `onChangeError` to surface serialization errors; network save errors are handled by the draft coordinator.

## Storage Impact

None directly.

The hook emits Tiptap JSON plus rendered HTML and plain text. Backend autosave, draft persistence, conflict handling, and save status UI are handled by `useArticleDraftEditor`.

## Tests

Covered behavior includes:

- Rapid editor updates serialize only once.
- The latest pending update flushes on unmount.
- Destroyed editors are ignored.
- Pending updates use the latest `onChange` handler.
