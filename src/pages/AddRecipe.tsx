import { useNavigate } from 'react-router-dom'
import RecipeForm from '../components/RecipeForm'
import { saveRecipe } from '../db'
import type { Recipe } from '../types'

export default function AddRecipe() {
  const navigate = useNavigate()

  async function handleSubmit(recipe: Recipe) {
    await saveRecipe(recipe)
    navigate(`/recipe/${recipe.id}`, { replace: true })
  }

  return (
    <div>
      <h1 className="page-title">Add a recipe</h1>
      <RecipeForm submitLabel="Save recipe" onSubmit={handleSubmit} onCancel={() => navigate(-1)} />
    </div>
  )
}
