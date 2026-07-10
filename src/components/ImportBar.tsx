import { useState, type FormEvent } from 'react'
import type { Recipe } from '../types'
import { importRecipeFromUrl } from '../lib/import'

type Props = {
  onImported: (recipe: Recipe) => void
}

export default function ImportBar({ onImported }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    try {
      const recipe = await importRecipeFromUrl(value)
      onImported(recipe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(false)
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
            disabled={loading}
          />
          <button type="submit" className="btn-primary" disabled={loading || !url.trim()}>
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </label>
      <p className="import-hint">Supports recipe blogs, TikTok videos, and Instagram posts. We'll pull in the title, ingredients, steps and photo for you to review.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}
