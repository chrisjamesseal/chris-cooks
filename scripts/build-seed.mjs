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
function parseIngredient(line, id) {
  const raw = cleanText(line)
  const base = { id, raw, item: raw }
  const m = QTY_UNIT.exec(raw)
  if (!m) return base
  const [, qty, unit, rest] = m
  const quantity = parseQuantity(qty)
  if (quantity === undefined) return base
  return { ...base, quantity, unit: unit || undefined, item: rest.trim() || raw }
}

// --- category mapping (mirror of src/lib/import.ts) ------------------------
function mapCategory(raw) {
  const c = (raw || '').toLowerCase()
  if (/dessert|cake|pudding|sweet|bake|cookie|brownie|banoffee/.test(c)) return 'Dessert'
  if (/breakfast|brunch|oats|overnight/.test(c)) return 'Breakfast'
  if (/snack|canap|starter|appetiser|appetizer|side|sauce|condiment|dip|slaw/.test(c)) return 'Snack'
  if (/lunch/.test(c)) return 'Lunch'
  return 'Dinner'
}

// --- misc helpers ----------------------------------------------------------
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const STOPWORDS = new Set(['the', 'and', 'with', 'for', 'a', 'of', 'in', 'easy', 'best', 'homemade', 'quick', 'my'])
function imageFor(title, id) {
  const words = title
    .replace(/\s*[-–|].*$/, '') // drop "- Instant Brands" style suffixes
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, 3)
  const keywords = (words.length ? words : ['food']).join(',')
  return `https://loremflickr.com/600/600/${keywords}?lock=${hash(id) % 100000}`
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

// --- markdown parsing ------------------------------------------------------
function parseRecipe(md) {
  const lines = md.split(/\r?\n/)
  const title = cleanText((lines.find((l) => l.startsWith('# ')) || '').replace(/^#\s*/, ''))
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
    image: imageFor(title, id),
    source: source
      ? { type: 'url', url: /^https?:\/\//.test(source) ? source : `https://${source}` }
      : { type: 'manual' },
    mainCategory: mapCategory(field('Category')),
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
