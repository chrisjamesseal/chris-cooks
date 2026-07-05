import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../db'
import { scaleIngredientText, stepParagraphs } from '../lib/recipe'
import type { Nutrition, Recipe } from '../types'

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

  async function handleDelete() {
    if (!recipe) return
    if (!confirm(`Delete “${recipe.title}”?`)) return
    await deleteRecipe(recipe.id)
    navigate('/', { replace: true })
  }

  const baseServings = recipe.servings || 1
  const factor = people / baseServings
  const scaled = people !== baseServings

  const times = [
    recipe.times.prep && `Prep ${recipe.times.prep}`,
    recipe.times.cook && `Cook ${recipe.times.cook}`,
  ].filter(Boolean)

  const nutritionRows = recipe.nutrition
    ? NUTRITION_ROWS.filter(({ key }) => recipe.nutrition![key] !== undefined)
    : []

  return (
    <article className="recipe-detail">
      <Link to="/" className="back-link">← All recipes</Link>
      {recipe.image && (
        <img
          className="recipe-hero"
          src={recipe.image}
          alt={recipe.title}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
      <h1 className="page-title">{recipe.title}</h1>

      <div className="chips">
        <span className="chip">{recipe.mainCategory}</span>
        {recipe.cuisine && <span className="chip">{recipe.cuisine}</span>}
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
        <ul className="ingredient-list">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id}>{scaleIngredientText(ing, factor)}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Method</h2>
        <ol className="step-list">
          {recipe.steps.map((step) => (
            <li key={step.id}>
              {stepParagraphs(step.text).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </li>
          ))}
        </ol>
      </section>

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
    </article>
  )
}
