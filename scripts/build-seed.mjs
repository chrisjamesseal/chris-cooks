// Build-time only. Parses a directory of markdown recipe exports into
// public/seed-recipes.json (the bundle the app seeds from on first run).
//
//   node scripts/build-seed.mjs <markdown-dir> [out.json]
//
// The parsing here intentionally mirrors src/lib/recipe.ts (parseIngredient)
// and src/lib/import.ts (mapCategory / cleanText) so seeded recipes behave
// exactly like ones added through the app (scaling, etc.).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const inDir = process.argv[2]
const outFile = process.argv[3] || 'public/seed-recipes.json'
if (!inDir) {
  console.error('usage: node scripts/build-seed.mjs <markdown-dir> [out.json]')
  process.exit(1)
}

// --- text cleanup (AI/OCR + entities) -------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
// Common OCR / export typos seen across the export.
const TYPOS = [
  [/\bhaif\b/g, 'half'],
  [/\bconander\b/gi, 'coriander'],
  [/\bcoriaander\b/gi, 'coriander'],
  [/\btomatoe\b/gi, 'tomato'],
  [/\byoghurt\b/gi, 'yogurt'],
  [/\bteaspon\b/gi, 'teaspoon'],
]

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (whole, code) => {
    const key = code.toLowerCase()
    if (ENTITIES[key]) return ENTITIES[key]
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10))
    return whole
  })
}

function cleanText(input) {
  if (!input) return ''
  let s = decodeEntities(String(input))
  // Undo double-encoding leftovers like "&amp;amp".
  s = s.replace(/&amp\b/gi, '&').replace(/\bamp;?/g, '')
  for (const [re, to] of TYPOS) s = s.replace(re, to)
  return s.replace(/\s+/g, ' ').trim()
}

// --- ingredient parsing (mirror of src/lib/recipe.ts) ---------------------
const QTY_UNIT = /^\s*([\d./]+)\s*([a-zA-Z]+)?\s+(.*)$/
function parseQuantity(text) {
  if (text.includes('/')) {
    const [n, d] = text.split('/').map(Number)
    return d ? n / d : undefined
  }
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}
function cleanIngredientLine(line) {
  return cleanText(line)
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;]+$/, '')
    .trim()
}
function parseIngredient(line, id) {
  const raw = cleanIngredientLine(line)
  const base = { id, raw, item: raw }
  const m = QTY_UNIT.exec(raw)
  if (!m) return base
  const [, qty, unit, rest] = m
  const quantity = parseQuantity(qty)
  if (quantity === undefined) return base
  return { ...base, quantity, unit: unit || undefined, item: rest.trim() || raw }
}

// --- category mapping -----------------------------------------------------
// Maps a recipe's freeform category (plus its title as a fallback) onto one of
// the app's five buckets. Word-boundary matches avoid substring traps like
// "panCAKEs" and "SWEET potato", and mains are checked before sides so a dish
// tagged "main course, side dish, snack" lands on Dinner, not Snack.
function mapCategory(raw, title) {
  const hay = `${raw || ''} ${title || ''}`.toLowerCase()
  const has = (re) => re.test(hay)

  // Pure sauces / condiments / dips first — otherwise "Pizza sauce" reads as pizza.
  if (has(/\b(sauce|condiment|dip|dressing|marinade|chutney|salsa|gravy)\b/)) return 'Snack'
  if (has(/\b(breakfast|brunch|pancake|waffle|overnight oats?|porridge|granola|muesli|chia|frittata|shakshuka|omelette?)\b/))
    return 'Breakfast'
  if (has(/\b(dessert|cake|gateau|cheesecake|brownie|cookie|biscuit|pudding|banoffee|custard|tart|crumble)\b/))
    return 'Dessert'
  if (
    has(
      /\b(dinner|main course|main meal|mains|supper|entree|curry|tikka|masala|rogan|katsu|korma|pasta|spaghetti|rigatoni|lasagne|gnocchi|macaroni|carbonara|risotto|paella|noodles?|ramen|pad thai|stir.?fry|burger|tacos?|fajitas?|wrap|shawarma|kebab|pizza|casserole|roast|steak|ribs|wellington|gammon|pie|stew|chill?i|hotpot|one.?pot|one.?pan|fakeaway|schnitzel)\b/,
    )
  )
    return 'Dinner'
  if (has(/\b(lunch|soup|chowder|bisque|salad|slaw|sandwich)\b/)) return 'Lunch'
  if (has(/\b(snacks?|sides?|side dish|appetisers?|appetizers?|starters?|canape|nibbles?|bites?|skewers?)\b/)) return 'Snack'
  return 'Dinner'
}

