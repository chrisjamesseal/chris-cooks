import type { Ingredient, Step } from '../types'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const QTY_UNIT = /^\s*([\d./¼½¾⅓⅔⅛⅜⅝⅞]+)\s*([a-zA-Z]+)?\s+(.*)$/

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

/**
 * Normalise a recipe title: strip hype openers ("THE BEST", "easiest ever"),
 * emojis and shouting, then apply Title Case ("creamy pesto pasta" →
 * "Creamy Pesto Pasta"). Small words stay lowercase except at the start.
 */
const TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'and', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'without',
])
const TITLE_KEEP_UPPER = new Set(['bbq', 'blt'])
const TITLE_HYPE =
  /^(?:the\s+|my\s+|this\s+|these\s+|our\s+)?(?:absolute\s+)?(?:best(?:\s+ever)?|easiest|quickest|simplest|ultimate|perfect|amazing|incredible|unbelievable|insanely\s+good|viral|famous|legendary|epic|to\s+die\s+for|must[- ]try)\s+/i

/**
 * Titles that are unambiguous about their category, used to correct
 * miscategorised imports ("Classic Victoria Sandwich" is a cake, "Hollandaise
 * Sauce" is a sauce, whatever the site's own category field says). Checked in
 * order; each regex is deliberately tight so savoury dishes and breakfast
 * bakes are never mis-caught by the dessert pattern, etc.
 */
const TITLE_CATEGORY_RULES: [RegExp, 'Sauce' | 'Soup' | 'Salad' | 'Dessert'][] = [
  [/\b(sauce|gravy|dressing|hollandaise|marinade|dip|salsa|chutney|relish)\b/i, 'Sauce'],
  [/\b(soup|bisque|chowder|broth)\b/i, 'Soup'],
  [/\bsalad|coleslaw|cole slaw\b/i, 'Salad'],
  [
    /\b(cakes?|sponge|victoria sandwich|cheesecake|brownies?|banoffee|pavlova|trifle|tiramisu|fudge|meringues?|profiteroles?|eclairs?|ice cream|sorbet)\b/i,
    'Dessert',
  ],
]

/** The category a title unambiguously belongs to, if any. */
export function titleCategoryOverride(title: string): 'Sauce' | 'Soup' | 'Salad' | 'Dessert' | undefined {
  for (const [re, category] of TITLE_CATEGORY_RULES) {
    if (re.test(title)) return category
  }
  return undefined
}

/**
 * Clean a scraped cuisine value: sites emit schema.org diet URLs, comma
 * lists and stray fragments. Keep the first plausible cuisine word or drop it.
 */
export function tidyCuisine(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  for (const part of raw.split(',')) {
    const c = part.trim().toLowerCase()
    if (!c || c.includes('http') || c.includes('/') || c.includes('&')) continue
    if (/^(brunch|international|western|fusion|other|salads?|slaws?)$/.test(c)) continue
    if (c.length > 20 || !/^[a-z][a-z\s-]*$/.test(c)) continue
    // "north american" → "american", "british indian restaurant" → "indian"
    if (c.includes('american')) return 'american'
    if (c.includes('indian')) return 'indian'
    if (c.includes('thai')) return 'thai'
    if (c.includes('italian')) return 'italian'
    return c
  }
  return undefined
}

export function tidyRecipeTitle(raw: string): string {
  let t = raw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, ' ')
    .replace(/️/g, '') // variation selector left behind by stripped emoji
    .replace(/‍/g, '') // zero-width joiner likewise
    .replace(/!+/g, ' ')
    .replace(/["“”]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  let prev = ''
  while (prev !== t) {
    prev = t
    t = t.replace(TITLE_HYPE, '')
  }
  t = t.replace(/^(?:my|this|these|our)\s+/i, '')
  t = t.replace(/\s+(?:ever(?:\s+made)?|you(?:'|’)ll ever (?:make|eat|try|need)|you need to try)\s*$/i, '').trim()
  if (!t) t = raw.trim()

  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (TITLE_KEEP_UPPER.has(w.replace(/[^a-z]/g, ''))) return w.toUpperCase()
      if (i > 0 && TITLE_SMALL_WORDS.has(w)) return w
      return w.replace(/(^|[-/])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    })
    .join(' ')
}

/**
 * Strip markdown/list artifacts that leak in from scraped pages, AI output or
 * pasted text — leading bullets ("•", "-", "*"), numbered/lettered list
 * markers ("1.", "2)", "a."), and markdown emphasis ("**bold**", "*italic*")
 * — so ingredients and steps read as clean prose.
 */
export function stripListMarkers(line: string): string {
  let t = line
    // Leading bullet glyphs (possibly repeated), including "- " and "* ".
    .replace(/^(?:[•‣◦▪▸●○✦✱][ \t]+|[-*][ \t]+)+/, '')
    // Leading numbered ("1.", "2)") or lettered ("a.", "b)") list markers.
    .replace(/^\s*\d+[.):]\s+/, '')
    .replace(/^\s*[a-hA-H][.)]\s+/, '')
    // Markdown bold wrapper around a span, keeping the inner text.
    .replace(/\*\*(.+?)\*\*/g, '$1')
  // Any asterisks left over (stray emphasis markers) are noise, not content.
  t = t.replace(/\*+/g, '')
  return t.replace(/\s{2,}/g, ' ').trim()
}

/** Drop parenthetical notes and tidy spacing/punctuation from an ingredient line. */
export function cleanIngredientLine(line: string): string {
  return stripListMarkers(line)
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
  // Peel off any unicode fraction ("1½" → 1 + 0.5, "½" → 0.5).
  let base = 0
  let t = text
  for (const [glyph, value] of Object.entries(UNICODE_FRACTIONS)) {
    if (t.includes(glyph)) {
      base += value
      t = t.replace(glyph, '')
    }
  }
  if (!t) return base || undefined
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(Number)
    return d ? base + n / d : base || undefined
  }
  const n = Number(t)
  return Number.isFinite(n) ? base + n : base || undefined
}

export function parseSteps(text: string): Step[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => ({ id: newId(), text: stripListMarkers(line) }))
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

/** Singular/plural spellings of a word, so "potatoes" matches "potato" and vice versa. */
function wordVariants(w: string): string[] {
  const variants = new Set([w, `${w}s`])
  if (w.endsWith('es')) variants.add(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) variants.add(w.slice(0, -1))
  if (/(o|ch|sh|ss|x|z)$/.test(w)) variants.add(`${w}es`)
  return [...variants]
}

/**
 * Which ingredients does this step use? Honours stored `ingredientRefs` when an
 * importer set them; otherwise matches each ingredient's food words against the
 * step text (tolerant of singular/plural). Best-effort — used to surface
 * amounts while cooking.
 */
export function ingredientsForStep(step: Step, ingredients: Ingredient[]): Ingredient[] {
  if (step.ingredientRefs && step.ingredientRefs.length) {
    const refs = new Set(step.ingredientRefs)
    return ingredients.filter((i) => refs.has(i.id))
  }
  const text = step.text.toLowerCase()
  return ingredients.filter((ing) =>
    keywordsFor(ing).some((w) =>
      wordVariants(w).some((v) => new RegExp(`\\b${v}\\b`).test(text)),
    ),
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
