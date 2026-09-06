'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ImagePlus } from 'lucide-react'

import type { KbCategoryNode } from '../../types/categories'
import CustomTextField from '@core/components/mui/TextField'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import { mediaLibraryApi } from '@/lib/api/mediaApi'
import { getCategoryLocalizationLanguages, type CategoryLocalizationLanguage } from '@/lib/api/categories'
import { categoryViewerIcons, renderCategoryViewerIcon } from '../categoryViewerIcons'
import {
  getCategoryOptions,
  getInitialCategoryForm,
  type CategoryFormState
} from '../utils/categoryForm'

type KbCategoryDialogProps = {
  open: boolean
  category?: KbCategoryNode
  categories: KbCategoryNode[]
  accessToken: string
  submitting?: boolean
  errors?: string[]
  onClose: () => void
  onSubmit?: (form: CategoryFormState) => Promise<void>
}

export const KbCategoryDialog = ({
  open,
  category,
  categories,
  accessToken,
  submitting = false,
  errors = [],
  onClose,
  onSubmit
}: KbCategoryDialogProps) => {
  const [form, setForm] = useState(() => getInitialCategoryForm(category))
  const [artworkType, setArtworkType] = useState<'icon' | 'image'>(category?.viewerImageMediaId ? 'image' : 'icon')
  const [clientErrors, setClientErrors] = useState<string[]>([])
  const [mediaOptions, setMediaOptions] = useState<Array<{ mediaId: string; originalFileName: string }>>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [localizationLanguages, setLocalizationLanguages] = useState<CategoryLocalizationLanguage[]>([])
  const [selectedLocale, setSelectedLocale] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const categoryOptions = getCategoryOptions(categories, category)

  useEffect(() => {
    if (!open) return

    const timer = window.setTimeout(() => {
      setForm(getInitialCategoryForm(category))
      setArtworkType(category?.viewerImageMediaId ? 'image' : 'icon')
      setClientErrors([])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, category])

  useEffect(() => {
    if (!open || !accessToken) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) setMediaLoading(true)
    })
    mediaLibraryApi.getList({ mediaType: 'image', status: 'Active', page: 1, pageSize: 100 }, accessToken,
      controller.signal).then(result => {
      setMediaOptions(result.items.map(item => ({ mediaId: item.mediaId, originalFileName: item.originalFileName })))
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setClientErrors(current => [...current, 'The image library could not be loaded.'])
    }).finally(() => {
      if (!controller.signal.aborted) setMediaLoading(false)
    })
    return () => controller.abort()
  }, [accessToken, open])

  useEffect(() => {
    if (!open || !accessToken) return
    const controller = new AbortController()
    getCategoryLocalizationLanguages(accessToken, controller.signal).then(languages => {
      setLocalizationLanguages(languages)
      setSelectedLocale(current => current || languages.find(language => language.isDefault)?.localeCode || languages[0]?.localeCode || '')
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setClientErrors(current => [...current, 'Category languages could not be loaded.'])
    })
    return () => controller.abort()
  }, [accessToken, open])

  useEffect(() => {
    if (!open || !localizationLanguages.length) return
    setForm(current => {
      const existing = new Map(current.localizations.map(localization => [localization.localeCode, localization]))
      const localizations = localizationLanguages.map(language => existing.get(language.localeCode) ?? {
        localeCode: language.localeCode,
        name: language.isDefault ? current.name : '',
        description: language.isDefault ? current.description : ''
      })
      const defaultLocalization = localizations.find(localization => localization.localeCode ===
        localizationLanguages.find(language => language.isDefault)?.localeCode)
      return defaultLocalization ? { ...current, localizations, name: defaultLocalization.name,
        description: defaultLocalization.description } : { ...current, localizations }
    })
  }, [localizationLanguages, open])

  const uploadImage = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setClientErrors(current => [...current, 'Category artwork must be an image file.'])
      return
    }
    setUploading(true)
    try {
      const uploaded = await mediaLibraryApi.upload(file, accessToken)
      setMediaOptions(current => [
        { mediaId: uploaded.mediaId, originalFileName: uploaded.originalFileName },
        ...current.filter(item => item.mediaId !== uploaded.mediaId)
      ])
      setForm(current => ({ ...current, viewerImageMediaId: uploaded.mediaId, viewerIcon: '' }))
      setArtworkType('image')
    } catch {
      setClientErrors(current => [...current, 'The image could not be uploaded. Check your media permissions and try again.'])
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    const validationErrors: string[] = []
    const name = form.name.trim()
    const slug = form.slug.trim()
    const description = form.description.trim()

    if (!name) validationErrors.push('Name is required.')
    if (name.length > 200) validationErrors.push('Name cannot exceed 200 characters.')
    if (category && !slug) validationErrors.push('Slug is required.')
    if (slug.length > 250) validationErrors.push('Slug cannot exceed 250 characters.')
    if (description.length > 1000) validationErrors.push('Description cannot exceed 1000 characters.')
    if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0)
      validationErrors.push('Sort order must be a non-negative integer.')
    if (artworkType === 'image' && !form.viewerImageMediaId)
      validationErrors.push('Select or upload a Viewer card image.')

    setClientErrors(validationErrors)
    if (validationErrors.length) return

    if (onSubmit)
      await onSubmit({ ...form, name, slug, description, localizations: form.localizations.map(localization => ({
        ...localization, name: localization.name.trim(), description: localization.description.trim()
      })) })
  }

  const selectedLocalization = form.localizations.find(localization => localization.localeCode === selectedLocale)
  const selectedLanguage = localizationLanguages.find(language => language.localeCode === selectedLocale)
  const updateSelectedLocalization = (field: 'name' | 'description', value: string) => setForm(current => {
    const localizations = current.localizations.map(localization => localization.localeCode === selectedLocale
      ? { ...localization, [field]: value } : localization)
    return selectedLanguage?.isDefault ? { ...current, localizations, [field]: value } : { ...current, localizations }
  })

  return (
    <KbFormDialog
      open={open}
      title={category ? 'Edit Category' : 'New Category'}
      description='Categories structure navigation only and do not define permissions.'
      submitLabel={onSubmit ? category ? 'Update Category' : 'Create Category' : 'Close'}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => {
        if (onSubmit) void handleSubmit()
        else onClose()
      }}
    >
      <KbFormGrid columns={1}>
        <KbValidationSummary errors={[...clientErrors, ...errors]} />
        {localizationLanguages.length > 0 && <CustomTextField
          select
          label='Editing language'
          value={selectedLocale}
          onChange={event => setSelectedLocale(event.target.value)}
          helperText='Category identity and hierarchy stay shared; this changes only the localized label.'
          fullWidth
        >
          {localizationLanguages.map(language => <MenuItem key={language.localeCode} value={language.localeCode}>
            {language.nativeName} ({language.displayName}){language.isDefault ? ' — default' : ''}
          </MenuItem>)}
        </CustomTextField>}
        <CustomTextField
          label='Name'
          value={selectedLocalization?.name ?? form.name}
          onChange={event => updateSelectedLocalization('name', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          placeholder='Category name'
          required
          fullWidth
        />
        <CustomTextField
          label='Slug'
          value={form.slug}
          onChange={event => setForm(current => ({ ...current, slug: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 250 } }}
          helperText={category
            ? 'Changing the slug changes links to this category.'
            : 'Optional. The backend generates a unique slug from the name when left blank.'}
          required={Boolean(category)}
          fullWidth
        />
        <CustomTextField
          label='Description'
          value={selectedLocalization?.description ?? form.description}
          onChange={event => updateSelectedLocalization('description', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          placeholder='Category description'
          fullWidth
          multiline
          minRows={2}
        />
        <CustomTextField
          select
          label='Visibility'
          value={form.visibility}
          onChange={event => setForm(current => ({ ...current, visibility: event.target.value as 'Public' | 'Internal' }))}
          helperText='Internal categories hide their entire subtree from public viewers.'
          required
          fullWidth
        >
          <MenuItem value='Public'>Public</MenuItem>
          <MenuItem value='Internal'>Internal</MenuItem>
        </CustomTextField>
        <CustomTextField
          select
          label='Parent Category'
          value={form.parentCategoryId}
          onChange={event => setForm(current => ({ ...current, parentCategoryId: event.target.value }))}
          fullWidth
        >
          <MenuItem value=''>Top level</MenuItem>
          {categoryOptions.map(option => (
            <MenuItem key={option.id} value={option.id}>
              {option.name}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField
          label='Sort Order'
          type='number'
          value={form.sortOrder}
          onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
          fullWidth
        />
        <CustomTextField
          select
          label='Viewer card artwork'
          value={artworkType}
          onChange={event => {
            const value = event.target.value as 'icon' | 'image'
            setArtworkType(value)
            setForm(current => value === 'image'
              ? { ...current, viewerIcon: '' }
              : { ...current, viewerImageMediaId: '', viewerIcon: current.viewerIcon || 'folder' })
          }}
          helperText='Choose one image or icon for this category card.'
          fullWidth
        >
          <MenuItem value='icon'>Icon</MenuItem>
          <MenuItem value='image'>Media library image</MenuItem>
        </CustomTextField>
        {artworkType === 'icon' ? (
          <CustomTextField
            select
            label='Viewer card icon'
            value={form.viewerIcon || 'folder'}
            onChange={event => setForm(current => ({
              ...current, viewerIcon: event.target.value, viewerImageMediaId: ''
            }))}
            fullWidth
          >
            {categoryViewerIcons.map(option => {
              return <MenuItem key={option.value} value={option.value}>
                <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
                  {renderCategoryViewerIcon(option.value, { size: 18 })}<span>{option.label}</span>
                </Stack>
              </MenuItem>
            })}
          </CustomTextField>
        ) : (
          <Stack spacing={1.5}>
            <CustomTextField
              select
              label='Viewer card image'
              value={form.viewerImageMediaId}
              onChange={event => setForm(current => ({
                ...current, viewerImageMediaId: event.target.value, viewerIcon: ''
              }))}
              helperText={mediaLoading ? 'Loading image library…' : 'Select an active image from the media library.'}
              disabled={mediaLoading || uploading}
              fullWidth
            >
              <MenuItem value=''><em>No image selected</em></MenuItem>
              {mediaOptions.map(option => (
                <MenuItem key={option.mediaId} value={option.mediaId}>{option.originalFileName}</MenuItem>
              ))}
            </CustomTextField>
            <input
              ref={fileInputRef}
              hidden
              type='file'
              accept='image/*'
              onChange={event => void uploadImage(event.target.files?.[0])}
            />
            <Button
              variant='outlined'
              startIcon={<ImagePlus size={17} />}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              sx={{ alignSelf: 'flex-start' }}
            >
              {uploading ? 'Uploading…' : 'Upload new image'}
            </Button>
            {!form.viewerImageMediaId && <Typography variant='caption' color='text.secondary'>
              Select or upload an image before saving, or switch back to an icon.
            </Typography>}
          </Stack>
        )}
      </KbFormGrid>
    </KbFormDialog>
  )
}

export default KbCategoryDialog
