/**
 * Cloudflare Worker: recipe/meal-plan sync, backed by a KV namespace.
 *
 * Chris Cooks stores everything in the browser's IndexedDB by default, which
 * means a new browser (or a cleared one) starts empty. This Worker gives the
 * whole collection one home in the cloud: the app pulls it on load and pushes
 * changes after every edit, so opening the app anywhere shows the same
 * recipes, favourites, notes and meal plan.
 *
 * Single document, single user: everything lives under one KV key. Writes are
 * merged (not blindly overwritten) using each recipe's `updatedAt` and a small
 * tombstone list for deletions, so two browsers editing between syncs don't
 * silently erase each other's changes or resurrect a deleted recipe.
 *
 * Deploy: see worker/README.md. Then set VITE_SYNC_URL to this Worker's URL
 * when building the app to activate sync.
 */

const KV_KEY = 'data'

function emptyDoc() {
  return { recipes: [], deleted: [], plan: [], planUpdatedAt: 0 }
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*'
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-passcode',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (!env.SYNC_KV) return json({ error: 'Worker missing SYNC_KV binding' }, 500, cors)
    if (!env.PASSCODE) return json({ error: 'Worker missing PASSCODE secret' }, 500, cors)
    if (request.headers.get('x-passcode') !== env.PASSCODE) {
      return json({ error: 'Wrong passcode' }, 401, cors)
    }

    if (request.method === 'GET') {
      const raw = await env.SYNC_KV.get(KV_KEY)
      return new Response(raw || JSON.stringify(emptyDoc()), {
        status: 200,
        headers: { 'content-type': 'application/json', ...cors },
      })
    }

    if (request.method === 'PUT') {
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Invalid JSON' }, 400, cors)
      }
      if (!Array.isArray(body.recipes) || !Array.isArray(body.plan)) {
        return json({ error: 'Malformed payload' }, 400, cors)
      }

      const raw = await env.SYNC_KV.get(KV_KEY)
      const existing = raw ? JSON.parse(raw) : emptyDoc()
      const merged = mergeDoc(existing, body)
      await env.SYNC_KV.put(KV_KEY, JSON.stringify(merged))
      return json(merged, 200, cors)
    }

    return json({ error: 'GET or PUT only' }, 405, cors)
  },
}

/**
 * Last-write-wins merge: each recipe keeps whichever copy has the newer
 * `updatedAt`; a deletion only sticks if it's newer than the recipe's last
 * edit (so an edit made elsewhere after the delete un-deletes it). The plan
 * (a single list) is replaced wholesale by whichever side has the newer
 * `planUpdatedAt`, since it has no per-item timestamps of its own.
 */
function mergeDoc(existing, incoming) {
  const deleted = new Map((existing.deleted || []).map((d) => [d.id, d.deletedAt]))
  for (const d of incoming.deleted || []) {
    if (!deleted.has(d.id) || d.deletedAt > deleted.get(d.id)) deleted.set(d.id, d.deletedAt)
  }

  const recipes = new Map((existing.recipes || []).map((r) => [r.id, r]))
  for (const r of incoming.recipes) {
    const cur = recipes.get(r.id)
    if (!cur || (r.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) recipes.set(r.id, r)
  }
  for (const [id, deletedAt] of deleted) {
    const r = recipes.get(id)
    if (r && deletedAt >= (r.updatedAt ?? 0)) recipes.delete(id)
  }

  const incomingPlanAt = typeof incoming.planUpdatedAt === 'number' ? incoming.planUpdatedAt : 0
  const existingPlanAt = existing.planUpdatedAt ?? 0
  const planNewer = incomingPlanAt >= existingPlanAt

  return {
    recipes: [...recipes.values()],
    deleted: [...deleted].map(([id, deletedAt]) => ({ id, deletedAt })),
    plan: planNewer ? incoming.plan : existing.plan || [],
    planUpdatedAt: Math.max(incomingPlanAt, existingPlanAt),
    savedAt: Date.now(),
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } })
}
