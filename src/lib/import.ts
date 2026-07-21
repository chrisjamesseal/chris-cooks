import type { Ingredient, MainCategory, Nutrition, Recipe, Step } from '../types'
import { newId, parseIngredient, stripListMarkers, tidyCuisine, tidyRecipeTitle, titleCategoryOverride } from './recipe'
import { nutritionFromAiResponse } from './ai'

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

function canonicalPath(url: string): string {
  try {
    const u = new URL(normalizeUrl(url))
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Some recipe pages (BBC Food included) embed more than one Recipe JSON-LD
 * node on the same page — e.g. a "related recipes" carousel that markup
 * each teaser as its own Recipe — so blindly taking the first node found
 * can silently pull a different dish's ingredients/nutrition. Prefer
 * whichever node's own `url`/`mainEntityOfPage` matches the page we
 * actually fetched; fall back to the first node when that's inconclusive
 * (the common case of a page with only one recipe on it anyway).
 */
function pickRecipeNode(nodes: Json[], sourceUrl: string): Json | undefined {
  if (nodes.length <= 1) return nodes[0]
  const target = canonicalPath(sourceUrl)
  const matched = nodes.find((n) => {
    const u = firstString(n.url) || firstString(n.mainEntityOfPage?.['@id']) || firstString(n.mainEntityOfPage)
    return u && canonicalPath(u) === target
  })
  return matched ?? nodes[0]
}

/** Parse recipe data out of a page's HTML. Returns null if none is found. */
export function parseRecipeFromHtml(html: string, sourceUrl: string): Recipe | null {
  const nodes: Json[] = []
  for (const block of extractJsonLdBlocks(html)) collectRecipeNodes(block, nodes)
  const node = pickRecipeNode(nodes, sourceUrl)
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
  const title = tidyRecipeTitle(tidyTitle(cleanText(firstString(node.name)) || 'Imported recipe'))
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
    mainCategory: titleCategoryOverride(title) ?? mapCategory(firstString(node.recipeCategory)),
    cuisine: tidyCuisine(cleanText(firstString(node.recipeCuisine))),
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
  // schema.org's own spec says sodium/cholesterol content is already in
  // milligrams, but plenty of real recipe sites publish it in grams instead
  // (e.g. "2.46g") — trust an explicit unit suffix over the spec when given,
  // converting g/kg to mg, rather than taking the bare number at face value.
  const numMg = (v: Json): number | undefined => {
    const s = firstString(v)
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
    if (!s) return undefined
    const m = s.replace(',', '.').match(/([\d.]+)\s*(k?g|mg)?/i)
    if (!m) return undefined
    const n = Number(m[1])
    if (!Number.isFinite(n)) return undefined
    const unit = (m[2] ?? '').toLowerCase()
    if (unit === 'kg') return n * 1_000_000
    if (unit === 'g') return n * 1000
    return n
  }
  nutrition.calories = num(node.calories)
  nutrition.fatG = num(node.fatContent)
  nutrition.satFatG = num(node.saturatedFatContent)
  nutrition.cholesterolMg = numMg(node.cholesterolContent)
  nutrition.sodiumMg = numMg(node.sodiumContent)
  nutrition.carbsG = num(node.carbohydrateContent)
  nutrition.fiberG = num(node.fiberContent)
  nutrition.sugarG = num(node.sugarContent)
  nutrition.proteinG = num(node.proteinContent)
  // servingSize is often just a plain count ("1", meaning "1 portion") rather
  // than a weight — only trust it as grams when the source text actually
  // says so, instead of storing a nonsensical "1g" serving size.
  const sizeMatch = firstString(node.servingSize)?.match(/([\d.]+)\s*(kg|g)\b/i)
  if (sizeMatch) {
    const n = Number(sizeMatch[1])
    if (Number.isFinite(n)) nutrition.servingSizeG = sizeMatch[2].toLowerCase() === 'kg' ? n * 1000 : n
  }
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
  if (/sauce|condiment|dip|dressing|marinade/.test(c)) return 'Sauce'
  if (/soup|bisque|chowder|broth/.test(c)) return 'Soup'
  if (/salad|slaw/.test(c)) return 'Salad'
  if (/side|accompaniment/.test(c)) return 'Side'
  if (/dessert|cake|pudding|sweet|bake/.test(c)) return 'Dessert'
  if (/breakfast|brunch/.test(c)) return 'Breakfast'
  if (/snack|canap|starter|appetiser|appetizer/.test(c)) return 'Snack'
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
  return stripListMarkers(
    input
      .replace(/<[^>]+>/g, ' ') // strip any HTML tags
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
        const key = code.toLowerCase()
        if (ENTITIES[key]) return ENTITIES[key]
        if (key.startsWith('#x')) return codePoint(parseInt(key.slice(2), 16))
        if (key.startsWith('#')) return codePoint(parseInt(key.slice(1), 10))
        return whole
      })
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function codePoint(n: number): string {
  return Number.isFinite(n) ? String.fromCodePoint(n) : ''
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

export function detectVideoSource(url: string): 'tiktok' | 'instagram' | null {
  const lower = url.toLowerCase()
  if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(lower)) return 'tiktok'
  if (/instagram\.com|instagr\.am/i.test(lower)) return 'instagram'
  return null
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
 * Look up nutrition for an existing recipe by re-reading its source page's
 * schema.org data. Returns null unless the page itself declares nutrition,
 * so values are never guessed. Used to backfill recipes saved without it.
 */
export async function fetchNutritionFromSource(url: string): Promise<Nutrition | null> {
  if (detectVideoSource(url)) return null
  const target = normalizeUrl(url)
  for (const attempt of [target, ...PROXIES.map((p) => p(target))]) {
    let html: string
    try {
      html = await fetchText(attempt)
    } catch {
      continue
    }
    const nodes: Json[] = []
    for (const block of extractJsonLdBlocks(html)) collectRecipeNodes(block, nodes)
    const node = pickRecipeNode(nodes, target)
    const nutrition = node ? mapNutrition(node.nutrition) : undefined
    return nutrition?.calories ? nutrition : null // page reached but it declares no (matching) nutrition
  }
  return null
}

/**
 * Optional AI cleanup: when VITE_AI_CLEANUP_URL is configured (a serverless
 * proxy holding the API key), scraped text is sent through it to fix odd
 * formatting/typos. No-op — and never fails the import — when unset.
 */
function extractVideoCaption(html: string): string | null {
  // Try to extract caption from Open Graph meta tags
  const ogDescriptionMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i)
  if (ogDescriptionMatch?.[1]) return unescapeCaption(decodeHTMLEntities(ogDescriptionMatch[1]))

  // Try to extract from standard meta description
  const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  if (metaDescMatch?.[1]) return unescapeCaption(decodeHTMLEntities(metaDescMatch[1]))

  // TikTok: try to find caption in JSON-LD or data attributes
  const tiktokMatch = html.match(/"desc":"([^"]*)"/)
  if (tiktokMatch?.[1]) return unescapeCaption(decodeHTMLEntities(tiktokMatch[1]))

  // Instagram: try to find caption in JSON data
  const igMatch = html.match(/"caption":"([^"]*)"/)
  if (igMatch?.[1]) return unescapeCaption(decodeHTMLEntities(igMatch[1]))

  return null
}

