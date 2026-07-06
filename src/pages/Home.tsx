import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ensureSeeded, getAllRecipes } from '../db'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import type { MainCategory, Recipe } from '../types'

const CATEGORIES: MainCategory[] = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack']

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<MainCategory | 'All'>('All')

  useEffect(() => {
    ensureSeeded()
      .then(getAllRecipes)
      .then((list) => {
        list.sort((a, b) => b.updatedAt - a.updatedAt)
        setRecipes(list)
      })
  }, [])

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    return recipes.filter((r) => {
      if (category !== 'All' && r.mainCategory !== category) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.cuisine?.toLowerCase().includes(q) ?? false) ||
        r.ingredients.some((i) => i.item.toLowerCase().includes(q))
      )
    })
  }, [recipes, query, category])

  const hasRecipes = recipes !== null && recipes.length > 0

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My Recipes</h1>
        {hasRecipes && (
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

      {hasRecipes && (
        <>
          <input
            className="field__input search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes or ingredients…"
            aria-label="Search recipes"
          />

          <div className="filter-chips">
            <button
              type="button"
              className={`filter-chip${category === 'All' ? ' filter-chip--active' : ''}`}
              onClick={() => setCategory('All')}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`filter-chip${category === c ? ' filter-chip--active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="muted">No recipes match your search.</p>
          ) : (
            <ul className="recipe-list">
              {filtered.map((recipe) => (
                <li key={recipe.id}>
                  <Link to={`/recipe/${recipe.id}`} className="card recipe-card">
                    <span
                      className="recipe-card__thumb recipe-card__thumb--ph"
                      style={{ background: placeholderGradient(recipe.mainCategory) }}
                      aria-hidden="true"
                    >
                      {placeholderEmoji(recipe.title, recipe.mainCategory)}
                    </span>
                    <span className="recipe-card__body">
                      <span className="recipe-card__title">{recipe.title}</span>
                      <span className="recipe-card__meta">{recipe.cuisine || recipe.mainCategory}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
