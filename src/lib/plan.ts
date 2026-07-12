/** "This week" meal plan: an ordered list of recipe ids in localStorage. */

const PLAN_KEY = 'chris-cooks:plan'

export function getPlan(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(PLAN_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function setPlan(ids: string[]): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(ids))
  } catch {
    // Storage full/unavailable — the plan just won't persist.
  }
  // Let live UI (nav badge) refresh without a navigation.
  window.dispatchEvent(new Event('planchange'))
}

export function inPlan(id: string): boolean {
  return getPlan().includes(id)
}

/** Add/remove a recipe from the plan; returns whether it is now in the plan. */
export function togglePlan(id: string): boolean {
  const plan = getPlan()
  const has = plan.includes(id)
  setPlan(has ? plan.filter((x) => x !== id) : [...plan, id])
  return !has
}
