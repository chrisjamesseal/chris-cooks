import type { Ingredient, Step } from '../types'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const QTY_UNIT = /^\s*([\d./]+)\s*([a-zA-Z]+)?\s+(.*)$/

/** Drop parenthetical notes and tidy spacing/punctuation from an ingredient line. */
export function cleanIngredientLine(line: string): string {
  return line
    .replace(/\s*[([][^)\]]*[)\]]/g, '') // remove (…) and […] notes
    .replace(/[()[\]]/g, ' ') // neutralise any orphan bracket (note split across lines)
    .replace(/\s+,/g, ',') // fix " ," left behind
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;]+$/, '')
    .trim()
}

/**
 * Turn a free-text line like "2 cups flour" into a structured ingredient.
 * Parsing is best-effort: the original text is always kept in `raw`.
 */
export function parseIngredient(line: string): Ingredient {
  const raw = cleanIngredientLine(line)
  const base: Ingredient = { id: newId(), raw, item: raw }
  const match = QTY_UNIT.exec(raw)
  if (!match) return base

  const [, qty, unit, rest] = match
  const quantity = parseQuantity(qty)
  if (quantity === undefined) return base

  return {
    ...base,
    quantity,
    unit: unit || undefined,
    item: rest.trim() || raw,
  }
}

function parseQuantity(text: string): number | undefined {
  if (text.includes('/')) {
    const [n, d] = text.split('/').map(Number)
    if (d) return n / d
    return undefined
  }
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

export function parseSteps(text: string): Step[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => ({ id: newId(), text: line.replace(/^\d+[.)]\s*/, '') }))
}

export function ingredientsFromText(text: string): Ingredient[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseIngredient)
}

const FRACTIONS: [number, string][] = [
  [1 / 3, '⅓'],
  [2 / 3, '⅔'],
  [1 / 4, '¼'],
  [3 / 4, '¾'],
  [1 / 2, '½'],
]

/** Format a scaled quantity for display, using nice fractions where they fit. */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const rounded = Math.round(n * 100) / 100
  const whole = Math.floor(rounded + 1e-9)
  const frac = rounded - whole
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) {
      return whole > 0 ? `${whole}${glyph}` : glyph
    }
  }
  if (frac < 0.02) return String(whole)
  // Otherwise a tidy decimal, trailing zeros stripped.
  return String(Number(rounded.toFixed(2)))
}

// Metric units read better glued to the number ("400g", "200ml").
const ATTACHED_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl'])

/**
 * Scale an ingredient by a factor and render it as a display string. At the
 * original scale we keep the exact text the user typed; ingredients we couldn't
 * parse a quantity for are always shown unchanged.
 */
export function scaleIngredientText(ing: Ingredient, factor: number): string {
  if (ing.quantity === undefined) return ing.raw
  if (factor === 1) return ing.raw
  const qty = formatQuantity(ing.quantity * factor)
  const unit = ing.unit
  const head = unit
    ? ATTACHED_UNITS.has(unit.toLowerCase())
      ? `${qty}${unit}`
      : `${qty} ${unit}`
    : qty
  const line = [head, ing.item].filter(Boolean).join(' ')
  return ing.note ? `${line} (${ing.note})` : line
}

// Measurement units to strip from step prose (not time/temperature words).
const MEASURE_UNITS =
  'g|kg|mg|ml|l|cl|dl|tbsp|tbs|tbsps|tsp|tsps|oz|lb|lbs|cup|cups|clove|cloves|pinch|pinches|handful|handfuls|slice|slices|can|cans|tin|tins|sprig|sprigs|stick|sticks'

/**
 * Remove explicit measured quantities from a step's prose (e.g. "100g yogurt" →
 * "yogurt", "2 tbsp oil" → "oil") so they don't contradict the per-serving
 * ingredient pills once the recipe is scaled. Times, temperatures and bare
 * counts are left alone.
 */
export function deQuantifyStep(text: string): string {
  return text
    .replace(new RegExp(`\\b[\\d./⁄–-]+\\s*(?:${MEASURE_UNITS})\\b\\.?`, 'gi'), '')
    .replace(/\bthe\s+of\b/gi, 'the')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Prep/measurement/descriptor words that shouldn't be used to match an
// ingredient to a step — we want the food nouns.
const STEP_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'and', 'or', 'for', 'plus', 'extra', 'with', 'into', 'from',
  'your', 'fresh', 'dried', 'chopped', 'finely', 'roughly', 'sliced', 'diced', 'grated',
  'crushed', 'peeled', 'large', 'small', 'medium', 'ripe', 'ground', 'boneless', 'skinless',
  'free', 'fat', 'natural', 'piece', 'pieces', 'handful', 'wedges', 'serve', 'taste', 'optional',
  'cooking', 'spray', 'low', 'calorie', 'tbsp', 'tsp', 'cup', 'cups', 'good', 'quality', 'about',
])

function keywordsFor(ing: Ingredient): string[] {
  return ing.raw
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STEP_STOPWORDS.has(w))
}

/**
 * Which ingredients does this step use? Honours stored `ingredientRefs` when an
 * importer set them; otherwise matches each ingredient's food words against the
 * step text. Best-effort — used to surface amounts while cooking.
 */
export function ingredientsForStep(step: Step, ingredients: Ingredient[]): Ingredient[] {
  if (step.ingredientRefs && step.ingredientRefs.length) {
    const refs = new Set(step.ingredientRefs)
    return ingredients.filter((i) => refs.has(i.id))
  }
  const text = step.text.toLowerCase()
  return ingredients.filter((ing) =>
    keywordsFor(ing).some((w) => new RegExp(`\\b${w}\\b`).test(text)),
  )
}

/**
 * Break a step into readable paragraphs. Explicit line breaks win; otherwise a
 * long block is split on sentence boundaries into chunks of a couple sentences
 * so dense imported methods don't read as one wall of text.
 */
export function stepParagraphs(text: string): string[] {
  const byLine = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (byLine.length > 1) return byLine

  const single = byLine[0] ?? ''
  if (single.length <= 220) return [single]

  const sentences = single.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)
  if (!sentences || sentences.length < 3) return [single]

  const paras: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    paras.push(
      sentences
        .slice(i, i + 2)
        .join('')
        .trim(),
    )
  }
  return paras
}
