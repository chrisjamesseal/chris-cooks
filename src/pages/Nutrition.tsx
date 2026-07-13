import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllRecipes, saveRecipe } from '../db'
import { aiEndpoint, estimateNutrition } from '../lib/ai'
import { fetchNutritionFromSource } from '../lib/import'
import { getPlan } from '../lib/plan'
import { videoInfoFromUrl } from '../lib/video'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { FoodIcon } from '../components/FoodIcon'
import type { Nutrition as NutritionInfo, Recipe } from '../types'

/**
 * Health browse categories, weighted towards weight loss. Each pulls from real
 * per-serving nutrition data; a recipe-level filter lets categories target
 * meals or snacks specifically.
 */
type HealthCategory = {
  title: string
  subtitle: string
  filter: (r: Recipe, n: NutritionInfo) => boolean
  sort: (a: Recipe, b: Recipe) => number
  note: (n: NutritionInfo) => string
}

const kcal = (n: NutritionInfo) => n.calories ?? 0
const isMeal = (r: Recipe) => r.mainCategory !== 'Side' && r.mainCategory !== 'Dessert' && r.mainCategory !== 'Snack'
const isSnack = (r: Recipe) => r.mainCategory === 'Snack' || r.mainCategory === 'Dessert' || r.mainCategory === 'Side'

const HEALTH_CATEGORIES: HealthCategory[] = [
  {
    title: '🔥 Weight-Loss Winners',
    subtitle: 'Filling meals: 30g+ protein, under 600 kcal',
    filter: (r, n) => isMeal(r) && (n.proteinG ?? 0) >= 30 && n.calories !== undefined && n.calories <= 620,
    // Best protein for the fewest calories first.
    sort: (a, b) =>
      (b.nutrition!.proteinG ?? 0) / kcal(b.nutrition!) - (a.nutrition!.proteinG ?? 0) / kcal(a.nutrition!),
    note: (n) => `${Math.round(n.proteinG!)}g protein · ${Math.round(n.calories!)} kcal`,
  },
  {
    title: '💪 Highest Protein',
    subtitle: 'Keeps you full and protects muscle',
    filter: (_r, n) => (n.proteinG ?? 0) >= 25,
    sort: (a, b) => (b.nutrition!.proteinG ?? 0) - (a.nutrition!.proteinG ?? 0),
    note: (n) => `${Math.round(n.proteinG!)}g protein`,
  },
  {
    title: '⚖️ Most Protein per Calorie',
    subtitle: 'Maximum fullness for the fewest calories',
    filter: (r, n) => isMeal(r) && kcal(n) > 0 && (n.proteinG ?? 0) / kcal(n) >= 0.06,
    sort: (a, b) =>
      (b.nutrition!.proteinG ?? 0) / kcal(b.nutrition!) - (a.nutrition!.proteinG ?? 0) / kcal(a.nutrition!),
    note: (n) => `${Math.round((n.proteinG! / n.calories!) * 100)}g / 100 kcal`,
  },
  {
    title: '🥗 Light Meals (Under 500 kcal)',
    subtitle: 'Lower-calorie mains for a deficit',
    filter: (r, n) => isMeal(r) && n.calories !== undefined && n.calories < 500,
    sort: (a, b) => kcal(a.nutrition!) - kcal(b.nutrition!),
    note: (n) => `${Math.round(n.calories!)} kcal`,
  },
  {
    title: '🍎 Low-Calorie Snacks (Under 250 kcal)',
    subtitle: 'Snacks and treats that fit the day',
    filter: (r, n) => isSnack(r) && n.calories !== undefined && n.calories < 250,
    sort: (a, b) => kcal(a.nutrition!) - kcal(b.nutrition!),
    note: (n) => `${Math.round(n.calories!)} kcal`,
  },
  {
    title: '🌾 High Fibre (8g+)',
    subtitle: 'Fills you up, steadies your appetite',
    filter: (_r, n) => (n.fiberG ?? 0) >= 8,
    sort: (a, b) => (b.nutrition!.fiberG ?? 0) - (a.nutrition!.fiberG ?? 0),
    note: (n) => `${Math.round(n.fiberG!)}g fibre`,
  },
  {
    title: '🍞 Low Carb (Under 30g)',
    subtitle: 'Lighter on carbs per serving',
    filter: (r, n) => isMeal(r) && n.carbsG !== undefined && n.carbsG < 30,
    sort: (a, b) => (a.nutrition!.carbsG ?? 0) - (b.nutrition!.carbsG ?? 0),
    note: (n) => `${Math.round(n.carbsG!)}g carbs`,
  },
  {
    title: '🍬 Low Sugar (Under 8g)',
    subtitle: 'Less of the sweet stuff',
    filter: (r, n) => isMeal(r) && n.sugarG !== undefined && n.sugarG < 8,
    sort: (a, b) => (a.nutrition!.sugarG ?? 0) - (b.nutrition!.sugarG ?? 0),
    note: (n) => `${Math.round(n.sugarG!)}g sugar`,
  },
]

