import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllRecipes } from '../db'
import { getPlan, setPlan } from '../lib/plan'
import { sendToShoppingList } from '../lib/shopping'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import type { Recipe } from '../types'

// Ticked-off (already have) ingredients survive reloads mid-shop.
const PLAN_HAVE_KEY = 'chris-cooks:plan-have'

function loadHave(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(PLAN_HAVE_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export default function ThisWeek() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [ids, setIds] = useState<string[]>(() => getPlan())
  const [have, setHave] = useState<Set<string>>(loadHave)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    getAllRecipes().then(setRecipes)
  }, [])

  useEffect(() => {
    try {
      if (have.size === 0) localStorage.removeItem(PLAN_HAVE_KEY)
      else localStorage.setItem(PLAN_HAVE_KEY, JSON.stringify([...have]))
    } catch {
      // Best-effort persistence.
    }
  }, [have])

  if (recipes === null) return <p className="muted">Loading…</p>

  const byId = new Map(recipes.map((r) => [r.id, r]))
  const planned = ids.map((id) => byId.get(id)).filter((r): r is Recipe => !!r)

  function remove(id: string) {
    const next = ids.filter((x) => x !== id)
    setIds(next)
    setPlan(next)
  }

  function clearAll() {
    if (!confirm('Clear Your Meal Plan?')) return
    setIds([])
    setPlan([])
    setHave(new Set())
  }

  function toggleHave(ingId: string) {
    setHave((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      return next
    })
  }

  const allIngredients = planned.flatMap((r) => r.ingredients)
  const remaining = allIngredients.filter((i) => !have.has(i.id))

  function shopAll() {
    if (remaining.length === 0) return
    sendToShoppingList(remaining.map((i) => i.raw))
    setToast('Opening Reminders… (List Also Copied)')
    setTimeout(() => setToast(null), 2200)
  }

  return (
    <div>
      <Link to="/" className="back-link">← All Recipes</Link>
      <div className="page-head">
        <h1 className="page-title">Meal Plan</h1>
        {planned.length > 0 && (
          <button type="button" className="link-btn link-btn--danger" onClick={clearAll}>
            Clear Plan
          </button>
        )}
      </div>

      {planned.length === 0 ? (
        <div className="empty">
          <p className="muted">
            Nothing planned yet. Open a recipe and tap <strong>Add to Meal Plan</strong>, then
            send the whole week’s ingredients to your shopping list in one go.
          </p>
          <Link to="/" className="btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Browse Recipes
          </Link>
        </div>
      ) : (
        <>
          <p className="scale-note">
            {planned.length} {planned.length === 1 ? 'meal' : 'meals'} · {allIngredients.length} ingredients
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
                  aria-label={`Remove ${recipe.title} From Meal Plan`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <section>
            <h2 className="section-title">Shopping List</h2>
            <p className="scale-note">
              Tick anything you already have, then send the rest to Reminders.{' '}
              {have.size > 0 && (
                <button type="button" className="link-btn" onClick={() => setHave(new Set())}>
                  Clear Ticks
                </button>
              )}
            </p>
            {planned.map((recipe) => (
              <div className="plan-shop" key={recipe.id}>
                <h3 className="plan-shop__meal">{recipe.title}</h3>
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
                          <span className="ingredient-item__text">{ing.raw}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>

          <div className="shopping-actions shopping-actions--sticky">
            <button
              type="button"
              className="btn-primary btn-reminders"
              onClick={shopAll}
              disabled={remaining.length === 0}
            >
              {remaining.length === 0 ? 'Got Everything ✓' : `Add ${remaining.length} to Shopping List`}
            </button>
          </div>
        </>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
