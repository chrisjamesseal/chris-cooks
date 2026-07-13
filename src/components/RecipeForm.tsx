import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { MainCategory, Nutrition, Recipe, Step } from '../types'
import { ingredientsFromText, newId, stripListMarkers, tidyRecipeTitle } from '../lib/recipe'
import { detectVideoSource } from '../lib/import'

const CATEGORIES: MainCategory[] = [
  'Breakfast', 'Lunch', 'Dinner', 'Soup', 'Salad', 'Side', 'Sauce', 'Snack', 'Dessert',
]

const NUTRITION_FIELDS: { key: keyof Nutrition; label: string }[] = [
  { key: 'calories', label: 'Calories' },
  { key: 'servingSizeG', label: 'Serving (g)' },
  { key: 'fatG', label: 'Fat (g)' },
  { key: 'satFatG', label: 'Sat fat (g)' },
  { key: 'carbsG', label: 'Carbs (g)' },
  { key: 'sugarG', label: 'Sugar (g)' },
  { key: 'fiberG', label: 'Fibre (g)' },
  { key: 'proteinG', label: 'Protein (g)' },
  { key: 'sodiumMg', label: 'Sodium (mg)' },
  { key: 'cholesterolMg', label: 'Cholesterol (mg)' },
]

type NutritionDraft = Partial<Record<keyof Nutrition, string>>

export type RecipeDraft = {
  title: string
  /** Every category the recipe belongs to; the one listed first in CATEGORIES order becomes mainCategory. */
  categories: MainCategory[]
  cuisine: string
  servings: string
  prep: string
  cook: string
  sourceUrl: string
  image: string
  ingredients: string
  steps: string[]
  nutrition: NutritionDraft
}

