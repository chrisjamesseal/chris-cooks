import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../db'
import { ingredientsForStep, scaleIngredientText, stepParagraphs } from '../lib/recipe'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
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

  function shareShoppingList() {
    const remaining = loaded.ingredients.filter((i) => !have.has(i.id)).map((i) => scaleIngredientText(i, factor))
    if (remaining.length === 0) return
    const text = remaining.join('\n')
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (typeof nav.share === 'function') {
      nav.share({ title: `${loaded.title} — shopping list`, text }).catch(() => {})
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => flash('Copied — paste into Reminders'))
        .catch(() => flash('Could not copy the list'))
    } else {
      flash('Sharing not supported on this device')
    }
  }

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
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
          <span aria-hidden="true">{placeholderEmoji(recipe.title, recipe.mainCategory)}</span>
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
        <div className="ingredients-head">
          <h2 className="section-title">Ingredients</h2>
          <div className="stepper" role="group" aria-label="Number of servings">
            <button
              type="button"
              className="stepper__btn"
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              aria-label="Fewer servings"
            >
              −
            </button>
            <span className="stepper__value">
              {people} {people === 1 ? 'serving' : 'servings'}
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
        </div>
        {scaled && (
          <p className="scale-note">
            Scaled from {baseServings}.{' '}
            <button type="button" className="link-btn" onClick={() => setPeople(baseServings)}>
              Reset
            </button>
          </p>
        )}
        <p className="scale-note">Tick anything you already have; add the rest to your shopping list.</p>
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
        <div className="shopping-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={shareShoppingList}
            disabled={remainingCount === 0}
          >
            {remainingCount === 0 ? 'Got everything ✓' : `Add ${remainingCount} to Reminders`}
          </button>
        </div>
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h2 className="section-title">Method</h2>
          <p className="scale-note">Tap a step to tick it — everything up to it is marked too.</p>
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
                    {stepParagraphs(step.text).map((para, i) => (
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