function decodeHTMLEntities(text: string): string {
  const textarea = new DOMParser().parseFromString(text, 'text/html').documentElement.textContent
  return textarea || text
}

/** JSON-embedded captions carry line breaks as literal backslash-n; turn those back into real newlines. */
function unescapeCaption(text: string): string {
  return text.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\\"/g, '"')
}

function extractOgImage(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i)
  return m ? cleanText(m[1]) || undefined : undefined
}

/**
 * TikTok/Instagram cover-image URLs are signed and expire within days, so a
 * hotlink would go blank. Instead the image is fetched at import time (via the
 * CORS proxies when needed) and stored as a compact JPEG data URL.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  for (const attempt of [url, ...PROXIES.map((p) => p(url))]) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const res = await fetch(attempt, { signal: controller.signal })
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) continue
      const bitmap = await createImageBitmap(blob)
      const max = 900
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.8)
    } catch {
      // decode/network failure — try the next route
    } finally {
      clearTimeout(timer)
    }
  }
  return undefined
}

/**
 * Instagram/Facebook's og:description wraps the real caption in a stats
 * preamble, e.g. `8,633 Likes, 48 Comments - someuser on May 28, 2026: "…"`.
 * Strip that off (keeping the username for a title fallback) along with the
 * quote marks the preamble wraps the caption in.
 */
