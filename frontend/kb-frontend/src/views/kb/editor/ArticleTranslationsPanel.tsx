'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, CheckCircle2, Link2, Plus, Unlink } from 'lucide-react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CustomTextField from '@/@core/components/mui/TextField'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import { getCategoryTree } from '@/lib/api/categories'
import { assignArticleTranslator, createArticleTranslation, getArticleTranslations, getLanguages, linkArticleTranslation, unlinkArticleTranslation, verifyArticleTranslation } from '@/lib/api/translationsApi'
import { describeApiError } from '@/lib/api/http'
import type { KbCategoryNode } from '@/views/kb/types/categories'
import type { ArticleTranslationResponse, LanguageResponse } from '@/types/apps/translationTypes'
import type { ArticleDetailsResponse } from '@/types/apps/articleTypes'

type Props = { articleId: string; accessToken: string; article: ArticleDetailsResponse | null; onOpenArticle: (articleId: string, sourceArticleId?: string) => void; onCompare: (sourceArticleId: string | null) => void }
const flatten = (items: KbCategoryNode[]): KbCategoryNode[] => items.flatMap(item => [item, ...flatten(item.children)])
const statusColor = (status: ArticleTranslationResponse['translationStatus']) => status === 'Verified' ? 'success' : status === 'NeedsVerification' ? 'warning' : status === 'OutOfDate' ? 'error' : 'secondary'

