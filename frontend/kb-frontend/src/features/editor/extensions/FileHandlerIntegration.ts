import FileHandler from '@tiptap/extension-file-handler';
import type { Editor } from '@tiptap/core';
import { logDevError } from '../lib/utils/logDevError';

export const DEFAULT_ALLOWED_FILE_MIME_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type EditorFileUploadSource = 'drop' | 'paste';

export type EditorFileUploadContext = {
  editor: Editor;
  htmlContent?: string;
  pos?: number;
  source: EditorFileUploadSource;
};

export type EditorFileUploadAdapter = (
  file: File,
  context: EditorFileUploadContext,
) => Promise<void> | void;

export type EditorFileUploadErrorHandler = (
  error: unknown,
  file: File,
  context: EditorFileUploadContext,
) => void;

export type EditorFileHandlerOptions = {
  adapter?: EditorFileUploadAdapter;
  allowedMimeTypes?: readonly string[];
  onUploadError?: EditorFileUploadErrorHandler;
};

function uploadFiles(
  files: File[],
  context: EditorFileUploadContext,
  options: Required<Pick<EditorFileHandlerOptions, 'adapter'>> &
    Pick<EditorFileHandlerOptions, 'onUploadError'>,
): void {
  if (!context.editor.isEditable) return;

  files.forEach((file) => {
    void Promise.resolve(options.adapter(file, context)).catch((error: unknown) => {
      if (options.onUploadError) {
        options.onUploadError(error, file, context);
        return;
      }

      logDevError('File upload adapter failed:', error);
    });
  });
}

export function createFileHandlerExtension(
  options: EditorFileHandlerOptions | undefined,
) {
  if (!options?.adapter) return [];

  const uploadOptions = {
    adapter: options.adapter,
    onUploadError: options.onUploadError,
  };
  const allowedMimeTypes = [
    ...(options.allowedMimeTypes ?? DEFAULT_ALLOWED_FILE_MIME_TYPES),
  ];

  return [
    FileHandler.configure({
      allowedMimeTypes,
      onDrop: (editor, files, pos) => {
        uploadFiles(files, { editor, pos, source: 'drop' }, uploadOptions);
      },
      onPaste: (editor, files, htmlContent) => {
        uploadFiles(
          files,
          { editor, htmlContent, source: 'paste' },
          uploadOptions,
        );
      },
    }),
  ];
}