function stripCaptionPreamble(caption: string): { text: string; username?: string } {
  const preamble = caption.match(/^[\d,.]+\s*(?:likes?|views?)(?:,\s*[\d,.]+\s*comments?)?\s*-\s*([^\s:]+)[^:]*:\s*[""]?/i)
  let text = preamble ? caption.slice(preamble[0].length) : caption
  text = text.replace(/[""]\s*\.?\s*$/, '').trim()
  return { text, username: preamble?.[1] }
}

// Short calls-to-action that show up in recipe captions but carry no
// ingredient/step content of their own (e.g. "One serving👇", "Enjoyyy😍").
const FILLER_LINE_RE =
  /^(enjoy+|one serving|full recipe|recipe below|swipe|save (this|it) for later|tag someone|let me know|follow for more|comment|serves? \d+)\b.*$/i

// A short, mostly-uppercase line (optionally led by an emoji) used to label a
// group of ingredients, e.g. "🍞 MAIN BITS" or "SAUCE".
const SECTION_HEADER_RE = /^(?:\p{Emoji_Presentation}\s*)?[A-Z][A-Z &]{1,25}$/u

const INGREDIENT_LINE_RE =
  /^[\d¼½¾⅓⅔]|^(a|an|one|two|three|four|half)\s|\b(g|kg|ml|l|tbsp|tsp|cup|oz|lb|clove|slice|pinch)s?\b/i

const STEP_LINE_RE =
  /^[0-9]+[.)]\s*|^(heat|cook|mix|add|stir|bake|fry|boil|simmer|blend|combine|spread|pour|top|cover|whisk|chop|slice|dice|season|marinate|preheat|drain|rinse|serve|garnish)\b/i

function parseVideoCaption(caption: string): {
  title?: string
  username?: string
  ingredients: string[]
  steps: string[]
} {
  const { text, username } = stripCaptionPreamble(caption)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  let title: string | undefined
  const ingredients: string[] = []
  const steps: string[] = []
  let inSteps = false

  for (const line of lines) {
    if (FILLER_LINE_RE.test(line) || SECTION_HEADER_RE.test(line)) continue

    if (STEP_LINE_RE.test(line)) {
      inSteps = true
      steps.push(line.replace(/^[0-9]+[.)]\s*/, ''))
    } else if (INGREDIENT_LINE_RE.test(line)) {
      ingredients.push(line)
    } else if (inSteps) {
      steps.push(line)
    } else if (!title && line.length >= 8 && line.length <= 70) {
      // First substantial, non-ingredient, non-filler line is likely the dish name.
      title = line.replace(/^(easiest|quickest|best|simple|quick|healthy|easy)\s+/i, '').replace(/recipe\s*/i, '').trim()
    } else {
      ingredients.push(line)
    }
  }

  return {
    title,
    username,
    ingredients: ingredients.length > 0 ? ingredients : ['See video caption for ingredients'],
    steps:
      steps.length > 0
        ? steps
        : ['Full method not included in the caption, check the original video for step-by-step instructions.'],
  }
}

/**
 * When a caption never names the dish (very common on reels — the name is
 * on-screen in the video), build a workable title from the main ingredients,
 * e.g. "Baby potatoes & chicken breast". Beats "Recipe by @user".
 */
