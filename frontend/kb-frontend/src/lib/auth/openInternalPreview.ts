const ACTIVATION_PATH = '/api/internal-preview'

const addField = (form: HTMLFormElement, name: string, value: string) => {
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = name
  input.value = value
  form.append(input)
}

/** Posts the dashboard JWT without exposing it in the preview URL or browser history. */
export function openInternalPreview(categorySlug: string, accessToken: string): boolean {
  const slug = categorySlug.trim().toLowerCase()
  const token = accessToken.trim().replace(/^Bearer\s+/i, '')

  if (!slug || !token) return false

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = ACTIVATION_PATH
  form.target = '_blank'
  form.setAttribute('rel', 'noopener noreferrer')
  form.hidden = true
  addField(form, 'categorySlug', slug)
  addField(form, 'accessToken', token)
  document.body.append(form)
  form.submit()
  form.remove()
  return true
}
