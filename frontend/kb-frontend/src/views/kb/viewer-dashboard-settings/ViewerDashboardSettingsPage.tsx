'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { RotateCcw, Save } from 'lucide-react'
import CustomTextField from '@core/components/mui/TextField'
import { getCategoryTree } from '@/lib/api/categories'
import { mediaLibraryApi } from '@/lib/api/mediaApi'
import { getViewerDashboardCustomization, updateViewerDashboardCustomization, type ViewerDashboardAppearance, type ViewerDashboardCategoryCustomization, type ViewerDashboardCustomization } from '@/lib/api/viewerDashboardSettingsApi'
import type { KbCategoryNode } from '@/views/kb/types/categories'
import { categoryViewerIcons, renderCategoryViewerIcon } from '@/views/kb/categories/categoryViewerIcons'
import type { ViewerCategoryNode } from '@/lib/api/viewerKnowledgeBaseApi'
import ViewerCategoryCards from '@/views/kb/viewer/ViewerCategoryCards'
import { KbPageHeader, KbPageShell } from '@/views/shared'

const defaults: ViewerDashboardAppearance = { primaryColor: '#1976D2', pageBackgroundColor: '#F8FAFC', categoryCardBackgroundColor: '#FFFFFF', textColor: '#1E293B' }
const flatten = (rows: KbCategoryNode[]): KbCategoryNode[] => rows.flatMap(row => [row, ...flatten(row.children)])
const find = (rows: KbCategoryNode[], id: string) => flatten(rows).find(row => row.id === id)
const equal = (left: ViewerDashboardCustomization | null, right: ViewerDashboardCustomization | null) => JSON.stringify(left) === JSON.stringify(right)

