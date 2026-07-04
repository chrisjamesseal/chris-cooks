import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllRecipes } from '../db'
import type { Recipe } from '../types'

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)

  useEffect(() => {
    getAllRecipes().then((list) => {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      setRecipes(list)
    })
  }, [])

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My Recipes</h1>
        {recipes && recipes.length > 0 && (
          <Link to="/add" className="btn-primary btn-primary--sm">
            + Add
          </Link>
        )}
      </div>

      {recipes === null && <p className="muted">Loading…</p>}

      {recipes !== null && recipes.length === 0 && (
        <div className="empty">
          <p className="muted">No recipes yet. Add your first one!</p>
          <Link to="/add" className="btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            + Add Recipe
          </Link>
        </div>
      )}

      {recipes && recipes.length > 0 && (
        <ul className="recipe-list">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link to={`/recipe/${recipe.id}`} className="card recipe-card">
                <span className="recipe-card__title">{recipe.title}</span>
                <span className="recipe-card__meta">
                  {recipe.mainCategory} · {recipe.servings} servings
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
