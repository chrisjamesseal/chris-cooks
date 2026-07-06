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
const SEED_VERSION = '3'
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