export default function ArticleTranslationsPanel({ articleId, accessToken, article, onOpenArticle, onCompare }: Props) {
  const [translations, setTranslations] = useState<ArticleTranslationResponse[]>([])
  const [languages, setLanguages] = useState<LanguageResponse[]>([])
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [messages, setMessages] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'manual' | 'link' | 'assign'>('manual')
  const [busy, setBusy] = useState(false)
  const [targetLocale, setTargetLocale] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [additionalCategoryIds, setAdditionalCategoryIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [translatorId, setTranslatorId] = useState('')
  const [existingArticleId, setExistingArticleId] = useState('')
  const categoriesFlat = useMemo(() => flatten(categories), [categories])
  const current = translations.find(item => item.articleId === articleId)
  const missing = languages.filter(language => language.isEnabled && !translations.some(item => item.localeCode === language.localeCode))
  const reload = async () => { const [nextTranslations, nextLanguages, nextCategories] = await Promise.all([getArticleTranslations(articleId, accessToken), getLanguages(accessToken), getCategoryTree(accessToken)]); setTranslations(nextTranslations); setLanguages(nextLanguages); setCategories(nextCategories) }
  useEffect(() => { void reload().catch(error => setMessages(describeApiError(error))) }, [articleId, accessToken])
  const begin = (nextMode: 'manual' | 'link' | 'assign') => { setMode(nextMode); setMessages([]); setTargetLocale(missing[0]?.localeCode ?? ''); setCategoryId(article?.category?.categoryId ?? ''); setAdditionalCategoryIds([]); setTitle(article?.title ?? ''); setTranslatorId(nextMode === 'assign' ? current?.assignedTranslatorUserId ?? '' : ''); setExistingArticleId(''); setOpen(true) }
  const submit = async () => { if (busy) return; setBusy(true); setMessages([]); try { if (mode === 'assign') { await assignArticleTranslator(articleId, translatorId.trim() || null, accessToken) } else if (mode === 'link') { if (!existingArticleId) throw new Error('Enter the existing article ID to link.'); await linkArticleTranslation(articleId, existingArticleId, accessToken) } else { if (!targetLocale || !categoryId || !title.trim()) throw new Error('Language, title, and destination category are required.'); const categoryIds = additionalCategoryIds.filter(value => value !== categoryId); await createArticleTranslation(articleId, { localeCode: targetLocale, title: title.trim(), categoryId, categoryIds: categoryIds.length ? categoryIds : undefined, assignedTranslatorUserId: translatorId.trim() || null, visibility: article?.visibility ?? 'Public' }, accessToken) } await reload(); setOpen(false) } catch (error) { setMessages(describeApiError(error)) } finally { setBusy(false) } }
  const unlink = async () => { if (!window.confirm('Unlink this translation? Its draft, versions, and content will remain unchanged.')) return; try { await unlinkArticleTranslation(articleId, accessToken); await reload(); onCompare(null) } catch (error) { setMessages(describeApiError(error)) } }
  const verify = async () => { try { await verifyArticleTranslation(articleId, accessToken); await reload() } catch (error) { setMessages(describeApiError(error)) } }
  return <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}><CardContent><Stack spacing={2}><Stack direction='row' sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}><Box><Typography sx={{ fontWeight: 750 }}>Translations</Typography><Typography variant='body2' color='text.secondary'>Current language: {current?.localeCode ?? 'Loading…'} · Translation workflow is independent from publishing.</Typography></Box><Stack direction='row' spacing={1}><Button size='small' variant='outlined' startIcon={<Link2 size={16} />} onClick={() => begin('link')}>Link Existing Translation</Button><Button size='small' variant='contained' startIcon={<Plus size={16} />} disabled={!missing.length} onClick={() => begin('manual')}>Add Translation</Button></Stack></Stack>
    <KbValidationSummary title='Translations' errors={messages} />
    <Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>{translations.map(item => <Chip key={item.articleId} label={`${item.localeCode} · ${item.translationStatus}${item.assignedTranslatorUserId ? ` · ${item.assignedTranslatorUserId.slice(0, 8)}` : ''}`} color={statusColor(item.translationStatus)} variant={item.articleId === articleId ? 'filled' : 'outlined'} onClick={() => item.articleId === articleId ? onCompare(item.sourceArticleId) : onOpenArticle(item.articleId, articleId)} />)}{missing.map(language => <Chip key={language.languageId} label={`${language.localeCode} missing`} variant='outlined' color='default' />)}</Stack>
    {current?.sourceArticleId && <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Button size='small' startIcon={<ArrowLeftRight size={16} />} onClick={() => onCompare(current.sourceArticleId)}>Compare source and translation</Button><Button size='small' onClick={() => begin('assign')}>Assign translator</Button>{current.translationStatus !== 'Verified' && <Button size='small' color='success' startIcon={<CheckCircle2 size={16} />} onClick={() => void verify()}>Mark Translation Verified</Button>}<Button size='small' color='warning' startIcon={<Unlink size={16} />} onClick={() => void unlink()}>Unlink</Button></Stack>}
  </Stack></CardContent>
  <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth='sm'><DialogTitle>{mode === 'manual' ? 'Add manual translation' : mode === 'link' ? 'Link existing article' : 'Assign translator'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{mode !== 'assign' && <CustomTextField select label='Workflow' value={mode} onChange={event => setMode(event.target.value as 'manual' | 'link')}><MenuItem value='manual'>Manual Translation</MenuItem><MenuItem value='link'>Link Existing Article</MenuItem></CustomTextField>}{mode === 'assign' ? <CustomTextField label='Translator user ID' value={translatorId} onChange={event => setTranslatorId(event.target.value)} helperText='Leave blank to clear the assignment. Assignment does not publish the translation.' /> : mode === 'link' ? <CustomTextField label='Existing article ID' value={existingArticleId} onChange={event => setExistingArticleId(event.target.value)} helperText='The article must be standalone and use a different locale.' /> : <><CustomTextField select label='Target language' value={targetLocale} onChange={event => setTargetLocale(event.target.value)}>{missing.map(language => <MenuItem key={language.languageId} value={language.localeCode}>{language.displayName} ({language.localeCode})</MenuItem>)}</CustomTextField><CustomTextField label='Translated title' value={title} onChange={event => setTitle(event.target.value)} /><CustomTextField select label='Primary destination category' value={categoryId} onChange={event => setCategoryId(event.target.value)}>{categoriesFlat.map(category => <MenuItem key={category.id} value={category.id}>{'— '.repeat(category.depth)}{category.name}</MenuItem>)}</CustomTextField><CustomTextField select label='Additional destination categories' value={additionalCategoryIds} slotProps={{ select: { multiple: true, renderValue: (selected: unknown) => categoriesFlat.filter(category => (selected as string[]).includes(category.id)).map(category => category.name).join(', ') } }} onChange={event => setAdditionalCategoryIds(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value)} helperText='Categories are independent from the source article.'>{categoriesFlat.filter(category => category.id !== categoryId).map(category => <MenuItem key={category.id} value={category.id}>{'— '.repeat(category.depth)}{category.name}</MenuItem>)}</CustomTextField><CustomTextField label='Assign translator (optional user ID)' value={translatorId} onChange={event => setTranslatorId(event.target.value)} helperText='Assignment does not publish the translation.' /></>}</Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant='contained' onClick={() => void submit()} disabled={busy}>{mode === 'manual' ? 'Create translation' : mode === 'link' ? 'Link article' : 'Save assignment'}</Button></DialogActions></Dialog></Card>
}
