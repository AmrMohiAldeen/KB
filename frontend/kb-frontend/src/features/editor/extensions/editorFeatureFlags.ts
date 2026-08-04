export type EditorExtensionFeatureFlags = {
  characterCount: boolean;
  comments: boolean;
  export: boolean;
  fileHandler: boolean;
  import: boolean;
  mathematics: boolean;
  pages: boolean;
  pasteHandler: boolean;
  selection: boolean;
};

export const DEFAULT_EDITOR_EXTENSION_FEATURE_FLAGS: EditorExtensionFeatureFlags = {
  characterCount: true,
  comments: false,
  export: false,
  fileHandler: true,
  import: false,
  mathematics: true,
  pages: false,
  pasteHandler: false,
  selection: true,
};

export const EDITOR_EXTENSION_BLOCKERS = {
  comments:
    'Tiptap Comments is a Start plan/private-registry extension and is not enabled without credentials and product wiring.',
  export:
    'Tiptap Export is a Start plan/private-registry extension and needs a configured export workflow before it can be enabled.',
  fileHandlerBackend:
    'FileHandler is installed from public npm, but uploads are disabled until a backend upload adapter is provided.',
  import:
    'Tiptap Import is a Start plan/private-registry extension and needs import UX plus backend handling before it can be enabled.',
  pages:
    'Tiptap Pages is a Team plan/private-registry extension and is intentionally not installed.',
  pasteHandler:
    'Tiptap Paste Handler is a Team plan/private-registry extension; the existing PasteSanitizer remains the active paste cleanup path.',
  realtimeCollaboration:
    'DragHandle peer packages include collaboration utilities, but the Collaboration extension is not registered.',
} as const;

export function resolveEditorExtensionFeatureFlags(
  overrides: Partial<EditorExtensionFeatureFlags> = {},
): EditorExtensionFeatureFlags {
  return {
    ...DEFAULT_EDITOR_EXTENSION_FEATURE_FLAGS,
    ...overrides,
  };
}
