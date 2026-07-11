import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllRecipes } from '../db'
import { getPlan, setPlan } from '../lib/plan'
import { sendToShoppingList } from '../lib/shopping'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import type { Recipe } from '../types'

export default function ThisWeek() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [ids, setIds] = useState<string[]>(() => getPlan())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    getAllRecipes().then(setRecipes)
  }, [])

  if (recipes === null) return <p className="muted">Loading…</p>

  const byId = new Map(recipes.map((r) => [r.id, r]))
  const planned = ids.map((id) => byId.get(id)).filter((r): r is Recipe => !!r)

  function remove(id: string) {
    const next = ids.filter((x) => x !== id)
    setIds(next)
    setPlan(next)
  }

  function clearAll() {
    if (!confirm('Clear this week’s plan?')) return
    setIds([])
    setPlan([])
  }

  const allLines = planned.flatMap((r) => r.ingredients.map((i) => i.raw))

  function shopAll() {
    if (allLines.length === 0) return
    sendToShoppingList(allLines)
    setToast('Opening Reminders… (list also copied)')
    setTimeout(() => setToast(null), 2200)
  }

  return (
    <div>
      <Link to="/" className="back-link">← All recipes</Link>
      <div className="page-head">
        <h1 className="page-title">This week</h1>
        {planned.length > 0 && (
          <button type="button" className="link-btn" onClick={clearAll}>
            Clear plan
          </button>
        )}
      </div>

      {planned.length === 0 ? (
        <div className="empty">
          <p className="muted">
            Nothing planned yet. Open a recipe and tap <strong>🗓 Add to this week</strong> — then
            send the whole week’s ingredients to your shopping list in one go.
          </p>
          <Link to="/" className="btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Browse recipes
          </Link>
        </div>
      ) : (
        <>
          <p className="scale-note">
            {planned.length} {planned.length === 1 ? 'meal' : 'meals'} · {allLines.length} ingredients
          </p>
          <ul className="recipe-list">
            {planned.map((recipe) => (
              <li key={recipe.id} className="plan-item">
                <Link to={`/recipe/${recipe.id}`} className="card recipe-card">
                  {recipe.image ? (
                    <img className="recipe-card__thumb" src={recipe.image} alt="" loading="lazy" />
                  ) : (
                    <span
                      className="recipe-card__thumb recipe-card__thumb--ph"
                      style={{ background: placeholderGradient(recipe.mainCategory) }}
                      aria-hidden="true"
                    >
                      <FoodIcon emoji={placeholderEmoji(recipe.title, recipe.mainCategory)} />
                    </span>
                  )}
                  <span className="recipe-card__body">
                    <span className="recipe-card__title">{recipe.title}</span>
                    <span className="recipe-card__meta">
                      {recipe.ingredients.length} ingredients
                      {recipe.times.cook ? ` · ${recipe.times.cook}` : ''}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="plan-item__remove"
                  onClick={() => remove(recipe.id)}
                  aria-label={`Remove ${recipe.title} from this week`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="shopping-actions">
            <button type="button" className="btn-primary btn-reminders" onClick={shopAll}>
              Add all {allLines.length} to Shopping List
            </button>
          </div>
        </>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
