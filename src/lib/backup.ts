import { getAllRecipes, saveRecipe } from '../db'
import type { Recipe } from '../types'

/**
 * Backup & restore: the whole collection as a downloadable JSON file. The
 * app's storage lives in the browser, so this is the belt-and-braces defence
 * against the browser ever clearing site data.
 */

export async function downloadBackup(): Promise<number> {
  const recipes = await getAllRecipes()
  const payload = {
    app: 'chris-cooks',
    format: 1,
    exportedAt: new Date().toISOString(),
    recipes,
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chris-cooks-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return recipes.length
}

function looksLikeRecipe(r: unknown): r is Recipe {
  const x = r as Recipe
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    Array.isArray(x.ingredients) &&
    Array.isArray(x.steps)
  )
}

/** Restore from a backup file. Upserts by id, so it's safe to run over an existing collection. */
export async function restoreBackup(file: File): Promise<number> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't a Chris Cooks backup.")
  }
  const recipes = Array.isArray(data) ? data : (data as { recipes?: unknown[] })?.recipes
  if (!Array.isArray(recipes)) throw new Error("That file isn't a Chris Cooks backup.")
  let count = 0
  for (const r of recipes) {
    if (looksLikeRecipe(r)) {
      await saveRecipe(r)
      count++
    }
  }
  if (count === 0) throw new Error('No recipes found in that file.')
  return count
}
