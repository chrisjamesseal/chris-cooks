import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import RecipeForm from '../components/RecipeForm'
import { getRecipe, saveRecipe } from '../db'
import type { Recipe } from '../types'

export default function EditRecipe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    getRecipe(id).then((r) => setRecipe(r ?? null))
  }, [id])

  if (recipe === undefined) return <p className="muted">Loading…</p>
  if (recipe === null) return <p className="muted">Recipe not found.</p>

  async function handleSubmit(updated: Recipe) {
    await saveRecipe(updated)
    navigate(`/recipe/${updated.id}`, { replace: true })
  }

  return (
    <div>
      <h1 className="page-title">Edit recipe</h1>
      <RecipeForm
        initial={recipe}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/recipe/${recipe.id}`)}
      />
    </div>
  )
}