// --- misc helpers ----------------------------------------------------------
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function parseTotalTime(raw) {
  if (!raw) return undefined
  const h = raw.match(/(\d+)\s*h/)
  const m = raw.match(/(\d+)\s*m/)
  const parts = []
  if (h) parts.push(`${Number(h[1])} hr`)
  if (m) parts.push(`${Number(m[1])} min`)
  return parts.length ? parts.join(' ') : undefined
}
function firstNumber(s) {
  const m = String(s).replace(',', '.').match(/[\d.]+/)
  return m ? Number(m[0]) : undefined
}

const NUTRITION_MAP = {
  Calories: 'calories',
  Fat: 'fatG',
  'Saturated Fat': 'satFatG',
  Cholesterol: 'cholesterolMg',
  Sodium: 'sodiumMg',
  Carbohydrates: 'carbsG',
  Fiber: 'fiberG',
  Sugar: 'sugarG',
  Protein: 'proteinG',
  'Serving Size': 'servingSizeG',
}

// Trim a scraped/exported title down to just the dish name: drop parentheticals,
// SEO tails after a pipe, trailing " - Brand/site" suffixes, and the word "Recipe".
function tidyTitle(raw) {
  let t = raw
  t = t.replace(/\s*[([][^)\]]*[)\]]/g, ' ') // remove (...) and [...]
  t = t.split('|')[0] // drop everything after a pipe (usually SEO/source)
  t = t.replace(/\s+[-–—]\s+.{1,30}$/, '') // drop trailing " - Brand/site" (spaced dash only)
  t = t.replace(/\brecipes?\b/gi, ' ') // remove the word Recipe/Recipes
  t = t.replace(/\s{2,}/g, ' ').replace(/[\s,\-–—:]+$/, '').trim()
  return t || raw.trim()
}

// --- markdown parsing ------------------------------------------------------
function parseRecipe(md) {
  const lines = md.split(/\r?\n/)
  const title = tidyTitle(cleanText((lines.find((l) => l.startsWith('# ')) || '').replace(/^#\s*/, '')))
  if (!title) return null

  const field = (name) => {
    const re = new RegExp(`^\\*\\*${name}\\*\\*\\s*(.*)$`)
    for (const l of lines) {
      const m = l.match(re)
      if (m) return m[1].trim()
    }
    return undefined
  }

  // section extraction by ## headers
  const sectionLines = (name) => {
    const out = []
    let inSection = false
    for (const l of lines) {
      if (/^##\s+/.test(l)) {
        inSection = new RegExp(`^##\\s+${name}\\b`, 'i').test(l)
        continue
      }
      if (inSection) out.push(l)
    }
    return out
  }

  const id = `seed-${slugify(title)}`

  const ingredients = sectionLines('Ingredients')
    .map((l) => l.replace(/^\s*[*-]\s*/, '').trim())
    .filter(Boolean)
    .map((line, i) => parseIngredient(line, `${id}-ing-${i}`))

  const steps = sectionLines('Instructions')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .map((l) => cleanText(l))
    .filter(Boolean)
    .map((text, i) => ({ id: `${id}-step-${i}`, text }))

  // nutrition
  const nutrition = {}
  for (const [label, key] of Object.entries(NUTRITION_MAP)) {
    const v = field(label)
    const n = v ? firstNumber(v) : undefined
    if (n !== undefined) nutrition[key] = n
  }

  const source = field('Source')
  const now = Date.now()

  return {
    id,
    schemaVersion: 1,
    title,
    // No image: the app renders a clean emoji/gradient placeholder for recipes
    // without a photo. Swap in a real photo any time via Edit → Photo URL.
    source: source
      ? { type: 'url', url: /^https?:\/\//.test(source) ? source : `https://${source}` }
      : { type: 'manual' },
    mainCategory: mapCategory(field('Category'), title),
    cuisine: cleanText(field('Cuisine')) || undefined,
    servings: Math.max(1, Math.round(firstNumber(field('Servings')) ?? 4)),
    times: { total: parseTotalTime(field('Total Time')) },
    ingredients,
    steps,
    nutrition: Object.keys(nutrition).length ? nutrition : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

// --- run -------------------------------------------------------------------
const files = readdirSync(inDir).filter((f) => f.endsWith('.md'))
const bySlug = new Map()
let skipped = 0
for (const f of files) {
  const recipe = parseRecipe(readFileSync(join(inDir, f), 'utf8'))
  // Keep any recipe with ingredients; a few exports have an empty method,
  // which the detail page renders gracefully (and the user can fill in).
  if (!recipe || recipe.ingredients.length === 0) {
    skipped++
    continue
  }
  bySlug.set(recipe.id, recipe) // dedupe by slug
}

const recipes = [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title))
const payload = { version: 1, recipes }
writeFileSync(outFile, JSON.stringify(payload))
console.log(`Parsed ${files.length} files → ${recipes.length} recipes (${skipped} skipped) → ${outFile}`)
