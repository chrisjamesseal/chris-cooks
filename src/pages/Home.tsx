import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ensureSeeded, getAllRecipes, saveRecipe } from '../db'
import { downloadBackup, restoreBackup } from '../lib/backup'
import { getPlan, togglePlan } from '../lib/plan'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import { CalendarIcon, HeartIcon } from '../components/icons'
import type { MainCategory, Recipe } from '../types'

const CATEGORIES: MainCategory[] = ['Breakfast', 'Lunch', 'Dinner', 'Side', 'Snack', 'Dessert']
const CATEGORY_LABEL: Record<MainCategory, string> = {
  Breakfast: 'Breakfast',
  Lunch: 'Lunch',
  Dinner: 'Dinner',
  Side: 'Sides',
  Snack: 'Snacks',
  Dessert: 'Desserts',
}

/** Recipes with at least this much protein per serving count as high protein. */
const HIGH_PROTEIN_G = 25
const isHighProtein = (r: Recipe) => (r.nutrition?.proteinG ?? 0) >= HIGH_PROTEIN_G

/** Which meal fits the time of day right now. */
function currentMealPeriod(): { category: MainCategory; title: string } {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return { category: 'Breakfast', title: 'Breakfast Ideas' }
  if (h >= 11 && h < 15) return { category: 'Lunch', title: 'Lunch Ideas' }
  return { category: 'Dinner', title: 'Tonight’s Dinner Ideas' }
}

/** Stable per-day ordering so the ideas strip rotates daily but not per render. */
function dailyKey(id: string): number {
  const s = id + Math.floor(Date.now() / 86_400_000)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/** Comma-separated search input means "what's in my fridge" mode. */
function fridgeTerms(query: string): string[] {
  if (!query.includes(',')) return []
  return query
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)
}

function fridgeScore(recipe: Recipe, terms: string[]): number {
  return terms.filter((t) => recipe.ingredients.some((i) => i.item.toLowerCase().includes(t))).length
}

