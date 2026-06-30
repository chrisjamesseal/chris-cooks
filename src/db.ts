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
