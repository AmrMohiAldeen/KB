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

`EditorWorkspace` passes the actual `onChange` autosave handler and `onChangeError` error handler into `KnowledgeBaseEditor`.

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
- Calls the latest `onChange` handler with the serialized `JSONContent`.
- Flushes pending changes when the component unmounts.
- Skips flushing if the editor is already destroyed.
- Uses `1000ms` when `delayMs` is invalid or non-positive.

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

The editor itself is rendered client-side only through `EditorWorkspace` using `next/dynamic` with `ssr: false`.

## Autosave Status Integration

`EditorWorkspace` uses the debounced `onChange` flow to update save status:

- `saving` when autosave starts.
- `saved` when autosave succeeds.
- `failed` when autosave throws or the hook reports an error.

## Error Handling

The hook catches:

- `editor.getJSON()` errors.
- Synchronous `onChange` errors.
- Async rejected `onChange` promises.

If `onError` is provided, it is called. Otherwise, the error is logged with `logDevError`.

`EditorWorkspace` uses `onChangeError` to mark autosave as failed and log the error.

## Storage Impact

None directly.

The hook only emits Tiptap `JSONContent`. Backend autosave, draft persistence, conflict handling, and save status UI are handled by the caller.

## Tests

Covered behavior includes:

- Rapid editor updates serialize only once.
- The latest pending update flushes on unmount.
- Destroyed editors are ignored.
- Pending updates use the latest `onChange` handler.