function titleFromIngredients(ingredients: Ingredient[]): string | undefined {
  const items = ingredients.map((i) => i.item.trim()).filter((s) => s.length > 2)
  if (items.length < 2) return undefined
  const main = items[0][0].toUpperCase() + items[0].slice(1)
  return `${main} & ${items[1]}`
}

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

function parseVideoRecipe(html: string, sourceUrl: string, sourceType: 'tiktok' | 'instagram'): Recipe | null {
  const caption = extractVideoCaption(html)
  if (!caption) return null

  const { title, username, ingredients, steps } = parseVideoCaption(caption)
  const now = Date.now()
  const parsedIngredients = ingredients.map(parseIngredient).filter((i) => i.raw)
  const finalTitle = tidyRecipeTitle(
    title ||
      titleFromIngredients(parsedIngredients) ||
      (username ? `Recipe by @${username}` : `Imported ${sourceType} recipe`),
  )

  return {
    id: newId(),
    schemaVersion: 1,
    title: finalTitle,
    source: { type: sourceType, url: sourceUrl },
    mainCategory: titleCategoryOverride(finalTitle) ?? 'Dinner',
    servings: 1,
    times: {},
    ingredients: parsedIngredients,
    steps: steps.map((text) => ({ id: newId(), text })),
    createdAt: now,
    updatedAt: now,
  }
}

const MAIN_CATEGORIES: MainCategory[] = [
  'Breakfast', 'Lunch', 'Dinner', 'Side', 'Sauce', 'Soup', 'Salad', 'Dessert', 'Snack',
]

/**
 * Deep video import via the AI worker (when configured): the worker fetches
 * the video page server-side, reads the caption AND the cover image with
 * Claude, and returns a full structured recipe — proper dish title included.
 * Returns null (falling back to client-side caption parsing) on any failure.
 */
