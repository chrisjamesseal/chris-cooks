import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllRecipes, saveRecipe } from '../db'
import { fetchNutritionFromSource } from '../lib/import'
import { getPlan } from '../lib/plan'
import { videoInfoFromUrl } from '../lib/video'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import type { Recipe } from '../types'

const LIGHT_KCAL = 500
const HIGH_PROTEIN_G = 25

function Strip({ title, recipes, note }: { title: string; recipes: Recipe[]; note: (r: Recipe) => string }) {
  if (recipes.length === 0) return null
  return (
    <section className="recent">
      <h2 className="section-title">{title}</h2>
      <div className="recent-strip">
        {recipes.map((recipe) => (
          <Link to={`/recipe/${recipe.id}`} className="recent-card" key={recipe.id}>
            {recipe.image ? (
              <img className="recent-card__thumb" src={recipe.image} alt="" loading="lazy" />
            ) : (
              <span
                className="recent-card__thumb recent-card__thumb--ph"
                style={{ background: placeholderGradient(recipe.mainCategory) }}
                aria-hidden="true"
              >
                <FoodIcon emoji={placeholderEmoji(recipe.title, recipe.mainCategory)} />
              </span>
            )}
            <span className="recent-card__title">{recipe.title}</span>
            <span className="recent-card__note">{note(recipe)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function Nutrition() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    getAllRecipes().then(setRecipes)
    return () => {
      cancelled.current = true
    }
  }, [])

  if (recipes === null) return <p className="muted">Loading…</p>

  const withNutrition = recipes.filter((r) => r.nutrition?.calories)
  const planIds = new Set(getPlan())
  const planned = recipes.filter((r) => planIds.has(r.id))
  const plannedWithData = planned.filter((r) => r.nutrition?.calories)

  const sum = (get: (r: Recipe) => number | undefined) =>
    Math.round(plannedWithData.reduce((acc, r) => acc + (get(r) ?? 0), 0))

  const lightMeals = withNutrition
    .filter((r) => (r.nutrition!.calories ?? Infinity) < LIGHT_KCAL && r.mainCategory !== 'Side' && r.mainCategory !== 'Dessert')
    .sort((a, b) => (a.nutrition!.calories ?? 0) - (b.nutrition!.calories ?? 0))
    .slice(0, 10)

  const proteinPicks = recipes
    .filter((r) => (r.nutrition?.proteinG ?? 0) >= HIGH_PROTEIN_G)
    .sort((a, b) => (b.nutrition!.proteinG ?? 0) - (a.nutrition!.proteinG ?? 0))
    .slice(0, 10)

  // Recipes whose original source page might still hold nutrition data.
  const lookupCandidates = recipes.filter(
    (r) => !r.nutrition?.calories && r.source?.url && !videoInfoFromUrl(r.source.url),
  )

  async function findMissing() {
    setScanning(true)
    let found = 0
    let checked = 0
    for (const recipe of lookupCandidates) {
      if (cancelled.current) return
      checked++
      setScanMsg(`Checking ${checked} of ${lookupCandidates.length}…`)
      try {
        const nutrition = await fetchNutritionFromSource(recipe.source!.url!)
        if (nutrition) {
          await saveRecipe({ ...recipe, nutrition })
          found++
        }
      } catch {
        // Skip and move on; nothing is ever guessed.
      }
    }
    if (!cancelled.current) {
      setScanning(false)
      setScanMsg(
        found > 0
          ? `Done ✓ Found Real Nutrition Data for ${found} ${found === 1 ? 'Recipe' : 'Recipes'}`
          : 'Done. None of the source pages listed nutrition data.',
      )
      setRecipes(await getAllRecipes())
    }
  }

  return (
    <div>
      <h1 className="page-title">Nutrition</h1>

      {planned.length > 0 && (
        <section className="card nutri-plan">
          <h2 className="nutri-plan__title">🗓 Your Meal Plan</h2>
          {plannedWithData.length > 0 ? (
            <>
              <div className="nutri-totals">
                <div className="nutri-total">
                  <span className="nutri-total__num">{sum((r) => r.nutrition!.calories)}</span>
                  <span className="nutri-total__label">kcal</span>
                </div>
                <div className="nutri-total">
                  <span className="nutri-total__num">{sum((r) => r.nutrition!.proteinG)}g</span>
                  <span className="nutri-total__label">protein</span>
                </div>
                <div className="nutri-total">
                  <span className="nutri-total__num">{sum((r) => r.nutrition!.carbsG)}g</span>
                  <span className="nutri-total__label">carbs</span>
                </div>
                <div className="nutri-total">
                  <span className="nutri-total__num">{sum((r) => r.nutrition!.fatG)}g</span>
                  <span className="nutri-total__label">fat</span>
                </div>
              </div>
              <p className="muted nutri-plan__note">
                Per serving, across the {plannedWithData.length} planned{' '}
                {plannedWithData.length === 1 ? 'meal' : 'meals'} with nutrition info
                {planned.length > plannedWithData.length
                  ? ` (${planned.length - plannedWithData.length} without data not counted)`
                  : ''}
                .
              </p>
              <ul className="nutri-meals">
                {plannedWithData.map((r) => (
                  <li key={r.id}>
                    <Link to={`/recipe/${r.id}`}>{r.title}</Link>
                    <span>
                      {Math.round(r.nutrition!.calories!)} kcal
                      {r.nutrition!.proteinG ? ` · ${Math.round(r.nutrition!.proteinG)}g protein` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted nutri-plan__note">
              None of your planned meals have nutrition info yet.
            </p>
          )}
        </section>
      )}

      <Strip
        title="💪 Highest Protein"
        recipes={proteinPicks}
        note={(r) => `${Math.round(r.nutrition!.proteinG!)}g protein`}
      />
      <Strip
        title={`🥗 Light Meals (Under ${LIGHT_KCAL} kcal)`}
        recipes={lightMeals}
        note={(r) => `${Math.round(r.nutrition!.calories!)} kcal`}
      />

      <section className="card backup-card">
        <h2 className="backup-card__title">Nutrition Coverage</h2>
        <p className="muted backup-card__hint">
          {withNutrition.length} of {recipes.length} recipes have nutrition info.
          {lookupCandidates.length > 0 &&
            ` ${lookupCandidates.length} more link to a source page that might list it, values are only added when the original recipe states them.`}
        </p>
        {lookupCandidates.length > 0 && (
          <div className="backup-card__actions">
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={findMissing} disabled={scanning}>
              {scanning ? 'Checking Source Pages…' : '🔎 Find Missing Nutrition'}
            </button>
          </div>
        )}
        {scanMsg && <p className="backup-card__msg" role="status">{scanMsg}</p>}
      </section>
    </div>
  )
}