/** Square thumbnail: the recipe's own photo, or a category-coloured emoji placeholder. */
function Thumb({ recipe, className }: { recipe: Recipe; className: string }) {
  if (recipe.image) {
    return <img className={className} src={recipe.image} alt="" loading="lazy" />
  }
  return (
    <span
      className={`${className} ${className}--ph`}
      style={{ background: placeholderGradient(recipe.mainCategory) }}
      aria-hidden="true"
    >
      <FoodIcon emoji={placeholderEmoji(recipe.title, recipe.mainCategory)} />
    </span>
  )
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<MainCategory | 'All'>('All')
  const [cuisine, setCuisine] = useState<string>('All')
  const [params, setParams] = useSearchParams()
  const favOnly = params.get('fav') === '1'
  const proteinOnly = params.get('protein') === '1'

  function toggleFavOnly() {
    const next = new URLSearchParams(params)
    if (favOnly) next.delete('fav')
    else next.set('fav', '1')
    setParams(next, { replace: true })
  }
  const [planIds, setPlanIds] = useState<Set<string>>(() => new Set(getPlan()))
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const period = useMemo(currentMealPeriod, [])

  useEffect(() => {
    ensureSeeded()
      .then(getAllRecipes)
      .then((list) => {
        list.sort((a, b) => b.updatedAt - a.updatedAt)
        setRecipes(list)
      })
  }, [])

  async function handleBackup() {
    try {
      const n = await downloadBackup()
      setBackupMsg(`Saved a Backup of ${n} Recipes ✓`)
    } catch {
      setBackupMsg('Backup Failed, Please Try Again')
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const n = await restoreBackup(file)
      setBackupMsg(`Restored ${n} Recipes ✓`)
      const list = await getAllRecipes()
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      setRecipes(list)
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Restore Failed')
    }
  }

  function selectCategory(c: MainCategory | 'All') {
    setCategory(c)
    setCuisine('All') // reset the sub-filter whenever the category changes
  }

  async function toggleFavorite(recipe: Recipe) {
    const updated: Recipe = { ...recipe, favorite: !recipe.favorite }
    await saveRecipe(updated)
    setRecipes((list) => (list ? list.map((r) => (r.id === updated.id ? updated : r)) : list))
  }

  function togglePlanned(id: string) {
    togglePlan(id)
    setPlanIds(new Set(getPlan()))
  }

  // Dropdown options: categories that actually have recipes, time-relevant first.
  const categoryOptions = useMemo(() => {
    const present = new Set(
      (recipes ?? []).flatMap((r) => [r.mainCategory, ...(r.alsoCategories ?? [])]),
    )
    const ordered: MainCategory[] = [
      period.category,
      ...CATEGORIES.filter((c) => c !== period.category),
    ]
    return ordered.filter((c) => present.has(c))
  }, [recipes, period])

  // Time-of-day ideas: favourites first, then a daily rotation of the rest.
  const ideas = useMemo(() => {
    if (!recipes) return []
    return recipes
      .filter((r) => r.mainCategory === period.category || r.alsoCategories?.includes(period.category))
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || dailyKey(a.id) - dailyKey(b.id))
      .slice(0, 6)
  }, [recipes, period])

  // Cuisines within the selected category that have at least two recipes, so the
  // sub-filter stays a tidy handful rather than a wall of one-off tags.
  const subCuisines = useMemo(() => {
    if (!recipes || category === 'All') return []
    const counts = new Map<string, number>()
    for (const r of recipes) {
      if (r.mainCategory === category && r.cuisine) {
        counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .filter(([c, n]) => n >= 2 && !c.includes('/') && !c.includes('http'))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([c]) => c)
  }, [recipes, category])

  const terms = fridgeTerms(query)

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    const base = recipes.filter((r) => {
      if (favOnly && !r.favorite) return false
      if (proteinOnly && !isHighProtein(r)) return false
      if (category !== 'All' && r.mainCategory !== category && !r.alsoCategories?.includes(category))
        return false
      if (cuisine !== 'All' && r.cuisine !== cuisine) return false
      if (terms.length > 0) return fridgeScore(r, terms) > 0
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.cuisine?.toLowerCase().includes(q) ?? false) ||
        r.ingredients.some((i) => i.item.toLowerCase().includes(q))
      )
    })
    if (terms.length > 0) {
      return [...base].sort((a, b) => fridgeScore(b, terms) - fridgeScore(a, terms) || b.updatedAt - a.updatedAt)
    }
    return base
  }, [recipes, query, category, cuisine, favOnly, proteinOnly, terms])

  const hasRecipes = recipes !== null && recipes.length > 0
  const browsing = query.trim() === '' && category === 'All' && !favOnly && !proteinOnly

  return (
    <div>
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
            placeholder="Search, or list fridge items…"
            aria-label="Search recipes"
          />
          {terms.length > 0 && (
            <p className="fridge-hint">Fridge search: recipes using the most of your {terms.length} ingredients first.</p>
          )}

          <div className="filter-bar">
            <select
              className="field__input category-select"
              value={category}
              onChange={(e) => selectCategory(e.target.value as MainCategory | 'All')}
              aria-label="Category"
            >
              <option value="All">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c === period.category ? '🕒 ' : ''}
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`filter-chip filter-chip--fav${favOnly ? ' filter-chip--fav-active' : ''}`}
              onClick={toggleFavOnly}
              aria-pressed={favOnly}
            >
              ❤️ Favourites
            </button>
          </div>

          {subCuisines.length > 1 && (
            <div className="filter-chips filter-chips--sub">
              {subCuisines.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`filter-chip filter-chip--sm filter-chip--cuisine${cuisine === c ? ' filter-chip--active' : ''}`}
                    onClick={() => setCuisine(cuisine === c ? 'All' : c)}
                  >
                    {c}
                  </button>
                ))}
            </div>
          )}

          {browsing && ideas.length > 0 && (
            <section className="recent">
              <h2 className="section-title">{period.title}</h2>
              <div className="recent-strip">
                {ideas.map((recipe) => (
                  <Link to={`/recipe/${recipe.id}`} className="recent-card" key={recipe.id}>
                    <Thumb recipe={recipe} className="recent-card__thumb" />
                    <span className="recent-card__title">{recipe.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {browsing && <h2 className="section-title">All Recipes</h2>}

          {filtered.length === 0 ? (
            <p className="muted">No recipes match your search.</p>
          ) : (
            <ul className="recipe-list">
              {filtered.map((recipe) => {
                const score = terms.length > 0 ? fridgeScore(recipe, terms) : 0
                const inMealPlan = planIds.has(recipe.id)
                const metaBits = [
                  recipe.nutrition?.calories ? `${Math.round(recipe.nutrition.calories)} kcal` : '',
                  isHighProtein(recipe) ? '💪' : '',
                ].filter(Boolean)
                return (
                  <li className="recipe-row" key={recipe.id}>
                    <Link to={`/recipe/${recipe.id}`} className="card recipe-card recipe-card--actions">
                      <Thumb recipe={recipe} className="recipe-card__thumb" />
                      <span className="recipe-card__body">
                        <span className="recipe-card__title recipe-card__title--clamp">{recipe.title}</span>
                        {(metaBits.length > 0 || score > 0) && (
                          <span className="recipe-card__meta">
                            {metaBits.join(' ')}
                            {score > 0 && (
                              <span className="card-fridge">
                                {metaBits.length > 0 ? ' · ' : ''}Uses {score} of Your {terms.length}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </Link>
                    <span className="recipe-row__actions">
                      <button
                        type="button"
                        className={`card-action${recipe.favorite ? ' card-action--fav' : ''}`}
                        onClick={() => toggleFavorite(recipe)}
                        aria-label={recipe.favorite ? 'Remove From Favourites' : 'Add to Favourites'}
                        aria-pressed={!!recipe.favorite}
                      >
                        <HeartIcon className="heart-icon" />
                      </button>
                      <button
                        type="button"
                        className={`card-action${inMealPlan ? ' card-action--plan' : ''}`}
                        onClick={() => togglePlanned(recipe.id)}
                        aria-label={inMealPlan ? 'Remove From Meal Plan' : 'Add to Meal Plan'}
                        aria-pressed={inMealPlan}
                      >
                        <CalendarIcon className="calendar-icon" />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          <section className="card backup-card">
            <h2 className="backup-card__title">Keep Your Recipes Safe</h2>
            <p className="muted backup-card__hint">
              Recipes live on this device. Download a backup now and again, restoring it brings
              everything back.
            </p>
            <div className="backup-card__actions">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={handleBackup}>
                ⬇︎ Back Up My Recipes
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => restoreInput.current?.click()}
              >
                ↩︎ Restore
              </button>
              <input
                ref={restoreInput}
                type="file"
                accept=".json,application/json"
                onChange={handleRestore}
                hidden
              />
            </div>
            {backupMsg && <p className="backup-card__msg" role="status">{backupMsg}</p>}
          </section>
        </>
      )}
    </div>
  )
}
