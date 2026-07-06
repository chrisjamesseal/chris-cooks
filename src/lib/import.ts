import type { MainCategory, Nutrition, Recipe, Step } from '../types'
import { newId, parseIngredient } from './recipe'

/**
 * Recipe import: fetch a page and pull structured recipe data out of its
 * schema.org JSON-LD (what BBC Food, NYT Cooking, AllRecipes, etc. all embed).
 *
 * The JSON-LD parsing is a pure function of the HTML string so it can be
 * tested offline; only `importRecipeFromUrl` touches the network.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const LD_JSON_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

export function extractJsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = []
  for (const match of html.matchAll(LD_JSON_RE)) {
    const raw = match[1].trim()
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      // Some sites emit multiple JSON objects in one block or trailing commas;
      // skip anything we can't parse cleanly rather than failing the import.
    }
  }
  return blocks
}

function collectRecipeNodes(node: Json, out: Json[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectRecipeNodes(item, out)
    return
  }
  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) collectRecipeNodes(item, out)
  }
  if (isRecipeType(node['@type'])) out.push(node)
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === 'string') return type.toLowerCase() === 'recipe'
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe')
  return false
}

/** Parse recipe data out of a page's HTML. Returns null if none is found. */
export function parseRecipeFromHtml(html: string, sourceUrl: string): Recipe | null {
  const nodes: Json[] = []
  for (const block of extractJsonLdBlocks(html)) collectRecipeNodes(block, nodes)
  const node = nodes[0]
  if (!node) return null
  return mapNodeToRecipe(node, sourceUrl)
}

/** Trim a scraped title to just the dish name (drop brackets, SEO tails, "Recipe"). */
export function tidyTitle(raw: string): string {
  let t = raw
  t = t.replace(/\s*[([][^)\]]*[)\]]/g, ' ')
  t = t.split('|')[0]
  t = t.replace(/\s+[-–—]\s+.{1,30}$/, '')
  t = t.replace(/\brecipes?\b/gi, ' ')
  t = t.replace(/\s{2,}/g, ' ').replace(/[\s,\-–—:]+$/, '').trim()
  return t || raw.trim()
}

function mapNodeToRecipe(node: Json, sourceUrl: string): Recipe {
  const now = Date.now()
  const title = tidyTitle(cleanText(firstString(node.name)) || 'Imported recipe')
  const ingredients = ingredientLines(node.recipeIngredient)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map(parseIngredient)
  const steps = parseInstructions(node.recipeInstructions)

  return {
    id: newId(),
    schemaVersion: 1,
    title,
    image: firstImage(node.image),
    source: { type: 'url', url: sourceUrl },
    mainCategory: mapCategory(firstString(node.recipeCategory)),
    cuisine: cleanText(firstString(node.recipeCuisine)) || undefined,
    servings: parseYield(node.recipeYield) ?? 1,
    times: {
      prep: formatDuration(node.prepTime),
      cook: formatDuration(node.cookTime),
      total: formatDuration(node.totalTime),
    },
    ingredients,
    steps,
    nutrition: mapNutrition(node.nutrition),
    createdAt: now,
    updatedAt: now,
  }
}

function mapNutrition(node: Json): Nutrition | undefined {
  if (!node || typeof node !== 'object') return undefined
  const nutrition: Nutrition = {}
  const num = (v: Json): number | undefined => {
    const s = firstString(v)
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
    if (!s) return undefined
    const m = s.replace(',', '.').match(/[\d.]+/)
    return m ? Number(m[0]) : undefined
  }
  nutrition.calories = num(node.calories)
  nutrition.fatG = num(node.fatContent)
  nutrition.satFatG = num(node.saturatedFatContent)
  nutrition.cholesterolMg = num(node.cholesterolContent)
  nutrition.sodiumMg = num(node.sodiumContent)
  nutrition.carbsG = num(node.carbohydrateContent)
  nutrition.fiberG = num(node.fiberContent)
  nutrition.sugarG = num(node.sugarContent)
  nutrition.proteinG = num(node.proteinContent)
  const size = num(node.servingSize)
  if (size !== undefined) nutrition.servingSizeG = size
  const hasAny = Object.values(nutrition).some((v) => v !== undefined)
  return hasAny ? nutrition : undefined
}

function parseInstructions(value: Json): Step[] {
  const texts: string[] = []
  const walk = (v: Json) => {
    if (!v) return
    if (typeof v === 'string') {
      // A single string may hold the whole method separated by newlines.
      for (const line of v.split(/\r?\n/)) {
        const t = cleanText(line)
        if (t) texts.push(t)
      }
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
      return
    }
    if (typeof v === 'object') {
      const type = typeof v['@type'] === 'string' ? v['@type'].toLowerCase() : ''
      if (type === 'howtosection' && v.itemListElement) {
        walk(v.itemListElement)
        return
      }
      const t = cleanText(firstString(v.text) || firstString(v.name))
      if (t) texts.push(t)
    }
  }
  walk(value)
  return texts.map((text) => ({ id: newId(), text }))
}

