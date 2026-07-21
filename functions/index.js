/**
 * Firebase Cloud Functions backing Chris Cooks — the Firebase equivalent of
 * the Cloudflare Workers in /worker (same job, different host, since this
 * project only has a Firebase account). Two independent HTTPS functions:
 *
 *   - syncApi: recipe/meal-plan cross-browser sync, backed by Firestore.
 *   - aiCleanup: the optional AI import-cleanup/video/photo/nutrition proxy.
 *
 * Both speak the exact same request/response wire format as their Cloudflare
 * counterparts, so nothing on the client (src/lib/sync.ts, src/lib/ai.ts,
 * src/lib/import.ts) needs to change — only the deployed URL differs
 * (VITE_SYNC_URL / VITE_AI_CLEANUP_URL).
 *
 * Deploy: see functions/README.md.
 */

const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret, defineString } = require('firebase-functions/params')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const PASSCODE = defineSecret('PASSCODE')
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const ALLOWED_ORIGIN = defineString('ALLOWED_ORIGIN', { default: '*' })

function withCors(req, res, methods) {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN.value())
  res.set('Access-Control-Allow-Methods', `${methods}, OPTIONS`)
  res.set('Access-Control-Allow-Headers', 'content-type, x-passcode')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// syncApi — recipe/meal-plan sync (Firestore instead of Cloudflare KV)
// ---------------------------------------------------------------------------

const RECIPES_COLLECTION = 'syncRecipes'
const META_DOC = 'syncMeta/main'

function emptyMeta() {
  return { deleted: [], plan: [], planUpdatedAt: 0 }
}

/**
 * Last-write-wins merge: each recipe keeps whichever copy has the newer
 * `updatedAt`; a deletion only sticks if it's newer than the recipe's last
 * edit. The plan is replaced wholesale by whichever side has the newer
 * `planUpdatedAt`. Identical logic to worker/sync.js's mergeDoc — kept in
 * sync deliberately, since it's the part most important to get right.
 */
function mergeDoc(existingRecipesById, existingMeta, incoming) {
  const deleted = new Map((existingMeta.deleted || []).map((d) => [d.id, d.deletedAt]))
  for (const d of incoming.deleted || []) {
    if (!deleted.has(d.id) || d.deletedAt > deleted.get(d.id)) deleted.set(d.id, d.deletedAt)
  }

  const recipes = new Map(existingRecipesById)
  for (const r of incoming.recipes) {
    const cur = recipes.get(r.id)
    if (!cur || (r.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) recipes.set(r.id, r)
  }
  for (const [id, deletedAt] of deleted) {
    const r = recipes.get(id)
    if (r && deletedAt >= (r.updatedAt ?? 0)) recipes.delete(id)
  }

  const incomingPlanAt = typeof incoming.planUpdatedAt === 'number' ? incoming.planUpdatedAt : 0
  const existingPlanAt = existingMeta.planUpdatedAt ?? 0
  const planNewer = incomingPlanAt >= existingPlanAt

  return {
    recipes: [...recipes.values()],
    deleted: [...deleted].map(([id, deletedAt]) => ({ id, deletedAt })),
    plan: planNewer ? incoming.plan : existingMeta.plan || [],
    planUpdatedAt: Math.max(incomingPlanAt, existingPlanAt),
    savedAt: Date.now(),
  }
}

async function readAllRecipes() {
  const snap = await db.collection(RECIPES_COLLECTION).get()
  const byId = new Map()
  snap.forEach((doc) => byId.set(doc.id, doc.data()))
  return byId
}

async function readMeta() {
  const doc = await db.doc(META_DOC).get()
  return doc.exists ? doc.data() : emptyMeta()
}

/** Firestore batches cap at 500 writes; chunk defensively as the collection grows. */
async function writeMergedRecipes(existingIds, mergedRecipes) {
  const mergedIds = new Set(mergedRecipes.map((r) => r.id))
  const toDelete = [...existingIds].filter((id) => !mergedIds.has(id))
  const ops = [
    ...mergedRecipes.map((r) => ({ type: 'set', id: r.id, data: r })),
    ...toDelete.map((id) => ({ type: 'delete', id })),
  ]
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 450)) {
      const ref = db.collection(RECIPES_COLLECTION).doc(op.id)
      if (op.type === 'set') batch.set(ref, op.data)
      else batch.delete(ref)
    }
    await batch.commit()
  }
}

