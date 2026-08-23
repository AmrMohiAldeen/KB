'use client'

import { Mark, mergeAttributes, type JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import Box from '@mui/material/Box'
import { useEffect, useMemo } from 'react'
import { getEditorExtensions } from '@/features/editor/extensions'

const VersionDiffMark = Mark.create({
  name: 'versionDiff',
  excludes: '',
  addAttributes: () => ({ side: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-version-diff': HTMLAttributes.side }),
    0
  ]
})

export default function VersionDiffViewer({ content }: { content: JSONContent }) {
  const extensions = useMemo(() => [
    ...getEditorExtensions({ featureFlags: { fileHandler: false } }),
    VersionDiffMark
  ], [])
  const editor = useEditor({
    content,
    editable: false,
    extensions,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'kb-viewer focus:outline-none' } }
  }, [extensions])

  useEffect(() => { editor?.commands.setContent(content, { emitUpdate: false }) }, [content, editor])
  if (!editor) return null

  return (
    <Box
      className='prose prose-base max-w-none'
      sx={{
        '& [data-version-diff="removed"]': {
          bgcolor: 'error.lighterOpacity', color: 'error.dark', textDecoration: 'line-through',
          borderRadius: 0.5, boxDecorationBreak: 'clone', px: 0.25
        },
        '& [data-version-diff="added"]': {
          bgcolor: 'success.lighterOpacity', color: 'success.dark',
          borderRadius: 0.5, boxDecorationBreak: 'clone', px: 0.25
        }
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
}
