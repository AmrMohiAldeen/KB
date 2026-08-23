'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowDown, ArrowUp, Save } from 'lucide-react'
import CustomTextField from '@core/components/mui/TextField'
import { getCategoryTree, moveCategory, updateCategory } from '@/lib/api/categories'
import type { KbCategoryNode } from '@/views/kb/types/categories'
import { getViewerDashboardAppearance, updateViewerDashboardAppearance, type ViewerDashboardAppearance } from '@/lib/api/viewerDashboardSettingsApi'
import { KbPageHeader, KbPageShell } from '@/views/shared'
import KbCategoryDialog from '@/views/kb/categories/components/KbCategoryDialog'
import type { CategoryFormState } from '@/views/kb/categories/utils/categoryForm'

const defaults: ViewerDashboardAppearance = {
  primaryColor: '#1976D2', pageBackgroundColor: '#F8FAFC',
  categoryCardBackgroundColor: '#FFFFFF', textColor: '#1E293B'
}

const flatten = (categories: KbCategoryNode[]): Array<KbCategoryNode & { level: number }> =>
  categories.flatMap(category => [{ ...category, level: category.depth }, ...flatten(category.children).map(item => ({
    ...item, level: item.level
  }))])

export default function ViewerDashboardSettingsPage({ accessToken }: { accessToken: string }) {
  const [appearance, setAppearance] = useState(defaults)
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<KbCategoryNode | undefined>()

  const load = useCallback(async (signal?: AbortSignal) => {
    const [savedAppearance, tree] = await Promise.all([
      getViewerDashboardAppearance(accessToken, signal), getCategoryTree(accessToken, signal)
    ])
    setAppearance(savedAppearance)
    setCategories(tree)
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void load(controller.signal).catch(value => {
        if (!(value instanceof DOMException && value.name === 'AbortError')) setError('Dashboard settings could not be loaded.')
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [load])

  const rows = useMemo(() => flatten(categories), [categories])

  const saveAppearance = async () => {
    setSaving(true); setError(null); setMessage(null)
    try {
      setAppearance(await updateViewerDashboardAppearance(appearance, accessToken))
      setMessage('Viewer dashboard colors saved.')
    } catch {
      setError('Viewer dashboard colors could not be saved.')
    } finally { setSaving(false) }
  }

  const move = async (category: KbCategoryNode & { level: number }, direction: -1 | 1) => {
    const siblings = rows.filter(item => item.parentId === category.parentId)
    const currentIndex = siblings.findIndex(item => item.id === category.id)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= siblings.length) return
    const reordered = [...siblings]
    ;[reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]]
    setSaving(true); setError(null); setMessage(null)
    try {
      for (const [sortOrder, item] of reordered.entries())
        await moveCategory(item.id, { parentCategoryId: item.parentId, sortOrder }, accessToken)
      await load()
      setMessage('Category order saved.')
    } catch {
      setError('Category order could not be saved.')
    } finally { setSaving(false) }
  }

  const saveCategoryArtwork = async (form: CategoryFormState) => {
    if (!editingCategory) return
    setSaving(true); setError(null)
    try {
      await updateCategory(editingCategory.id, {
        name: form.name,
        description: form.description || null,
        sortOrder: form.sortOrder,
        slug: form.slug || null,
        visibility: form.visibility,
        viewerImageMediaId: form.viewerImageMediaId || null,
        viewerIcon: form.viewerIcon || null
      }, accessToken)
      setEditingCategory(undefined)
      await load()
      setMessage('Category display settings saved.')
    } catch {
      setError('Category display settings could not be saved.')
    } finally { setSaving(false) }
  }

  return <KbPageShell maxWidth={1100}>
    <KbPageHeader
      title='User Dashboard Customization'
      description='Configure the end-user Viewer dashboard. Category artwork uses the existing category media library and icon settings.'
      actions={<Button variant='contained' startIcon={<Save size={18} />} disabled={loading || saving} onClick={() => void saveAppearance()}>
        {saving ? 'Saving…' : 'Save colors'}
      </Button>}
    />
    {error && <Alert severity='error'>{error}</Alert>}
    {message && <Alert severity='success'>{message}</Alert>}
    <Card variant='outlined' sx={{ p: 3 }}>
      <Typography variant='h6'>Viewer colors</Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5, mb: 3 }}>
        These saved values are applied to the Viewer portal and internal preview.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
        {([
          ['primaryColor', 'Primary / accent color'], ['pageBackgroundColor', 'Page background color'],
          ['categoryCardBackgroundColor', 'Category card color'], ['textColor', 'Text color']
        ] as const).map(([key, label]) => <CustomTextField key={key} label={label} type='color' value={appearance[key]}
          onChange={event => setAppearance(current => ({ ...current, [key]: event.target.value }))} fullWidth />)}
      </Box>
    </Card>
    <Card variant='outlined' sx={{ p: 3 }}>
      <Typography variant='h6'>Category display and order</Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5, mb: 2 }}>
        Move a category within its current parent. Each category’s icon or media image is configured in its existing category editor.
      </Typography>
      <Stack divider={<Box sx={{ borderBlockEnd: 1, borderColor: 'divider' }} />}>
        {rows.map(category => {
          const siblings = rows.filter(item => item.parentId === category.parentId)
          const index = siblings.findIndex(item => item.id === category.id)
          return <Stack key={category.id} direction='row' spacing={2} sx={{ alignItems: 'center', py: 1.25, pl: category.level * 3 }}>
            <Box sx={{ flex: 1, minInlineSize: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{category.name}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {category.viewerImageMediaId ? 'Media image' : `Icon: ${category.viewerIcon ?? 'folder'}`} · order {category.sortOrder}
              </Typography>
            </Box>
            <Button size='small' onClick={() => setEditingCategory(category)}>Edit display</Button>
            <IconButton aria-label={`Move ${category.name} up`} disabled={saving || index === 0} onClick={() => void move(category, -1)}><ArrowUp size={18} /></IconButton>
            <IconButton aria-label={`Move ${category.name} down`} disabled={saving || index === siblings.length - 1} onClick={() => void move(category, 1)}><ArrowDown size={18} /></IconButton>
          </Stack>
        })}
      </Stack>
    </Card>
    <KbCategoryDialog
      open={Boolean(editingCategory)}
      category={editingCategory}
      categories={categories}
      accessToken={accessToken}
      submitting={saving}
      onClose={() => setEditingCategory(undefined)}
      onSubmit={saveCategoryArtwork}
    />
  </KbPageShell>
}