const syncApi = onRequest({ secrets: [PASSCODE], cors: false }, async (req, res) => {
  if (withCors(req, res, 'GET, PUT')) return
  if (!req.get('x-passcode') || req.get('x-passcode') !== PASSCODE.value()) {
    res.status(401).json({ error: 'Wrong passcode' })
    return
  }

  if (req.method === 'GET') {
    const [recipesById, meta] = await Promise.all([readAllRecipes(), readMeta()])
    res.status(200).json({
      recipes: [...recipesById.values()],
      deleted: meta.deleted || [],
      plan: meta.plan || [],
      planUpdatedAt: meta.planUpdatedAt || 0,
    })
    return
  }

  if (req.method === 'PUT') {
    const body = req.body || {}
    if (!Array.isArray(body.recipes) || !Array.isArray(body.plan)) {
      res.status(400).json({ error: 'Malformed payload' })
      return
    }
    const [recipesById, meta] = await Promise.all([readAllRecipes(), readMeta()])
    const merged = mergeDoc(recipesById, meta, body)
    await Promise.all([
      writeMergedRecipes(recipesById.keys(), merged.recipes),
      db.doc(META_DOC).set({
        deleted: merged.deleted,
        plan: merged.plan,
        planUpdatedAt: merged.planUpdatedAt,
        savedAt: merged.savedAt,
      }),
    ])
    res.status(200).json(merged)
    return
  }

  res.status(405).json({ error: 'GET or PUT only' })
})

// ---------------------------------------------------------------------------
// aiCleanup — recipe import cleanup / healthier rewrite / video / photo /
// nutrition estimate, ported from worker/ai-cleanup.js. Logic is identical;
// only the request/response plumbing (Express req/res vs. Fetch Request/
// Response) and base64 encoding (Node Buffer vs. manual btoa chunking) differ.
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5' // fast and inexpensive; swap to 'claude-opus-4-8' for sharper video/photo import quality
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM = `You clean up recipe text that was scraped from a web page. Fix obvious OCR/formatting errors, spelling mistakes, stray HTML entities, and odd spacing. Split any ingredient line that actually contains multiple ingredients into separate lines. Do NOT invent, add, remove, or reword the actual cooking content — only correct how it is written. Preserve quantities and units exactly. Return the same recipe, cleaned.`

const PRIORITY_LABEL = {
  calories: 'calories',
  satfat: 'saturated fat',
  sugar: 'sugar',
  sodium: 'sodium',
}

function healthierSystem(priority) {
  const target = PRIORITY_LABEL[priority] || 'calories'
  return `You are a recipe developer. Create a healthier version of the given recipe that reduces ${target} while keeping the dish recognisable and tasty. Make sensible ingredient swaps and method tweaks (e.g. leaner cuts, less oil/sugar/salt, lower-fat dairy, more vegetables) but keep it the same dish — do not turn it into something else. Keep the servings the same. Return the full updated ingredient list (one item per line, with quantities) and the full updated method steps. In "changes", list ONLY the swaps that meaningfully alter taste or texture, each as a short plain-English note the cook can weigh up (e.g. "Greek yogurt instead of cream — slightly tangier, less rich"). If nothing meaningfully changes taste or texture, return an empty changes list.`
}

const HEALTHIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ingredients', 'steps', 'changes'],
  properties: {
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    changes: { type: 'array', items: { type: 'string' } },
  },
}

const CLEANUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'ingredients', 'steps'],
  properties: {
    title: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  },
}