async function aiVideoImport(url: string, sourceType: 'tiktok' | 'instagram'): Promise<Recipe | null> {
  const endpoint = import.meta.env.VITE_AI_CLEANUP_URL
  if (!endpoint) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'video', url }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      title?: string
      ingredients?: string[]
      steps?: string[]
      servings?: number
      category?: string
      cuisine?: string | null
      prep?: string | null
      cook?: string | null
      image?: string | null
      nutrition?: Record<string, unknown> | null
    }
    const ingredients = Array.isArray(data.ingredients)
      ? data.ingredients.map((l) => parseIngredient(cleanText(String(l)))).filter((i) => i.raw)
      : []
    const steps = Array.isArray(data.steps)
      ? data.steps.map((t) => ({ id: newId(), text: cleanText(String(t)) })).filter((s) => s.text)
      : []
    if (!data.title || ingredients.length === 0 || steps.length === 0) return null
    const now = Date.now()
    return {
      id: newId(),
      schemaVersion: 1,
      title: tidyRecipeTitle(tidyTitle(cleanText(String(data.title)))),
      image:
        typeof data.image === 'string' && data.image.startsWith('data:image/') ? data.image : undefined,
      source: { type: sourceType, url },
      mainCategory: MAIN_CATEGORIES.includes(data.category as MainCategory)
        ? (data.category as MainCategory)
        : 'Dinner',
      cuisine: tidyCuisine(data.cuisine ? cleanText(String(data.cuisine)) : undefined),
      servings:
        typeof data.servings === 'number' && Number.isFinite(data.servings) && data.servings >= 1
          ? Math.round(data.servings)
          : 1,
      times: {
        prep: data.prep ? cleanText(String(data.prep)) || undefined : undefined,
        cook: data.cook ? cleanText(String(data.cook)) || undefined : undefined,
      },
      ingredients,
      steps,
      nutrition: nutritionFromAiResponse(data.nutrition) ?? undefined,
      createdAt: now,
      updatedAt: now,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Downscale a photo for upload and split it into a data URL plus bare base64 + media type. */
function downscaleImage(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const max = 1600
        let { width, height } = img
        const scale = Math.min(1, max / Math.max(width, height))
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        resolve({ dataUrl, base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Import a recipe from a photo (cookbook page, handwritten card, screenshot)
 * via the AI worker's vision mode. Requires the worker to be configured —
 * there's no non-AI fallback for reading a photo.
 */
export async function importRecipeFromImage(file: File): Promise<Recipe> {
  const endpoint = import.meta.env.VITE_AI_CLEANUP_URL
  if (!endpoint) {
    throw new ImportError("Uploading a photo needs the AI helper set up. See the changelog for one-time setup.")
  }

  const { dataUrl, base64, mediaType } = await downscaleImage(file)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'image-import', image: base64, mediaType }),
      signal: controller.signal,
    })
  } catch {
    throw new ImportError("Couldn't reach the AI helper. Check your connection and try again.")
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 422) {
      throw new ImportError("Couldn't read a recipe from that photo. Try a clearer, well-lit shot.")
    }
    throw new ImportError(`The AI helper returned an error (${res.status}).`)
  }

  const data = (await res.json()) as {
    title?: string
    ingredients?: string[]
    steps?: string[]
    servings?: number
    category?: string
    cuisine?: string | null
    prep?: string | null
    cook?: string | null
    nutrition?: Record<string, unknown> | null
  }
  const ingredients = Array.isArray(data.ingredients)
    ? data.ingredients.map((l) => parseIngredient(cleanText(String(l)))).filter((i) => i.raw)
    : []
  const steps = Array.isArray(data.steps)
    ? data.steps.map((t) => ({ id: newId(), text: cleanText(String(t)) })).filter((s) => s.text)
    : []
  if (!data.title || ingredients.length === 0 || steps.length === 0) {
    throw new ImportError("Couldn't read a recipe from that photo. Try a clearer, well-lit shot.")
  }

  const now = Date.now()
  return {
    id: newId(),
    schemaVersion: 1,
    title: tidyRecipeTitle(tidyTitle(cleanText(String(data.title)))),
    image: dataUrl,
    source: { type: 'manual' },
    mainCategory: MAIN_CATEGORIES.includes(data.category as MainCategory) ? (data.category as MainCategory) : 'Dinner',
    cuisine: tidyCuisine(data.cuisine ? cleanText(String(data.cuisine)) : undefined),
    servings:
      typeof data.servings === 'number' && Number.isFinite(data.servings) && data.servings >= 1
        ? Math.round(data.servings)
        : 1,
    times: {
      prep: data.prep ? cleanText(String(data.prep)) || undefined : undefined,
      cook: data.cook ? cleanText(String(data.cook)) || undefined : undefined,
    },
    ingredients,
    steps,
    nutrition: nutritionFromAiResponse(data.nutrition) ?? undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export async function importRecipeFromUrl(url: string): Promise<Recipe> {
  const target = normalizeUrl(url)
  const videoSource = detectVideoSource(target)

  // Try video import first if it's a video URL
  if (videoSource) {
    // Best path: the AI worker reads the caption and the video's cover image
    // together and returns a complete recipe with a real dish name.
    const aiRecipe = await aiVideoImport(target, videoSource)
    if (aiRecipe) return aiRecipe

    const attempts = [target, ...PROXIES.map((p) => p(target))]
    for (const attempt of attempts) {
      let html: string
      try {
        html = await fetchText(attempt)
      } catch {
        continue
      }
      const recipe = parseVideoRecipe(html, target, videoSource)
      if (recipe && (recipe.ingredients.length > 0 || recipe.steps.length > 0)) {
        const cover = extractOgImage(html)
        if (cover) recipe.image = await fetchImageAsDataUrl(cover)
        return aiCleanup(recipe)
      }
    }
    throw new ImportError(
      `Couldn't extract recipe caption from the ${videoSource} video. Try copying the caption text manually.`,
    )
  }

  // Fall back to standard recipe import
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
