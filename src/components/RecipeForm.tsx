import { useState, type FormEvent } from 'react'
import type { MainCategory, Recipe } from '../types'
import { ingredientsFromText, parseSteps } from '../lib/recipe'

const CATEGORIES: MainCategory[] = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack']

export type RecipeDraft = {
  title: string
  mainCategory: MainCategory
  cuisine: string
  servings: string
  prep: string
  cook: string
  sourceUrl: string
  ingredients: string
  steps: string
}

function draftFromRecipe(recipe?: Recipe): RecipeDraft {
  return {
    title: recipe?.title ?? '',
    mainCategory: recipe?.mainCategory ?? 'Dinner',
    cuisine: recipe?.cuisine ?? '',
    servings: recipe ? String(recipe.servings) : '2',
    prep: recipe?.times.prep ?? '',
    cook: recipe?.times.cook ?? '',
    sourceUrl: recipe?.source?.url ?? '',
    ingredients: recipe?.ingredients.map((i) => i.raw).join('\n') ?? '',
    steps: recipe?.steps.map((s) => s.text).join('\n') ?? '',
  }
}

type Props = {
  initial?: Recipe
  submitLabel: string
  onSubmit: (recipe: Recipe) => void | Promise<void>
  onCancel?: () => void
}

export default function RecipeForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<RecipeDraft>(() => draftFromRecipe(initial))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const title = draft.title.trim()
    if (!title) {
      setError('Please give your recipe a title.')
      return
    }
    const ingredients = ingredientsFromText(draft.ingredients)
    if (ingredients.length === 0) {
      setError('Add at least one ingredient.')
      return
    }
    const steps = parseSteps(draft.steps)
    if (steps.length === 0) {
      setError('Add at least one step.')
      return
    }

    setError(null)
    setSaving(true)
    const now = Date.now()
    const sourceUrl = draft.sourceUrl.trim()
    const recipe: Recipe = {
      id: initial?.id ?? crypto.randomUUID(),
      schemaVersion: 1,
      title,
      mainCategory: draft.mainCategory,
      cuisine: draft.cuisine.trim() || undefined,
      servings: Math.max(1, Number(draft.servings) || 1),
      times: {
        prep: draft.prep.trim() || undefined,
        cook: draft.cook.trim() || undefined,
      },
      source: sourceUrl ? { type: 'url', url: sourceUrl } : { type: 'manual' },
      ingredients,
      steps,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    }

    try {
      await onSubmit(recipe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save recipe.')
      setSaving(false)
    }
  }

  return (
    <form className="recipe-form" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span className="field__label">Title</span>
        <input
          className="field__input"
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Weeknight pasta"
          autoFocus
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Category</span>
          <select
            className="field__input"
            value={draft.mainCategory}
            onChange={(e) => set('mainCategory', e.target.value as MainCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Servings</span>
          <input
            className="field__input"
            type="number"
            min={1}
            value={draft.servings}
            onChange={(e) => set('servings', e.target.value)}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Prep time</span>
          <input
            className="field__input"
            value={draft.prep}
            onChange={(e) => set('prep', e.target.value)}
            placeholder="10 min"
          />
        </label>
        <label className="field">
          <span className="field__label">Cook time</span>
          <input
            className="field__input"
            value={draft.cook}
            onChange={(e) => set('cook', e.target.value)}
            placeholder="25 min"
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Cuisine <span className="field__hint">optional</span></span>
        <input
          className="field__input"
          value={draft.cuisine}
          onChange={(e) => set('cuisine', e.target.value)}
          placeholder="Italian"
        />
      </label>

      <label className="field">
        <span className="field__label">
          Ingredients <span className="field__hint">one per line</span>
        </span>
        <textarea
          className="field__input field__input--area"
          value={draft.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          rows={6}
          placeholder={'200g spaghetti\n2 cloves garlic\n1 tbsp olive oil'}
        />
      </label>

      <label className="field">
        <span className="field__label">
          Steps <span className="field__hint">one per line</span>
        </span>
        <textarea
          className="field__input field__input--area"
          value={draft.steps}
          onChange={(e) => set('steps', e.target.value)}
          rows={6}
          placeholder={'Boil the pasta\nFry the garlic\nCombine and serve'}
        />
      </label>

      <label className="field">
        <span className="field__label">Source URL <span className="field__hint">optional</span></span>
        <input
          className="field__input"
          type="url"
          value={draft.sourceUrl}
          onChange={(e) => set('sourceUrl', e.target.value)}
          placeholder="https://…"
        />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
