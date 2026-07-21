import { getAllRecipes, putRecipesLocal } from '../db'
import { getPlan, getPlanUpdatedAt, setPlanFromSync } from './plan'
import type { Recipe } from '../types'

/**
 * Optional cloud sync (see worker/sync.js): pulls/pushes the whole recipe
 * collection and meal plan through a small Worker so a new or cleared
 * browser never starts empty. Entirely inert when VITE_SYNC_URL isn't set —
 * the app works exactly as before, purely on local IndexedDB.
 */

const PASSCODE_KEY = 'chris-cooks:syncPasscode'
const DELETED_KEY = 'chris-cooks:syncDeleted'

type Tombstone = { id: string; deletedAt: number }
type SyncDoc = { recipes: Recipe[]; deleted: Tombstone[]; plan: string[]; planUpdatedAt: number }

export function syncEnabled(): boolean {
  return !!import.meta.env.VITE_SYNC_URL
}

function getPasscode(): string | null {
  try {
    return localStorage.getItem(PASSCODE_KEY)
  } catch {
    return null
  }
}

/** Asks once, the first time sync actually needs it, then remembers it. */
function ensurePasscode(): string | null {
  const cached = getPasscode()
  if (cached) return cached
  const entered = window.prompt('Enter your Chris Cooks sync passcode (set when you deployed the sync Worker):')
  if (!entered) return null
  try {
    localStorage.setItem(PASSCODE_KEY, entered)
  } catch {
    // Private browsing — sync will just re-prompt next time.
  }
  return entered
}

function getLocalDeletions(): Tombstone[] {
  try {
    const list = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Records a deletion locally so it can be told apart from "never existed" once synced. */
export function recordDeletion(id: string): void {
  try {
    const list = getLocalDeletions().filter((d) => d.id !== id)
    list.push({ id, deletedAt: Date.now() })
    localStorage.setItem(DELETED_KEY, JSON.stringify(list))
  } catch {
    // Best-effort — worst case a stale delete doesn't win a future merge.
  }
}

async function request(method: 'GET' | 'PUT', body?: unknown): Promise<Response | null> {
  const url = import.meta.env.VITE_SYNC_URL as string | undefined
  if (!url) return null
  const passcode = ensurePasscode()
  if (!passcode) return null
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', 'x-passcode': passcode },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) {
      // Wrong/stale passcode — drop it so the next attempt re-prompts.
      try {
        localStorage.removeItem(PASSCODE_KEY)
      } catch {
        // ignore
      }
    }
    return res
  } catch {
    return null // offline or the Worker's unreachable — sync just sits out this round
  }
}

/** Adopts whatever the server knows that's newer than what's stored locally. */
async function adoptServerDoc(doc: SyncDoc): Promise<void> {
  const localRecipes = await getAllRecipes()
  const localById = new Map(localRecipes.map((r) => [r.id, r]))
  const toAdopt: Recipe[] = []
  for (const server of doc.recipes) {
    const local = localById.get(server.id)
    if (!local || (server.updatedAt ?? 0) > (local.updatedAt ?? 0)) toAdopt.push(server)
  }
  // A server-side deletion newer than the local copy's last edit removes it here too.
  const toDelete = new Set<string>()
  for (const d of doc.deleted || []) {
    const local = localById.get(d.id)
    if (local && d.deletedAt >= (local.updatedAt ?? 0)) toDelete.add(d.id)
  }
  if (toAdopt.length > 0 || toDelete.size > 0) {
    await putRecipesLocal(toAdopt, toDelete)
  }
  if (doc.planUpdatedAt > getPlanUpdatedAt()) {
    setPlanFromSync(Array.isArray(doc.plan) ? doc.plan : [], doc.planUpdatedAt)
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced push: batches rapid edits into one upload ~2s after the last change. */
export function scheduleSync(): void {
  if (!syncEnabled()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushNow().catch(() => {})
  }, 2000)
}

/** Uploads the full local collection now; adopts anything the server had that was newer. */
export async function pushNow(): Promise<boolean> {
  if (!syncEnabled()) return false
  const recipes = await getAllRecipes()
  const payload = {
    recipes,
    deleted: getLocalDeletions(),
    plan: getPlan(),
    planUpdatedAt: getPlanUpdatedAt(),
  }
  const res = await request('PUT', payload)
  if (!res || !res.ok) return false
  try {
    await adoptServerDoc((await res.json()) as SyncDoc)
  } catch {
    // The push itself still succeeded even if we couldn't read the merged reply.
  }
  return true
}

/**
 * Runs once at startup: pulls the server's copy, merges anything newer into
 * local storage, then pushes back so both sides end up in agreement (this
 * covers local edits made while offline that the server didn't have yet).
 * Silently does nothing if sync isn't configured, is unreachable, or the
 * passcode hasn't been entered.
 */
export async function pullAndMerge(): Promise<void> {
  if (!syncEnabled()) return
  const res = await request('GET')
  if (!res || !res.ok) return
  let doc: SyncDoc
  try {
    doc = (await res.json()) as SyncDoc
  } catch {
    return
  }
  await adoptServerDoc(doc)
  await pushNow()
}
