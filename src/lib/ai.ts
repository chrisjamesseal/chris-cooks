import type { Nutrition, Recipe } from '../types'

// AI-assisted "make it healthier". Like import cleanup, this calls the optional
// serverless worker (VITE_AI_CLEANUP_URL) that holds the API key server-side —
// a static site can't hold a key. When the worker isn't configured the feature
// is simply unavailable.

export type HealthPriority = 'calories' | 'satfat' | 'sugar' | 'sodium'

export const HEALTH_PRIORITIES: { key: HealthPriority; label: string }[] = [
  { key: 'calories', label: 'Calories' },
  { key: 'satfat', label: 'Saturated fat' },
  { key: 'sugar', label: 'Sugar' },
  { key: 'sodium', label: 'Sodium' },
]

export type HealthierResult = {
  ingredients: string[]
  steps: string[]
  /** Changes that meaningfully alter taste or texture, for the cook to weigh up. */
  changes: string[]
}

export function aiEndpoint(): string | undefined {
  return import.meta.env.VITE_AI_CLEANUP_URL
}

export class AiError extends Error {}

const NUTRITION_KEYS: (keyof Nutrition)[] = [
  'calories', 'proteinG', 'carbsG', 'fatG', 'satFatG', 'sugarG', 'fiberG', 'sodiumMg',
]

/**
 * True when any of the standard per-serving fields is missing — the signal
 * that an AI pass could still add something (a recipe with only calories
 * from its source page counts as incomplete, not done).
 */
export function nutritionIsIncomplete(n: Nutrition | undefined): boolean {
  if (!n) return true
  return NUTRITION_KEYS.some((k) => n[k] === undefined)
}

/**
 * Fill only the gaps in a recipe's nutrition with AI estimates — values the
 * source actually stated are never overwritten. Returns the merged result,
 * or null when the estimate added nothing new (model unavailable, or every
 * field was already filled in).
 */
export async function completeNutrition(recipe: Recipe): Promise<Nutrition | null> {
  const estimate = await estimateNutrition(recipe)
  if (!estimate) return null
  const merged: Nutrition = { ...recipe.nutrition }
  let added = false
  for (const k of NUTRITION_KEYS) {
    if (merged[k] === undefined && estimate[k] !== undefined) {
      merged[k] = estimate[k]
      added = true
    }
  }
  return added ? merged : null
}

/**
 * Pull the known nutrition fields out of a raw AI response object, keeping
 * only finite non-negative numbers. Returns null if nothing usable (no
 * calories figure) came through.
 */
export function nutritionFromAiResponse(data: Record<string, unknown> | null | undefined): Nutrition | null {
  if (!data) return null
  const nutrition: Nutrition = {}
  for (const k of NUTRITION_KEYS) {
    const v = data[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) nutrition[k] = Math.round(v * 10) / 10
  }
  return nutrition.calories ? nutrition : null
}

/**
 * Estimate per-serving nutrition from a recipe's ingredients when the source
 * doesn't publish any. Returns null (never throws for the caller to swallow)
 * when the AI helper isn't configured or can't produce a usable estimate. The
 * result is always flagged as an estimate by the caller.
 */
export async function estimateNutrition(recipe: Recipe): Promise<Nutrition | null> {
  const endpoint = aiEndpoint()
  if (!endpoint) return null
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'estimate-nutrition',
        title: recipe.title,
        servings: recipe.servings,
        ingredients: recipe.ingredients.map((i) => i.raw),
      }),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
  return nutritionFromAiResponse(data)
}

export async function makeHealthier(recipe: Recipe, priority: HealthPriority): Promise<HealthierResult> {
  const endpoint = aiEndpoint()
  if (!endpoint) {
    throw new AiError("The AI helper isn't set up yet. See the changelog for one-time setup.")
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'healthier',
        priority,
        title: recipe.title,
        servings: recipe.servings,
        ingredients: recipe.ingredients.map((i) => i.raw),
        steps: recipe.steps.map((s) => s.text),
        nutrition: recipe.nutrition ?? null,
      }),
    })
  } catch {
    throw new AiError("Couldn't reach the AI helper. Check your connection and try again.")
  }
  if (!res.ok) throw new AiError(`The AI helper returned an error (${res.status}).`)

  const data = (await res.json()) as Partial<HealthierResult>
  const ingredients = Array.isArray(data.ingredients) ? data.ingredients.map(String).filter(Boolean) : []
  const steps = Array.isArray(data.steps) ? data.steps.map(String).filter(Boolean) : []
  if (ingredients.length === 0 || steps.length === 0) {
    throw new AiError('The AI helper sent back an unexpected response. Please try again.')
  }
  const changes = Array.isArray(data.changes) ? data.changes.map(String).filter(Boolean) : []
  return { ingredients, steps, changes }
}
