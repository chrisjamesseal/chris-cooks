import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../db'
import type { Recipe } from '../types'

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    getRecipe(id).then((r) => setRecipe(r ?? null))
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

  const times = [
    recipe.times.prep && `Prep ${recipe.times.prep}`,
    recipe.times.cook && `Cook ${recipe.times.cook}`,
  ].filter(Boolean)

  return (
    <article className="recipe-detail">
      <Link to="/" className="back-link">← All recipes</Link>
      <h1 className="page-title">{recipe.title}</h1>

      <div className="chips">
        <span className="chip">{recipe.mainCategory}</span>
        {recipe.cuisine && <span className="chip">{recipe.cuisine}</span>}
        <span className="chip">{recipe.servings} servings</span>
        {times.map((t) => (
          <span className="chip" key={t as string}>{t}</span>
        ))}
      </div>

      <section>
        <h2 className="section-title">Ingredients</h2>
        <ul className="ingredient-list">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id}>{ing.raw}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Steps</h2>
        <ol className="step-list">
          {recipe.steps.map((step) => (
            <li key={step.id}>{step.text}</li>
          ))}
        </ol>
      </section>

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