/** Textarea that grows to fit its content (no inner scrollbar). */
function AutoTextarea({
  value,
  onChange,
  className = '',
  ...rest
}: {
  value: string
  onChange: (v: string) => void
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className={`field__input field__input--auto ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      {...rest}
    />
  )
}

/** Downscale a chosen image and return a compact JPEG data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const max = 1200
        let { width, height } = img
        const scale = Math.min(1, max / Math.max(width, height))
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function nutritionDraft(nutrition?: Nutrition): NutritionDraft {
  const draft: NutritionDraft = {}
  if (!nutrition) return draft
  for (const { key } of NUTRITION_FIELDS) {
    const value = nutrition[key]
    if (value !== undefined) draft[key] = String(value)
  }
  return draft
}

/** "25 min" shows as just "25" in the form; anything else ("1 hr 10 min") stays as-is. */
function timeToDraft(value?: string): string {
  const m = value?.match(/^(\d+)\s*min(s|utes)?$/i)
  return m ? m[1] : (value ?? '')
}

/** A bare number means minutes; other formats are kept as typed. */
function draftToTime(value: string): string | undefined {
  const t = value.trim()
  if (!t) return undefined
  return /^\d+$/.test(t) ? `${t} min` : t
}

function draftFromRecipe(recipe?: Recipe): RecipeDraft {
  return {
    title: recipe?.title ?? '',
    categories: recipe ? [recipe.mainCategory, ...(recipe.alsoCategories ?? [])] : ['Dinner'],
    cuisine: recipe?.cuisine ?? '',
    servings: recipe ? String(recipe.servings) : '2',
    prep: timeToDraft(recipe?.times.prep),
    cook: timeToDraft(recipe?.times.cook),
    sourceUrl: recipe?.source?.url ?? '',
    image: recipe?.image ?? '',
    ingredients: recipe?.ingredients.map((i) => i.raw).join('\n') ?? '',
    steps: recipe?.steps.length ? recipe.steps.map((s) => s.text) : [''],
    nutrition: nutritionDraft(recipe?.nutrition),
  }
}

function buildNutrition(draft: NutritionDraft): Nutrition | undefined {
  const nutrition: Nutrition = {}
  for (const { key } of NUTRITION_FIELDS) {
    const raw = (draft[key] ?? '').trim()
    if (!raw) continue
    const n = Number(raw)
    if (Number.isFinite(n)) nutrition[key] = n
  }
  return Object.keys(nutrition).length ? nutrition : undefined
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
  function setNutrition(key: keyof Nutrition, value: string) {
    setDraft((d) => ({ ...d, nutrition: { ...d.nutrition, [key]: value } }))
  }
  function toggleCategory(c: MainCategory) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.includes(c) ? d.categories.filter((x) => x !== c) : [...d.categories, c],
    }))
  }
  function setStep(i: number, value: string) {
    setDraft((d) => {
      const steps = [...d.steps]
      steps[i] = value
      return { ...d, steps }
    })
  }
  function addStep() {
    setDraft((d) => ({ ...d, steps: [...d.steps, ''] }))
  }
  function removeStep(i: number) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      set('image', await fileToDataUrl(file))
    } catch {
      setError('Sorry, that image could not be loaded.')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const title = tidyRecipeTitle(draft.title.trim())
    if (!title) {
      setError('Please give your recipe a title.')
      return
    }
    const mainCategory = CATEGORIES.find((c) => draft.categories.includes(c))
    if (!mainCategory) {
      setError('Please choose at least one category.')
      return
    }
    const alsoCategories = draft.categories.filter((c) => c !== mainCategory)
    const ingredients = ingredientsFromText(draft.ingredients)
    if (ingredients.length === 0) {
      setError('Add at least one ingredient.')
      return
    }
    const steps: Step[] = draft.steps
      .map((t) => stripListMarkers(t))
      .filter(Boolean)
      .map((text) => ({ id: newId(), text }))
    if (steps.length === 0) {
      setError('Add at least one step.')
      return
    }

    setError(null)
    setSaving(true)
    const now = Date.now()
    let sourceUrl = draft.sourceUrl.trim()
    // A pasted link without a protocol would save as a broken relative URL.
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) sourceUrl = `https://${sourceUrl}`
    const recipe: Recipe = {
      id: initial?.id ?? crypto.randomUUID(),
      schemaVersion: 1,
      title,
      image: draft.image.trim() || undefined,
      mainCategory,
      alsoCategories: alsoCategories.length ? alsoCategories : undefined,
      cuisine: draft.cuisine.trim() || undefined,
      servings: Math.max(1, Number(draft.servings) || 1),
      times: {
        prep: draftToTime(draft.prep),
        cook: draftToTime(draft.cook),
      },
      source: sourceUrl ? { type: detectVideoSource(sourceUrl) ?? 'url', url: sourceUrl } : { type: 'manual' },
      ingredients,
      steps,
      nutrition: buildNutrition(draft.nutrition),
      favorite: initial?.favorite,
      notes: initial?.notes,
      cookedCount: initial?.cookedCount,
      lastCookedAt: initial?.lastCookedAt,
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

      <div className="field">
        <span className="field__label">
          Category <span className="field__hint">tick all that apply, e.g. pancakes for Breakfast and Lunch</span>
        </span>
        <div className="category-checks">
          {CATEGORIES.map((c) => (
            <label className="category-check" key={c}>
              <input
                type="checkbox"
                checked={draft.categories.includes(c)}
                onChange={() => toggleCategory(c)}
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Prep time <span className="field__hint">mins</span></span>
          <input
            className="field__input"
            inputMode="numeric"
            value={draft.prep}
            onChange={(e) => set('prep', e.target.value)}
            placeholder="10"
          />
        </label>
        <label className="field">
          <span className="field__label">Cook time <span className="field__hint">mins</span></span>
          <input
            className="field__input"
            inputMode="numeric"
            value={draft.cook}
            onChange={(e) => set('cook', e.target.value)}
            placeholder="25"
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
        <span className="field__label">Source link <span className="field__hint">optional, recipe page or video</span></span>
        <input
          className="field__input"
          type="url"
          inputMode="url"
          value={draft.sourceUrl}
          onChange={(e) => set('sourceUrl', e.target.value)}
          placeholder="https://www.instagram.com/reel/…"
        />
      </label>

      <div className="field">
        <span className="field__label">Photo <span className="field__hint">optional</span></span>
        {draft.image && <img className="image-preview" src={draft.image} alt="" />}
        <div className="photo-actions">
          <label className="btn-ghost btn-file">
            {draft.image ? 'Change Photo' : 'Upload a Photo'}
            <input type="file" accept="image/*" onChange={handlePhoto} hidden />
          </label>
          {draft.image && (
            <button type="button" className="link-btn" onClick={() => set('image', '')}>
              Remove
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span className="field__label">
          Ingredients <span className="field__hint">one per line</span>
        </span>
        <AutoTextarea
          value={draft.ingredients}
          onChange={(v) => set('ingredients', v)}
          placeholder={'200g spaghetti\n2 cloves garlic\n1 tbsp olive oil'}
        />
      </label>

      <div className="field">
        <span className="field__label">Steps</span>
        <ol className="step-fields">
          {draft.steps.map((s, i) => (
            <li className="step-field" key={i}>
              <span className="step-field__num">{i + 1}</span>
              <AutoTextarea
                value={s}
                onChange={(v) => setStep(i, v)}
                placeholder="Describe this step…"
              />
              {draft.steps.length > 1 && (
                <button
                  type="button"
                  className="step-field__remove"
                  onClick={() => removeStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ghost btn-add" onClick={addStep}>
          + Add Step
        </button>
      </div>

      <details className="nutrition-fieldset">
        <summary className="field__label">Nutrition <span className="field__hint">per serving, optional</span></summary>
        <div className="nutrition-grid">
          {NUTRITION_FIELDS.map(({ key, label }) => (
            <label className="field" key={key}>
              <span className="field__label field__label--sm">{label}</span>
              <input
                className="field__input"
                type="number"
                min={0}
                inputMode="decimal"
                value={draft.nutrition[key] ?? ''}
                onChange={(e) => setNutrition(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </details>

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