const NUTRITION_SYSTEM = `You estimate per-serving nutrition for a home recipe from its ingredient list and servings count, using standard food-composition data (USDA / McCance & Widdowson). Compute totals across all ingredients, divide by servings, and round sensibly. Be conservative and realistic; cooked weights and reasonable assumptions for unspecified sizes are fine. If most ingredient lines have no usable quantities, return null for every field instead of guessing.`

const NUTRITION_FIELDS = ['calories', 'proteinG', 'carbsG', 'fatG', 'satFatG', 'sugarG', 'fiberG', 'sodiumMg']
const NUTRITION_PROPERTIES = {
  calories: { type: ['number', 'null'] },
  proteinG: { type: ['number', 'null'] },
  carbsG: { type: ['number', 'null'] },
  fatG: { type: ['number', 'null'] },
  satFatG: { type: ['number', 'null'] },
  sugarG: { type: ['number', 'null'] },
  fiberG: { type: ['number', 'null'] },
  sodiumMg: { type: ['number', 'null'] },
}

const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: NUTRITION_FIELDS,
  properties: NUTRITION_PROPERTIES,
}

const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Side', 'Sauce', 'Soup', 'Salad', 'Dessert', 'Snack']

const VIDEO_SYSTEM = `You extract a structured recipe from a social cooking video's public data: its caption text and its cover image. Only use ingredients, quantities and steps that are actually stated in the caption or clearly legible as on-screen text in the cover image — never invent or infer a method, ingredient, or quantity that isn't actually shown there; leaving something out is better than guessing. The dish name is often only shown on-screen, so use the cover image to identify it — "title" must be a short, appetising dish name in Title Case (no emojis, no the word "recipe", no creator handles or stats, and no guessed spelling — if on-screen text is too stylised or blurry to read with confidence, use a simple descriptive name instead of a misread one). If the caption lists ingredients, preserve their exact quantities and wording. If neither the caption nor the image gives you a real method, return an empty steps array rather than writing one from guesswork. servings: as stated, else 1 — do not guess a number. category: exactly one of ${CATEGORIES.join(', ')} — use Sauce/Soup/Salad/Side when that is genuinely what the dish is, not just an ingredient in a larger meal. cuisine: a single lowercase word (e.g. "italian") or null. prep/cook: human-friendly durations like "10 min" ONLY if clearly stated, else null. Write every ingredient and step in normal sentence case, never in all caps, and never include a section label (e.g. "SAUCE", "FOR THE TOPPING") as its own ingredient or step entry — fold it into the surrounding text or drop it. nutrition: many cooking videos state per-serving macros (e.g. "450 cal, 40g protein"), often near the end of the caption — if any figures are explicitly stated there, extract exactly those numbers into the matching fields; never calculate or estimate nutrition yourself, and leave any field not explicitly stated as null.`

const VIDEO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'ingredients', 'steps', 'servings', 'category', 'cuisine', 'prep', 'cook', 'nutrition'],
  properties: {
    title: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    servings: { type: 'integer' },
    category: { type: 'string', enum: CATEGORIES },
    cuisine: { type: ['string', 'null'] },
    prep: { type: ['string', 'null'] },
    cook: { type: ['string', 'null'] },
    nutrition: NUTRITION_SCHEMA,
  },
}

const IMAGE_SYSTEM = `You extract a structured recipe from a photo — this could be a cookbook page, a handwritten recipe card, a printed recipe, or a screenshot of a recipe website or app. Read the image carefully and transcribe the recipe faithfully; do not invent quantities or steps that aren't shown. "title" must be a short, clean dish name in Title Case (no emojis, no the word "recipe"). Preserve ingredient quantities and units exactly as written. If the method is numbered in the photo, keep it as separate steps in the same order. servings: as stated, or your best estimate (integer, minimum 1). category: exactly one of ${CATEGORIES.join(', ')}. cuisine: a single lowercase word (e.g. "italian") or null. prep/cook: human-friendly durations like "10 min" ONLY if stated, else null. Write every ingredient and step in normal sentence case, never in all caps, and never include a section label (e.g. "SAUCE", "FOR THE TOPPING") as its own ingredient or step entry — fold it into the surrounding text or drop it. nutrition: if a nutrition panel or per-serving macro breakdown (e.g. "450 cal, 40g protein") is visible in the photo, extract exactly those numbers into the matching fields; never calculate or estimate nutrition yourself, and leave any field not explicitly shown as null. If the image does not contain a readable recipe at all, return every field as an empty string/array (title: "", ingredients: [], steps: []) rather than guessing.`