function mapCategory(raw: string | undefined): MainCategory {
  const c = (raw || '').toLowerCase()
  if (/dessert|cake|pudding|sweet|bake/.test(c)) return 'Dessert'
  if (/breakfast|brunch/.test(c)) return 'Breakfast'
  if (/snack|canap|starter|appetiser|appetizer|side/.test(c)) return 'Snack'
  if (/lunch/.test(c)) return 'Lunch'
  return 'Dinner'
}

function parseYield(value: Json): number | undefined {
  const candidate = Array.isArray(value) ? value.find((v) => v != null) : value
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return Math.round(candidate)
  if (typeof candidate === 'string') {
    const m = candidate.match(/\d+/)
    if (m) return Number(m[0])
  }
  return undefined
}

/** Turn an ISO-8601 duration (PT1H30M) into a friendly string (1 hr 30 min). */
export function formatDuration(iso: Json): string | undefined {
  if (typeof iso !== 'string') return undefined
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return undefined
  const [, d, h, min] = m
  const parts: string[] = []
  const days = Number(d || 0)
  const hours = Number(h || 0) + days * 24
  const mins = Number(min || 0)
  if (hours) parts.push(`${hours} hr`)
  if (mins) parts.push(`${mins} min`)
  return parts.length ? parts.join(' ') : undefined
}

function firstString(value: Json): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const s = value.find((v) => typeof v === 'string')
    if (typeof s === 'string') return s
  }
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name
  return undefined
}

function asStringArray(value: Json): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') return [value]
  return []
}

/**
 * Ingredients as individual lines. Some sites put the whole list in one string
 * (or a single array entry with embedded line breaks) rather than one entry per
 * ingredient — split those so each ingredient becomes its own line.
 */
function ingredientLines(value: Json): string[] {
  const out: string[] = []
  for (const entry of asStringArray(value)) {
    for (const piece of entry.split(/\r?\n|•|\|/)) {
      const t = piece.trim()
      if (t) out.push(t)
    }
  }
  return out
}

function firstImage(value: Json): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const v of value) {
      const img = firstImage(v)
      if (img) return img
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    if (typeof value.url === 'string') return value.url
  }
  return undefined
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#160': ' ',
}

export function cleanText(input: string | undefined): string {
  if (!input) return ''
  return input
    .replace(/<[^>]+>/g, ' ') // strip any HTML tags
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      const key = code.toLowerCase()
      if (ENTITIES[key]) return ENTITIES[key]
      if (key.startsWith('#x')) return codePoint(parseInt(key.slice(2), 16))
      if (key.startsWith('#')) return codePoint(parseInt(key.slice(1), 10))
      return whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function codePoint(n: number): string {
  return Number.isFinite(n) ? String.fromCodePoint(n) : ''
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

// CORS proxies, tried in order. A static site can't fetch other origins
// directly, so we route through a proxy when a direct request is blocked.
const PROXIES: ((url: string) => string)[] = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
]

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export class ImportError extends Error {}

/**
 * Optional AI cleanup: when VITE_AI_CLEANUP_URL is configured (a serverless
 * proxy holding the API key), scraped text is sent through it to fix odd
 * formatting/typos. No-op — and never fails the import — when unset.
 */
async function aiCleanup(recipe: Recipe): Promise<Recipe> {
  const endpoint = import.meta.env.VITE_AI_CLEANUP_URL
  if (!endpoint) return recipe
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: recipe.title,
        ingredients: recipe.ingredients.map((i) => i.raw),
        steps: recipe.steps.map((s) => s.text),
      }),
    })
    if (!res.ok) return recipe
    const data = (await res.json()) as {
      title?: string
      ingredients?: string[]
      steps?: string[]
    }
    return {
      ...recipe,
      title: data.title?.trim() || recipe.title,
      ingredients:
        Array.isArray(data.ingredients) && data.ingredients.length
          ? data.ingredients.map((line) => parseIngredient(cleanText(String(line)))).filter((i) => i.raw)
          : recipe.ingredients,
      steps:
        Array.isArray(data.steps) && data.steps.length
          ? data.steps.map((text) => ({ id: newId(), text: cleanText(String(text)) })).filter((s) => s.text)
          : recipe.steps,
    }
  } catch {
    return recipe // cleanup is best-effort
  }
}

export async function importRecipeFromUrl(url: string): Promise<Recipe> {
  const target = normalizeUrl(url)
  const attempts = [target, ...PROXIES.map((p) => p(target))]
  let reachedPage = false

  for (const attempt of attempts) {
    let html: string
    try {
      html = await fetchText(attempt)
    } catch {
      continue // network/CORS failure — try the next route
    }
    reachedPage = true
    const recipe = parseRecipeFromHtml(html, target)
    if (recipe && (recipe.ingredients.length > 0 || recipe.steps.length > 0)) {
      return aiCleanup(recipe)
    }
  }

  if (reachedPage) {
    throw new ImportError(
      "We opened that page but couldn't find a recipe in it. You can still add the details by hand below.",
    )
  }
  throw new ImportError(
    "Couldn't reach that link. Check the address, or add the recipe by hand below.",
  )
}
