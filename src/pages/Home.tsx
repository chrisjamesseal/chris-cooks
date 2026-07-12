import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ensureSeeded, getAllRecipes } from '../db'
import { downloadBackup, restoreBackup } from '../lib/backup'
import { getPlan } from '../lib/plan'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import { CalendarIcon } from '../components/icons'
import type { MainCategory, Recipe } from '../types'

const CATEGORIES: MainCategory[] = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack']

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
  const [favOnly, setFavOnly] = useState(false)
  const [planCount] = useState(() => getPlan().length)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const restoreInput = useRef<HTMLInputElement>(null)

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
      setBackupMsg(`Saved a backup of ${n} recipes ✓`)
    } catch {
      setBackupMsg('Backup failed — please try again.')
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const n = await restoreBackup(file)
      setBackupMsg(`Restored ${n} recipes ✓`)
      const list = await getAllRecipes()
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      setRecipes(list)
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Restore failed.')
    }
  }

  function selectCategory(c: MainCategory | 'All') {
    setCategory(c)
    setCuisine('All') // reset the sub-filter whenever the category changes
  }

  // Chips reflect the actual collection: only categories with recipes, with counts.
  const categoryCounts = useMemo(() => {
    const counts = new Map<MainCategory, number>()
    for (const r of recipes ?? []) counts.set(r.mainCategory, (counts.get(r.mainCategory) ?? 0) + 1)
    return counts
  }, [recipes])

  // Newest additions surface at the top and refresh automatically as recipes are added.
  const recentlyAdded = useMemo(() => {
    if (!recipes || recipes.length < 5) return []
    return [...recipes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)
  }, [recipes])

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
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([c]) => c)
  }, [recipes, category])

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    return recipes.filter((r) => {
      if (favOnly && !r.favorite) return false
      if (category !== 'All' && r.mainCategory !== category) return false
      if (cuisine !== 'All' && r.cuisine !== cuisine) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.cuisine?.toLowerCase().includes(q) ?? false) ||
        r.ingredients.some((i) => i.item.toLowerCase().includes(q))
      )
    })
  }, [recipes, query, category, cuisine, favOnly])

  const hasRecipes = recipes !== null && recipes.length > 0
  const browsing = query.trim() === '' && category === 'All' && !favOnly

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My Recipes</h1>
        {hasRecipes && (
          <div className="page-head__actions">
            <Link to="/plan" className="btn-ghost btn-ghost--sm week-btn" aria-label="This week">
              <CalendarIcon />
              {planCount > 0 && <span className="week-btn__badge">{planCount}</span>}
            </Link>
            <Link to="/add" className="btn-primary btn-primary--sm">
              + Add
            </Link>
          </div>
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
              onClick={() => selectCategory('All')}
            >
              All
            </button>
            {CATEGORIES.filter((c) => (categoryCounts.get(c) ?? 0) > 0).map((c) => (
              <button
                key={c}
                type="button"
                className={`filter-chip${category === c ? ' filter-chip--active' : ''}`}
                onClick={() => selectCategory(c)}
              >
                {c} <span className="filter-chip__count">{categoryCounts.get(c)}</span>
              </button>
            ))}
            <button
              type="button"
              className={`filter-chip filter-chip--fav${favOnly ? ' filter-chip--active' : ''}`}
              onClick={() => setFavOnly((f) => !f)}
              aria-pressed={favOnly}
            >
              ♥ Favourites
            </button>
          </div>

          {subCuisines.length > 1 && (
            <div className="filter-chips filter-chips--sub">
              <button
                type="button"
                className={`filter-chip filter-chip--sm${cuisine === 'All' ? ' filter-chip--active' : ''}`}
                onClick={() => setCuisine('All')}
              >
                All {category.toLowerCase()}
              </button>
              {subCuisines.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`filter-chip filter-chip--sm filter-chip--cuisine${cuisine === c ? ' filter-chip--active' : ''}`}
                  onClick={() => setCuisine(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {browsing && recentlyAdded.length > 0 && (
            <section className="recent">
              <h2 className="section-title">Recently added</h2>
              <div className="recent-strip">
                {recentlyAdded.map((recipe) => (
                  <Link to={`/recipe/${recipe.id}`} className="recent-card" key={recipe.id}>
                    <Thumb recipe={recipe} className="recent-card__thumb" />
                    <span className="recent-card__title">{recipe.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {filtered.length === 0 ? (
            <p className="muted">No recipes match your search.</p>
          ) : (
            <ul className="recipe-list">
              {filtered.map((recipe) => {
                const meta = [
                  recipe.cuisine || recipe.mainCategory,
                  recipe.times.cook || recipe.times.total,
                ].filter(Boolean)
                return (
                  <li key={recipe.id}>
                    <Link to={`/recipe/${recipe.id}`} className="card recipe-card">
                      <Thumb recipe={recipe} className="recipe-card__thumb" />
                      <span className="recipe-card__body">
                        <span className="recipe-card__title">{recipe.title}</span>
                        <span className="recipe-card__meta">{meta.join(' · ')}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          <section className="card backup-card">
            <h2 className="backup-card__title">Keep your recipes safe</h2>
            <p className="muted backup-card__hint">
              Recipes live on this device. Download a backup now and again — restoring it brings
              everything back.
            </p>
            <div className="backup-card__actions">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={handleBackup}>
                ⬇︎ Back up my recipes
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