const IMAGE_SCHEMA = VIDEO_SCHEMA

const aiCleanup = onRequest({ secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 120 }, async (req, res) => {
  if (withCors(req, res, 'POST')) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const apiKey = ANTHROPIC_API_KEY.value()
  if (!apiKey) {
    res.status(500).json({ error: 'Function missing ANTHROPIC_API_KEY secret' })
    return
  }

  const body = req.body || {}

  if (body.mode === 'video') return handleVideoImport(body, apiKey, res)
  if (body.mode === 'estimate-nutrition') return handleNutritionEstimate(body, apiKey, res)
  if (body.mode === 'image-import') return handleImageImport(body, apiKey, res)

  const healthier = body.mode === 'healthier'
  const payload = {
    model: MODEL,
    max_tokens: 4096,
    system: healthier ? healthierSystem(body.priority) : SYSTEM,
    output_config: {
      format: { type: 'json_schema', schema: healthier ? HEALTHIER_SCHEMA : CLEANUP_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          title: body.title ?? '',
          servings: body.servings ?? null,
          nutrition: body.nutrition ?? null,
          ingredients: Array.isArray(body.ingredients) ? body.ingredients : [],
          steps: Array.isArray(body.steps) ? body.steps : [],
        }),
      },
    ],
  }

  let apiRes
  try {
    apiRes = await callAnthropic(payload, apiKey)
  } catch (e) {
    res.status(502).json({ error: `Upstream fetch failed: ${e}` })
    return
  }
  if (!apiRes.ok) {
    res.status(502).json({ error: `Anthropic API ${apiRes.status}` })
    return
  }

  const data = await apiRes.json()
  const text = textFromContent(data.content)
  let cleaned
  try {
    cleaned = JSON.parse(text)
  } catch {
    res.status(502).json({ error: 'Could not parse model output' })
    return
  }
  res.status(200).json(cleaned)
})

async function callAnthropic(payload, apiKey) {
  return fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })
}

function textFromContent(content) {
  return (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

async function handleNutritionEstimate(body, apiKey, res) {
  const ingredients = Array.isArray(body.ingredients) ? body.ingredients.map(String).filter(Boolean) : []
  if (ingredients.length === 0) {
    res.status(400).json({ error: 'No ingredients to estimate from' })
    return
  }

  let apiRes
  try {
    apiRes = await callAnthropic(
      {
        model: MODEL,
        max_tokens: 1024,
        system: NUTRITION_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: NUTRITION_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ title: body.title ?? '', servings: body.servings ?? 1, ingredients }),
          },
        ],
      },
      apiKey,
    )
  } catch (e) {
    res.status(502).json({ error: `Upstream fetch failed: ${e}` })
    return
  }
  if (!apiRes.ok) {
    res.status(502).json({ error: `Anthropic API ${apiRes.status}` })
    return
  }

  const data = await apiRes.json()
  const text = textFromContent(data.content)
  let out
  try {
    out = JSON.parse(text)
  } catch {
    res.status(502).json({ error: 'Could not parse model output' })
    return
  }
  res.status(200).json(out)
}

/**
 * TikTok's og:description meta tag wraps the caption as `N Likes, N
 * Comments. TikTok video from X (@handle): "..."` and truncates long
 * captions — which cuts off exactly the kind of detail (serving count,
 * nutrition breakdown) that tends to sit at the end. The public oEmbed
 * endpoint's `title` field carries the same caption without that wrapper
 * and isn't truncated the same way, so prefer whichever text is longer.
 */
