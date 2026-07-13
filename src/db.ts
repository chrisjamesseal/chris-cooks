import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { parseIngredient, stripListMarkers, tidyCuisine, tidyRecipeTitle, titleCategoryOverride } from './lib/recipe'
import type { Recipe } from './types'

/**
 * Ask the browser to treat this site's storage as persistent. Without it,
 * iOS Safari deletes IndexedDB (all recipes!) after ~7 days of not visiting
 * the site. Best-effort — some browsers grant it silently, some ignore it.
 */
export function requestPersistentStorage(): void {
  try {
    navigator.storage?.persist?.().catch(() => {})
  } catch {
    // Older browsers — nothing to do.
  }
}

interface CooksDB extends DBSchema {
  recipes: { key: string; value: Recipe }
}

let dbPromise: Promise<IDBPDatabase<CooksDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<CooksDB>('chris-cooks', 1, {
      upgrade(db) {
        db.createObjectStore('recipes', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function getAllRecipes(): Promise<Recipe[]> {
  return (await getDB()).getAll('recipes')
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return (await getDB()).get('recipes', id)
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await (await getDB()).put('recipes', recipe)
}

export async function deleteRecipe(id: string): Promise<void> {
  await (await getDB()).delete('recipes', id)
}

// Bump when the bundled seed set changes to re-seed existing installs.
const SEED_VERSION = '7'
const SEED_FLAG = 'chris-cooks:seededVersion'
const SEED_PREFIX = 'seed-'

type SeedPayload = { version: number; recipes: Recipe[] }

/**
 * Load the bundled recipes into IndexedDB on first run, after a storage reset
 * (the localStorage flag clears too, so the collection always comes back), and
 * whenever SEED_VERSION is bumped (to push corrections like fixed categories,
 * titles or emoji).
 *
 * On a version change we first clear existing `seed-*` recipes, then insert the
 * bundle — this way recipes whose id changed (e.g. after a title tidy) don't
 * leave stale duplicates behind. Only `seed-*` ids are touched, so user-added
 * recipes are never affected; edits/deletions of seed recipes are re-applied
 * from the bundle on a version bump.
 */
export async function ensureSeeded(): Promise<void> {
  await seedIfNeeded()
  await tidyStoredRecipes()
}

async function seedIfNeeded(): Promise<void> {
  try {
    if (localStorage.getItem(SEED_FLAG) === SEED_VERSION) return
    const res = await fetch(`${import.meta.env.BASE_URL}seed-recipes.json`, { cache: 'no-cache' })
    if (!res.ok) return
    const payload = (await res.json()) as SeedPayload
    const db = await getDB()
    const tx = db.transaction('recipes', 'readwrite')
    for (const key of await tx.store.getAllKeys()) {
      if (typeof key === 'string' && key.startsWith(SEED_PREFIX)) tx.store.delete(key)
    }
    for (const recipe of payload.recipes) {
      tx.store.put(recipe)
    }
    await tx.done
    localStorage.setItem(SEED_FLAG, SEED_VERSION)
  } catch {
    // Seeding is best-effort; the app works fine without it.
  }
}

// Bump to re-run the cleanup over already-stored recipes.
const TIDY_VERSION = '4'
const TIDY_FLAG = 'chris-cooks:recipeTidyVersion'

/**
 * One-off migration: tidy every stored recipe's title (Title Case, hype
 * stripped), correct the category for unambiguous titles (a sauce/soup/salad/
 * dessert scraped into the wrong bucket), strip leftover bullet/markdown
 * artifacts from ingredients and steps, and re-parse ingredients that have no
 * quantity, so amounts written with unicode fractions ("½ tsp garlic") gain
 * pills/scaling. Ingredient and step ids are preserved so saved cook-state
 * keeps working.
 */
async function tidyStoredRecipes(): Promise<void> {
  try {
    if (localStorage.getItem(TIDY_FLAG) === TIDY_VERSION) return
    const db = await getDB()
    const recipes = await db.getAll('recipes')
    const tx = db.transaction('recipes', 'readwrite')
    for (const recipe of recipes) {
      let changed = false
      const title = tidyRecipeTitle(recipe.title)
      if (title && title !== recipe.title) changed = true
      const override = titleCategoryOverride(recipe.title)
      const mainCategory = override && override !== recipe.mainCategory ? override : recipe.mainCategory
      if (mainCategory !== recipe.mainCategory) changed = true
      const cuisine = tidyCuisine(recipe.cuisine)
      if (cuisine !== recipe.cuisine) changed = true
      const ingredients = recipe.ingredients.map((ing) => {
        const cleanedRaw = stripListMarkers(ing.raw)
        if (cleanedRaw === ing.raw && ing.quantity !== undefined) return ing
        const reparsed = parseIngredient(cleanedRaw)
        changed = true
        return reparsed.quantity === undefined
          ? { ...ing, raw: cleanedRaw, item: cleanedRaw }
          : { ...ing, raw: cleanedRaw, quantity: reparsed.quantity, unit: reparsed.unit, item: reparsed.item }
      })
      const steps = recipe.steps.map((step) => {
        const text = stripListMarkers(step.text)
        if (text === step.text) return step
        changed = true
        return { ...step, text }
      })
      // Keep updatedAt so the cleanup doesn't reshuffle the home-screen order.
      if (changed) {
        tx.store.put({ ...recipe, title: title || recipe.title, mainCategory, cuisine, ingredients, steps })
      }
    }
    await tx.done
    localStorage.setItem(TIDY_FLAG, TIDY_VERSION)
  } catch {
    // Cosmetic migration — never block the app on it.
  }
}