export default function ViewerDashboardSettingsPage({ accessToken }: { accessToken: string }) {
  const [tree, setTree] = useState<KbCategoryNode[]>([]); const [rootId, setRootId] = useState('')
  const [saved, setSaved] = useState<ViewerDashboardCustomization | null>(null); const [draft, setDraft] = useState<ViewerDashboardCustomization | null>(null)
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null); const [media, setMedia] = useState<Array<{ mediaId: string; originalFileName: string }>>([])
  const dragId = useRef<string | null>(null)
  useEffect(() => { const controller = new AbortController(); getCategoryTree(accessToken, controller.signal).then(rows => { setTree(rows); setRootId(flatten(rows).find(row => row.children.length > 0)?.id ?? '') }).catch(() => setError('Dashboard categories could not be loaded.')).finally(() => setLoading(false)); return () => controller.abort() }, [accessToken])
  const root = useMemo(() => rootId ? find(tree, rootId) : undefined, [tree, rootId])
  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await getViewerDashboardCustomization(id, accessToken, signal); const selected = find(tree, id); const persisted = new Map(response.categories.map(item => [item.categoryId, item]))
    const value: ViewerDashboardCustomization = { rootCategoryId: id, appearance: response.appearance ?? defaults, categories: (selected?.children ?? []).map((category, index) => persisted.get(category.id) ?? { categoryId: category.id, sortOrder: index, viewerImageMediaId: category.viewerImageMediaId ?? null, viewerIcon: category.viewerIcon ?? 'folder', displayColor: response.appearance.primaryColor }).sort((a, b) => a.sortOrder - b.sortOrder) }
    setSaved(value); setDraft(structuredClone(value))
  }, [accessToken, tree])
  useEffect(() => { if (!rootId || !tree.length) return; const controller = new AbortController(); setLoading(true); void load(rootId, controller.signal).catch(() => setError('Dashboard customization could not be loaded.')).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [load, rootId, tree.length])
  useEffect(() => { if (!editingId) return; const controller = new AbortController(); mediaLibraryApi.getList({ mediaType: 'image', status: 'Active', page: 1, pageSize: 100 }, accessToken, controller.signal).then(result => setMedia(result.items.map(item => ({ mediaId: item.mediaId, originalFileName: item.originalFileName })))); return () => controller.abort() }, [accessToken, editingId])
  const dirty = !equal(saved, draft); const editing = draft?.categories.find(item => item.categoryId === editingId)
  const updateCard = (id: string, changes: Partial<ViewerDashboardCategoryCustomization>) => setDraft(current => current ? { ...current, categories: current.categories.map(item => item.categoryId === id ? { ...item, ...changes } : item) } : current)
  const cards = useMemo(() => !draft || !root ? [] : draft.categories.map(item => { const category = root.children.find(child => child.id === item.categoryId)!; return { categoryId: category.id, parentCategoryId: root.id, name: category.name, slug: category.slug, description: category.description || null, sortOrder: item.sortOrder, path: category.path, depth: 1, articleCount: category.articleCount, hasViewerImage: Boolean(item.viewerImageMediaId), viewerIcon: item.viewerIcon, displayColor: item.displayColor, children: [] } satisfies ViewerCategoryNode }).sort((a, b) => a.sortOrder - b.sortOrder), [draft, root])
  const changeRoot = (next: string) => { if (next !== rootId && dirty && !window.confirm('You have unsaved dashboard changes. Switch categories and discard them?')) return; setRootId(next); setMessage(null) }
  const reorder = (over: string) => { if (!dragId.current || dragId.current === over || !draft) return; const items = [...draft.categories].sort((a, b) => a.sortOrder - b.sortOrder); const from = items.findIndex(item => item.categoryId === dragId.current); const to = items.findIndex(item => item.categoryId === over); const [moved] = items.splice(from, 1); items.splice(to, 0, moved); setDraft({ ...draft, categories: items.map((item, index) => ({ ...item, sortOrder: index })) }); dragId.current = null }
  const save = async () => { if (!draft) return; setSaving(true); setError(null); try { const result = await updateViewerDashboardCustomization(draft, accessToken); setSaved(result); setDraft(structuredClone(result)); setMessage('Dashboard customization saved.') } catch { setError('Dashboard customization could not be saved.') } finally { setSaving(false) } }
  const imageLoader = useCallback((category: ViewerCategoryNode, signal: AbortSignal) => mediaLibraryApi.getContent(draft?.categories.find(item => item.categoryId === category.categoryId)?.viewerImageMediaId ?? '', accessToken, signal), [accessToken, draft])
  return <KbPageShell maxWidth={1240}><KbPageHeader title='User Dashboard Customization' description='Preview and customize each Viewer root dashboard. Changes remain a draft until saved.' actions={<Stack direction='row' spacing={1}><Button variant='outlined' startIcon={<RotateCcw size={17} />} disabled={!dirty || saving} onClick={() => setDraft(saved ? structuredClone(saved) : null)}>Discard changes</Button><Button variant='contained' startIcon={<Save size={18} />} disabled={!dirty || saving || loading} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button></Stack>} />
    {error && <Alert severity='error' sx={{ mb: 2 }}>{error}</Alert>}{message && <Alert severity='success' sx={{ mb: 2 }}>{message}</Alert>}
    <Card variant='outlined' sx={{ p: 3, mb: 3 }}><CustomTextField select label='Viewer dashboard root category' value={rootId} onChange={event => changeRoot(event.target.value)} fullWidth>{flatten(tree).filter(category => category.children.length > 0).map(category => <MenuItem key={category.id} value={category.id}>{'— '.repeat(category.depth)}{category.name}</MenuItem>)}</CustomTextField>{root && <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>Customizing {root.children.length} direct child categories. Drag a card to reorder it; click a card to change its artwork and color.</Typography>}{draft && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, mt: 3 }}>{([['primaryColor', 'Primary / accent color'], ['pageBackgroundColor', 'Page background color'], ['categoryCardBackgroundColor', 'Category card color'], ['textColor', 'Text color']] as const).map(([key, label]) => <CustomTextField key={key} label={label} type='color' value={draft.appearance[key]} onChange={event => setDraft(current => current ? { ...current, appearance: { ...current.appearance, [key]: event.target.value } } : current)} />)}</Box>}</Card>
    {draft && root && <Card variant='outlined' sx={{ overflow: 'hidden' }}><Box sx={{ p: { xs: 2, md: 4 }, bgcolor: draft.appearance.pageBackgroundColor, color: draft.appearance.textColor }}><Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>Live end-user preview</Typography><Typography variant='h3' sx={{ mt: 1, color: draft.appearance.textColor }}>{root.name}</Typography><Typography color='text.secondary' sx={{ mt: 1 }}>{root.description || 'Find answers and product guidance.'}</Typography><Box sx={{ mt: 4 }}><Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>Browse categories</Typography><ViewerCategoryCards categories={cards} appearance={draft.appearance} getImage={imageLoader} draggable onDragStart={id => { dragId.current = id }} onDrop={reorder} onEdit={category => setEditingId(category.categoryId)} /></Box></Box></Card>}
    <Dialog open={Boolean(editing)} onClose={() => setEditingId(null)} fullWidth maxWidth='xs'><DialogTitle>Customize category card</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><CustomTextField select label='Artwork type' value={editing?.viewerIcon === null ? 'image' : 'icon'} onChange={event => updateCard(editingId!, event.target.value === 'image' ? { viewerIcon: null } : { viewerImageMediaId: null, viewerIcon: editing?.viewerIcon || 'folder' })}><MenuItem value='icon'>Icon</MenuItem><MenuItem value='image'>Media library image</MenuItem></CustomTextField>{editing?.viewerIcon === null ? <CustomTextField select label='Card image' value={editing.viewerImageMediaId ?? ''} onChange={event => updateCard(editingId!, { viewerImageMediaId: event.target.value || null, viewerIcon: null })}><MenuItem value=''><em>Select an image</em></MenuItem>{media.map(item => <MenuItem key={item.mediaId} value={item.mediaId}>{item.originalFileName}</MenuItem>)}</CustomTextField> : <CustomTextField select label='Card icon' value={editing?.viewerIcon ?? 'folder'} onChange={event => updateCard(editingId!, { viewerIcon: event.target.value, viewerImageMediaId: null })}>{categoryViewerIcons.map(icon => <MenuItem key={icon.value} value={icon.value}><Stack direction='row' spacing={1}>{renderCategoryViewerIcon(icon.value, { size: 18 })}<span>{icon.label}</span></Stack></MenuItem>)}</CustomTextField>}<CustomTextField label='Category display color' type='color' value={editing?.displayColor ?? defaults.primaryColor} onChange={event => updateCard(editingId!, { displayColor: event.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setEditingId(null)}>Done</Button></DialogActions></Dialog>
  </KbPageShell>
}
