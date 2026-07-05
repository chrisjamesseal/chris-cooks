import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Recipe } from './types'

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
const SEED_VERSION = '1'
const SEED_FLAG = 'chris-cooks:seededVersion'

type SeedPayload = { version: number; recipes: Recipe[] }

/**
 * Load the bundled recipes into IndexedDB on first run (and again after a
 * storage reset, since the localStorage flag clears too — so the collection
 * always comes back). Never overwrites a recipe that already exists, so edits
 * and user-added recipes are preserved.
 */
export async function ensureSeeded(): Promise<void> {
  try {
    if (localStorage.getItem(SEED_FLAG) === SEED_VERSION) return
    const res = await fetch(`${import.meta.env.BASE_URL}seed-recipes.json`, { cache: 'no-cache' })
    if (!res.ok) return
    const payload = (await res.json()) as SeedPayload
    const db = await getDB()
    const existing = new Set(await db.getAllKeys('recipes'))
    const tx = db.transaction('recipes', 'readwrite')
    for (const recipe of payload.recipes) {
      if (!existing.has(recipe.id)) tx.store.put(recipe)
    }
    await tx.done
    localStorage.setItem(SEED_FLAG, SEED_VERSION)
  } catch {
    // Seeding is best-effort; the app works fine without it.
  }
}
