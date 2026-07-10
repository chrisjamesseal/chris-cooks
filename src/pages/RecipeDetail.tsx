import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe, saveRecipe } from '../db'
import {
  deQuantifyStep,
  ingredientsForStep,
  ingredientsFromText,
  newId,
  scaleIngredientText,
  stepParagraphs,
} from '../lib/recipe'
import {
  aiEndpoint,
  HEALTH_PRIORITIES,
  makeHealthier,
  type HealthierResult,
  type HealthPriority,
} from '../lib/ai'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import type { Ingredient, Nutrition, Recipe } from '../types'

const NUTRITION_ROWS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'satFatG', label: 'Saturates', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'sugarG', label: 'Sugars', unit: 'g' },
  { key: 'fiberG', label: 'Fibre', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
]

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [people, setPeople] = useState(1)
  // A single "completed through" frontier: tapping a step marks it and every
  // step above done; un-tapping clears it and everything below.
  const [completedThrough, setCompletedThrough] = useState(-1)
  const [have, setHave] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  // "Make it healthier"
  const [healthOpen, setHealthOpen] = useState(false)
  const [priority, setPriority] = useState<HealthPriority>('calories')
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthResult, setHealthResult] = useState<HealthierResult | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const aiOn = !!aiEndpoint()

  useEffect(() => {
    if (!id) return
    getRecipe(id).then((r) => {
      setRecipe(r ?? null)
      if (r) setPeople(r.servings)
    })
  }, [id])

  if (recipe === undefined) return <p className="muted">Loading…</p>
  if (recipe === null) {
    return (
      <div>
        <p className="muted">Recipe not found.</p>
        <Link to="/" className="btn-primary">Back to recipes</Link>
      </div>
    )
  }

  const loaded = recipe // non-null within handlers below

  function toggleStep(index: number) {
    setCompletedThrough((current) => (index <= current ? index - 1 : index))
  }

  function toggleHave(ingId: string) {
    setHave((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      return next
    })
  }

  async function handleDelete() {
    if (!confirm(`Delete “${loaded.title}”?`)) return
    await deleteRecipe(loaded.id)
    navigate('/', { replace: true })
  }

  // Name of the one-time Apple Shortcut that adds each line as its own reminder.
  const SHORTCUT_NAME = 'Add to Shopping List'

  function sendToReminders() {
    const remaining = loaded.ingredients.filter((i) => !have.has(i.id)).map((i) => scaleIngredientText(i, factor))
    if (remaining.length === 0) return
    const text = remaining.join('\n')
    // Copy first as a universal fallback (Reminders splits a multi-line paste
    // into separate items), then hand off to the Shortcut for one-tap add.
    navigator.clipboard?.writeText(text).catch(() => {})
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`
    window.location.href = url
    flash('Opening Reminders… (list also copied)')
  }

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function generateHealthier() {
    setHealthLoading(true)
    setHealthError(null)
    setHealthResult(null)
    try {
      setHealthResult(await makeHealthier(loaded, priority))
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setHealthLoading(false)
    }
  }

  async function applyHealthier() {
    if (!healthResult) return
    const updated: Recipe = {
      ...loaded,
      ingredients: ingredientsFromText(healthResult.ingredients.join('\n')),
      steps: healthResult.steps.map((text) => ({ id: newId(), text })),
      updatedAt: Date.now(),
    }
    await saveRecipe(updated)
    setRecipe(updated)
    setPeople(updated.servings)
    setCompletedThrough(-1)
    setHave(new Set())
    setHealthResult(null)
    setHealthOpen(false)
    flash('Updated to a healthier version')
  }

  const baseServings = recipe.servings || 1
  const factor = people / baseServings
  const scaled = people !== baseServings
  const remainingCount = recipe.ingredients.length - have.size

  const times = [
    recipe.times.prep && `Prep ${recipe.times.prep}`,
    recipe.times.cook && `Cook ${recipe.times.cook}`,
  ].filter(Boolean)

  const nutritionRows = recipe.nutrition
    ? NUTRITION_ROWS.filter(({ key }) => recipe.nutrition![key] !== undefined)
    : []

  // Each ingredient appears as a pill only once across the method (its first
  // use) so an ingredient touched in several steps isn't doubled up.
  const shownPills = new Set<string>()
  const stepPills: Ingredient[][] = recipe.steps.map((step) => {
    const used = ingredientsForStep(step, recipe.ingredients).filter(
      (i) => i.quantity !== undefined && !shownPills.has(i.id),
    )
    used.forEach((i) => shownPills.add(i.id))
    return used
  })

  return (
    <article className="recipe-detail">
      <Link to="/" className="back-link">← All recipes</Link>
      {recipe.image ? (
        <img
          className="recipe-hero"
          src={recipe.image}
          alt={recipe.title}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <Link
          to={`/recipe/${recipe.id}/edit`}
          className="recipe-hero recipe-hero--ph"
          style={{ background: placeholderGradient(recipe.mainCategory) }}
          aria-label="Add a photo"
        >
          <FoodIcon emoji={placeholderEmoji(recipe.title, recipe.mainCategory)} />
          <span className="recipe-hero__add">＋ Add a photo</span>
        </Link>
      )}
      <h1 className="page-title">{recipe.title}</h1>

      <div className="chips">
        <span className="chip">{recipe.mainCategory}</span>
        {recipe.cuisine && <span className="chip chip--cuisine">{recipe.cuisine}</span>}
        {times.map((t) => (
          <span className="chip" key={t as string}>{t}</span>
        ))}
      </div>

      <section>
        <h2 className="section-title">Ingredients</h2>
        <p className="scale-note">Select any items you already have to create a shopping list.</p>
        <ul className="ingredient-list ingredient-list--check">
          {recipe.ingredients.map((ing) => {
            const has = have.has(ing.id)
            return (
              <li key={ing.id}>
                <button
                  type="button"
                  className={`ingredient-item${has ? ' ingredient-item--have' : ''}`}
                  onClick={() => toggleHave(ing.id)}
                  aria-pressed={has}
                >
                  <span className="ingredient-item__check" aria-hidden="true">
                    {has ? '✓' : ''}
                  </span>
                  <span className="ingredient-item__text">{scaleIngredientText(ing, factor)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="servings-row" role="group" aria-label="Number of servings">
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setPeople((p) => Math.max(1, p - 1))}
            aria-label="Fewer servings"
          >
            −
          </button>
          <span className="servings-row__value">
            {people} {people === 1 ? 'serving' : 'servings'}
            {scaled && (
              <button type="button" className="link-btn" onClick={() => setPeople(baseServings)}>
                Reset
              </button>
            )}
          </span>
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setPeople((p) => p + 1)}
            aria-label="More servings"
          >
            +
          </button>
        </div>

        <div className="shopping-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={sendToReminders}
            disabled={remainingCount === 0}
          >
            {remainingCount === 0 ? 'Got everything ✓' : `Add ${remainingCount} to Reminders`}
          </button>
        </div>
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h2 className="section-title">Method</h2>
          <p className="scale-note">Click on a step to mark it as complete.</p>
          <ol className="step-list">
            {recipe.steps.map((step, index) => {
              const used = stepPills[index]
              const done = index <= completedThrough
              return (
                <li
                  key={step.id}
                  className={`step-card${done ? ' step-card--done' : ''}`}
                  onClick={() => toggleStep(index)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={done}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleStep(index)
                    }
                  }}
                >
                  <span className="step-card__num">{done ? '✓' : index + 1}</span>
                  <div className="step-card__body">
                    {stepParagraphs(deQuantifyStep(step.text)).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                    {used.length > 0 && (
                      <div className="step-ingredients">
                        {used.map((ing) => (
                          <span className="step-ingredient" key={ing.id}>
                            {scaleIngredientText(ing, factor)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {nutritionRows.length > 0 && (
        <section>
          <h2 className="section-title">
            Nutrition{' '}
            <span className="section-title__hint">
              per serving{recipe.nutrition?.servingSizeG ? ` (${recipe.nutrition.servingSizeG}g)` : ''}
            </span>
          </h2>
          <dl className="nutrition-table">
            {nutritionRows.map(({ key, label, unit }) => (
              <div className="nutrition-row" key={key}>
                <dt>{label}</dt>
                <dd>
                  {recipe.nutrition![key]}
                  {unit}
                </dd>
              </div>
            ))}
          </dl>

          <div className="healthier card healthier--nutrition">
            <button
              type="button"
              className="healthier__head"
              onClick={() => setHealthOpen((o) => !o)}
              aria-expanded={healthOpen}
            >
              <span>🥗 Tips to make it healthier</span>
              <span className="healthier__chevron" aria-hidden="true">{healthOpen ? '▲' : '▼'}</span>
            </button>
            {healthOpen && (
              <div className="healthier__body">
                {!aiOn ? (
                  <p className="muted">
                    This uses an AI helper that needs a one-time setup.{' '}
                    <Link to="/changelog">See how</Link>.
                  </p>
                ) : healthResult ? (
                  <>
                    <p className="muted">
                      A lighter version with less {HEALTH_PRIORITIES.find((p) => p.key === priority)?.label.toLowerCase()}.
                      {healthResult.changes.length === 0 && ' No big taste or texture changes.'}
                    </p>
                    {healthResult.changes.length > 0 && (
                      <div className="healthier__flags">
                        <span className="healthier__flags-title">Worth knowing — these affect taste or texture:</span>
                        <ul>
                          {healthResult.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="form-actions">
                      <button type="button" className="btn-ghost" onClick={() => setHealthResult(null)}>
                        Keep original
                      </button>
                      <button type="button" className="btn-primary" onClick={applyHealthier}>
                        Apply changes
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted">Reduce…</p>
                    <div className="filter-chips">
                      {HEALTH_PRIORITIES.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          className={`filter-chip${priority === p.key ? ' filter-chip--active' : ''}`}
                          onClick={() => setPriority(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-primary healthier__go"
                      onClick={generateHealthier}
                      disabled={healthLoading}
                    >
                      {healthLoading ? 'Thinking…' : 'Suggest a healthier version'}
                    </button>
                    {healthError && <p className="form-error" role="alert">{healthError}</p>}
                    <p className="healthier__hint">Keeps the dish recognisable; you review before anything changes.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {recipe.source?.url && (
        <p className="muted">
          Source:{' '}
          <a href={recipe.source.url} target="_blank" rel="noreferrer">
            {recipe.source.url}
          </a>
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn-danger" onClick={handleDelete}>
          Delete
        </button>
        <Link to={`/recipe/${recipe.id}/edit`} className="btn-primary">
          Edit
        </Link>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </article>
  )
}