/** Practical, non-medical weight-loss habits shown as a scrollable tips row. */
const EATING_TIPS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🍗', title: 'Protein First', body: 'Aim for 30g+ protein per meal. It keeps you full for longer, so you eat less overall.' },
  { emoji: '🥦', title: 'Half a Plate of Veg', body: 'Bulk meals out with vegetables. High volume, low calories, plenty of fibre.' },
  { emoji: '💧', title: 'Drink Before You Snack', body: 'Thirst often reads as hunger. Have a glass of water and wait ten minutes first.' },
  { emoji: '🥄', title: 'Measure the Oil', body: 'A free pour of oil can be 200+ hidden calories. A spoon or spray keeps it honest.' },
  { emoji: '🍽️', title: 'Slow Down', body: 'Fullness signals take ~20 minutes. Eating slower means you notice "enough" sooner.' },
  { emoji: '😴', title: 'Sleep Matters', body: 'Poor sleep drives up hunger hormones the next day. Protect your 7–8 hours.' },
  { emoji: '📝', title: 'Plan Ahead', body: 'Deciding meals in advance beats deciding hungry. Use the Meal Plan to set the week.' },
  { emoji: '🚫', title: 'Nothing Is Banned', body: 'One treat won\'t undo your week. Consistency over perfection is what sticks.' },
]

function Strip({
  title,
  subtitle,
  recipes,
  note,
}: {
  title: string
  subtitle: string
  recipes: Recipe[]
  note: (r: Recipe) => string
}) {
  if (recipes.length === 0) return null
  return (
    <section className="recent">
      <h2 className="section-title nutri-cat-title">{title}</h2>
      <p className="nutri-cat-sub">{subtitle}</p>
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
            <span className="recent-card__note">
              {note(recipe)}
              {recipe.nutritionEstimated ? ' ≈' : ''}
            </span>
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
  const [estimating, setEstimating] = useState(false)
  const [estimateMsg, setEstimateMsg] = useState<string | null>(null)
  const cancelled = useRef(false)
  const aiOn = !!aiEndpoint()

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

  // Recipes whose original source page might still hold nutrition data.
  const lookupCandidates = recipes.filter(
    (r) => !r.nutrition?.calories && r.source?.url && !videoInfoFromUrl(r.source.url),
  )
  const missing = recipes.filter((r) => !r.nutrition?.calories)

  async function estimateAll() {
    setEstimating(true)
    let done = 0
    let checked = 0
    for (const recipe of missing) {
      if (cancelled.current) return
      checked++
      setEstimateMsg(`Estimating ${checked} of ${missing.length}…`)
      try {
        const nutrition = await estimateNutrition(recipe)
        if (nutrition) {
          await saveRecipe({ ...recipe, nutrition, nutritionEstimated: true })
          done++
        }
      } catch {
        // Skip; nothing is fabricated without the model returning usable numbers.
      }
    }
    if (!cancelled.current) {
      setEstimating(false)
      setEstimateMsg(`Done ✓ Estimated Nutrition for ${done} ${done === 1 ? 'Recipe' : 'Recipes'}`)
      setRecipes(await getAllRecipes())
    }
  }

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

      <section className="recent">
        <h2 className="section-title nutri-cat-title">🎯 Healthy Eating Tips</h2>
        <p className="nutri-cat-sub">Small habits that add up for weight loss</p>
        <div className="recent-strip">
          {EATING_TIPS.map((tip) => (
            <div className="tip-card" key={tip.title}>
              <span className="tip-card__emoji" aria-hidden="true">{tip.emoji}</span>
              <span className="tip-card__title">{tip.title}</span>
              <span className="tip-card__body">{tip.body}</span>
            </div>
          ))}
        </div>
      </section>

      {HEALTH_CATEGORIES.map((cat) => (
        <Strip
          key={cat.title}
          title={cat.title}
          subtitle={cat.subtitle}
          recipes={recipes
            .filter((r) => r.nutrition && cat.filter(r, r.nutrition))
            .sort(cat.sort)
            .slice(0, 10)}
          note={(r) => cat.note(r.nutrition!)}
        />
      ))}

      {plannedWithData.length > 0 && (
        <section className="card nutri-plan">
          <h2 className="nutri-plan__title">🗓 Your Meal Plan</h2>
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
        </section>
      )}

      <section className="card backup-card">
        <h2 className="backup-card__title">Nutrition Coverage</h2>
        <p className="muted backup-card__hint">
          {withNutrition.length} of {recipes.length} recipes have nutrition info.
          {lookupCandidates.length > 0 &&
            ` ${lookupCandidates.length} link to a source page that might list it (used as-is, never guessed).`}
          {aiOn && missing.length > 0 && ` For the rest, an AI estimate can fill the gaps (clearly marked with ≈).`}
        </p>
        <div className="backup-card__actions">
          {lookupCandidates.length > 0 && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={findMissing} disabled={scanning || estimating}>
              {scanning ? 'Checking Source Pages…' : '🔎 Find From Sources'}
            </button>
          )}
          {aiOn && missing.length > 0 && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={estimateAll} disabled={scanning || estimating}>
              {estimating ? 'Estimating…' : `✨ Estimate ${missing.length} Missing`}
            </button>
          )}
        </div>
        {scanMsg && <p className="backup-card__msg" role="status">{scanMsg}</p>}
        {estimateMsg && <p className="backup-card__msg" role="status">{estimateMsg}</p>}
        {!aiOn && (
          <p className="muted nutri-empty__hint">
            AI estimates need the one-time worker setup. <Link to="/changelog">See how</Link>.
          </p>
        )}
      </section>
    </div>
  )
}