async function fetchOembedCaption(url) {
  try {
    const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    if (!r.ok) return ''
    const j = await r.json()
    return typeof j.title === 'string' ? j.title : ''
  } catch {
    return ''
  }
}

async function handleVideoImport(body, apiKey, res) {
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!/^https:\/\/([\w-]+\.)*(instagram\.com|instagr\.am|tiktok\.com)\//i.test(url)) {
    res.status(400).json({ error: 'Only TikTok and Instagram URLs are supported' })
    return
  }

  let html = ''
  try {
    const page = await fetch(url, { headers: { 'user-agent': 'facebookexternalhit/1.1' }, redirect: 'follow' })
    html = await page.text()
  } catch {
    res.status(502).json({ error: 'Could not reach that page' })
    return
  }

  const meta = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i'))
    return m ? decodeEntities(m[1]) : ''
  }
  let caption = meta('og:description')
  const pageTitle = meta('og:title')
  const imageUrl = meta('og:image')
  if (/tiktok\.com/i.test(url)) {
    const oembedCaption = await fetchOembedCaption(url)
    if (oembedCaption.length > caption.length) caption = oembedCaption
  }
  if (!caption && !imageUrl) {
    res.status(502).json({ error: 'Could not read a caption or image from that page' })
    return
  }

  let imageBlock = null
  let imageDataUrl = null
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl)
      const type = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0]
      if (imgRes.ok && type.startsWith('image/')) {
        const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')
        imageBlock = { type: 'image', source: { type: 'base64', media_type: type, data: b64 } }
        imageDataUrl = `data:${type};base64,${b64}`
      }
    } catch {
      // Caption-only extraction still works.
    }
  }

  const content = []
  if (imageBlock) content.push(imageBlock)
  content.push({ type: 'text', text: JSON.stringify({ caption, page_title: pageTitle }) })

  let apiRes
  try {
    apiRes = await callAnthropic(
      {
        model: MODEL,
        max_tokens: 4096,
        system: VIDEO_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: VIDEO_SCHEMA } },
        messages: [{ role: 'user', content }],
      },
      apiKey,
    )
  } catch (e) {
    res.status(502).json({ error: `Upstream fetch failed: ${e}` })
    return
  }
  if (!apiRes.ok) {
    res.status(502).json({ error: `Anthropic API ${apiRes.status}` })
    return
  }

  const data = await apiRes.json()
  const text = textFromContent(data.content)
  let recipe
  try {
    recipe = JSON.parse(text)
  } catch {
    res.status(502).json({ error: 'Could not parse model output' })
    return
  }
  recipe.image = imageDataUrl
  res.status(200).json(recipe)
}

async function handleImageImport(body, apiKey, res) {
  const data = typeof body.image === 'string' ? body.image : ''
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : 'image/jpeg'
  if (!data) {
    res.status(400).json({ error: 'No image provided' })
    return
  }

  let apiRes
  try {
    apiRes = await callAnthropic(
      {
        model: MODEL,
        max_tokens: 4096,
        system: IMAGE_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: IMAGE_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: 'Extract the recipe from this photo.' },
            ],
          },
        ],
      },
      apiKey,
    )
  } catch (e) {
    res.status(502).json({ error: `Upstream fetch failed: ${e}` })
    return
  }
  if (!apiRes.ok) {
    res.status(502).json({ error: `Anthropic API ${apiRes.status}` })
    return
  }

  const resData = await apiRes.json()
  const text = textFromContent(resData.content)
  let recipe
  try {
    recipe = JSON.parse(text)
  } catch {
    res.status(502).json({ error: 'Could not parse model output' })
    return
  }
  if (!recipe.title || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    res.status(422).json({ error: "Couldn't read a recipe from that photo" })
    return
  }
  res.status(200).json(recipe)
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

exports.syncApi = syncApi
exports.aiCleanup = aiCleanup
