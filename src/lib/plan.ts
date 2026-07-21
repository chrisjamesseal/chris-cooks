/** "This week" meal plan: an ordered list of recipe ids in localStorage. */

import { scheduleSync } from './sync'

const PLAN_KEY = 'chris-cooks:plan'
const PLAN_UPDATED_KEY = 'chris-cooks:planUpdatedAt'

export function getPlan(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(PLAN_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Timestamp of the last local plan change — lets sync tell whose copy of the plan is newer. */
export function getPlanUpdatedAt(): number {
  const n = Number(localStorage.getItem(PLAN_UPDATED_KEY))
  return Number.isFinite(n) ? n : 0
}

export function setPlan(ids: string[]): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(ids))
    localStorage.setItem(PLAN_UPDATED_KEY, String(Date.now()))
  } catch {
    // Storage full/unavailable — the plan just won't persist.
  }
  // Let live UI (nav badge) refresh without a navigation.
  window.dispatchEvent(new Event('planchange'))
  scheduleSync()
}

/** Adopts the server's plan during a sync merge, without re-triggering a push. */
export function setPlanFromSync(ids: string[], updatedAt: number): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(ids))
    localStorage.setItem(PLAN_UPDATED_KEY, String(updatedAt))
  } catch {
    // Storage full/unavailable — the plan just won't persist.
  }
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
