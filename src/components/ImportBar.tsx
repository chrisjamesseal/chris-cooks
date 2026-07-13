import { useRef, useState, type FormEvent } from 'react'
import type { Recipe } from '../types'
import { importRecipeFromImage, importRecipeFromUrl } from '../lib/import'

type Props = {
  onImported: (recipe: Recipe) => void
}

export default function ImportBar({ onImported }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState<'link' | 'photo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value) return
    setLoading('link')
    setError(null)
    try {
      const recipe = await importRecipeFromUrl(value)
      onImported(recipe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(null)
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading('photo')
    setError(null)
    try {
      const recipe = await importRecipeFromImage(file)
      onImported(recipe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <form className="import-bar card" onSubmit={handleImport}>
      <label className="field">
        <span className="field__label">Paste a recipe link</span>
        <div className="import-row">
          <input
            className="field__input"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.bbc.co.uk/food/recipes/…"
            disabled={loading !== null}
          />
          <button type="submit" className="btn-primary" disabled={loading !== null || !url.trim()}>
            {loading === 'link' ? 'Importing…' : 'Import'}
          </button>
        </div>
      </label>
      <p className="import-hint">Supports recipe blogs, TikTok videos, and Instagram posts. We'll pull in the title, ingredients, steps and photo for you to review.</p>

      <div className="import-divider"><span>or</span></div>

      <label className="btn-ghost btn-file import-photo-btn">
        {loading === 'photo' ? 'Reading Photo…' : '📷 Upload a Photo of a Recipe'}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          onChange={handlePhoto}
          disabled={loading !== null}
          hidden
        />
      </label>
      <p className="import-hint">A cookbook page, handwritten card, or a screenshot, we'll read it and fill in the details for you to review.</p>

      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}
