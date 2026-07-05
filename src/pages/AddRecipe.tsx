import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RecipeForm from '../components/RecipeForm'
import ImportBar from '../components/ImportBar'
import { saveRecipe } from '../db'
import type { Recipe } from '../types'

export default function AddRecipe() {
  const navigate = useNavigate()
  // A remount key resets the form's initial values when an import lands.
  const [imported, setImported] = useState<{ recipe: Recipe; key: number } | null>(null)

  async function handleSubmit(recipe: Recipe) {
    await saveRecipe(recipe)
    navigate(`/recipe/${recipe.id}`, { replace: true })
  }

  function handleImported(recipe: Recipe) {
    setImported((prev) => ({ recipe, key: (prev?.key ?? 0) + 1 }))
  }

  return (
    <div>
      <h1 className="page-title">Add a recipe</h1>

      <ImportBar onImported={handleImported} />

      {imported && (
        <p className="import-success" role="status">
          ✓ Imported “{imported.recipe.title}”. Review the details below and save.
        </p>
      )}

      <RecipeForm
        key={imported?.key ?? 'blank'}
        initial={imported?.recipe}
        submitLabel="Save recipe"
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
