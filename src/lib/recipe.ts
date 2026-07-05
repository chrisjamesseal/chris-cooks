import type { Ingredient, Step } from '../types'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const QTY_UNIT = /^\s*([\d./]+)\s*([a-zA-Z]+)?\s+(.*)$/

/**
 * Turn a free-text line like "2 cups flour" into a structured ingredient.
 * Parsing is best-effort: the original text is always kept in `raw`.
 */
export function parseIngredient(line: string): Ingredient {
  const raw = line.trim()
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
