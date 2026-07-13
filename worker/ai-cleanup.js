/**
 * Cloudflare Worker: AI cleanup proxy for recipe imports.
 *
 * The Chris Cooks app is a static site, so it can't hold an API key. This
 * Worker keeps the ANTHROPIC_API_KEY server-side and exposes a single POST
 * endpoint that tidies scraped recipe text (fix odd formatting/typos, split
 * run-on ingredient lines) without changing the actual content.
 *
 * Deploy: see worker/README.md. Then set VITE_AI_CLEANUP_URL to this Worker's
 * URL when building the app to activate cleanup on URL imports.
 */

const MODEL = 'claude-opus-4-8' // swap to 'claude-haiku-4-5' in your Worker if you'd prefer cheaper/faster cleanup
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

const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['calories', 'proteinG', 'carbsG', 'fatG', 'satFatG', 'sugarG', 'fiberG', 'sodiumMg'],
  properties: {
    calories: { type: ['number', 'null'] },
    proteinG: { type: ['number', 'null'] },
    carbsG: { type: ['number', 'null'] },
    fatG: { type: ['number', 'null'] },
    satFatG: { type: ['number', 'null'] },
    sugarG: { type: ['number', 'null'] },
    fiberG: { type: ['number', 'null'] },
    sodiumMg: { type: ['number', 'null'] },
  },
}

const VIDEO_SYSTEM = `You extract a structured recipe from a social cooking video's public data: its caption text and its cover image. The dish name is often only shown on-screen in the video, so use the cover image to identify the dish and name it — "title" must be a short, appetising dish name (no emojis, no the word "recipe", no creator handles or stats). If the caption lists ingredients, preserve their exact quantities and wording; do not invent quantities. If the caption has no method, write a concise, sensible step-by-step method for this exact dish based on the ingredients and what the image shows. servings: as stated, or your best estimate (integer, minimum 1). category: exactly one of Breakfast, Lunch, Dinner, Dessert, Snack. cuisine: a single lowercase word (e.g. "italian") or null. prep/cook: human-friendly durations like "10 min" ONLY if stated or safely inferable, else null.`

const VIDEO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'ingredients', 'steps', 'servings', 'category', 'cuisine', 'prep', 'cook'],
  properties: {
    title: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    servings: { type: 'integer' },
    category: { type: 'string', enum: ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack'] },
    cuisine: { type: ['string', 'null'] },
    prep: { type: ['string', 'null'] },
    cook: { type: ['string', 'null'] },
  },
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*'
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, cors)
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Worker missing ANTHROPIC_API_KEY' }, 500, cors)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors)
    }

    if (body.mode === 'video') {
      return handleVideoImport(body, env, cors)
    }

    if (body.mode === 'estimate-nutrition') {
      return handleNutritionEstimate(body, env, cors)
    }

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

    let res
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      return json({ error: `Upstream fetch failed: ${e}` }, 502, cors)
    }

    if (!res.ok) {
      return json({ error: `Anthropic API ${res.status}` }, 502, cors)
    }

    const data = await res.json()
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    let cleaned
    try {
      cleaned = JSON.parse(text)
    } catch {
      return json({ error: 'Could not parse model output' }, 502, cors)
    }

    return json(cleaned, 200, cors)
  },
}

/**
 * mode: 'video' — deep import for TikTok/Instagram links. The Worker fetches
 * the video page itself (no browser CORS limits here), pulls the caption and
 * cover image out of the og: meta tags, then asks Claude to read both and
 * return a complete structured recipe. The cover image is echoed back as a
 * data URL so the app can store it locally before the platform's signed CDN
 * link expires.
 */
/**
 * mode: 'estimate-nutrition' — estimate per-serving nutrition from the
 * ingredient list when the source recipe doesn't publish any. The response is
 * clearly flagged as an estimate by the app. Fields the model can't judge are
 * returned null and dropped client-side.
 */
async function handleNutritionEstimate(body, env, cors) {
  const ingredients = Array.isArray(body.ingredients) ? body.ingredients.map(String).filter(Boolean) : []
  if (ingredients.length === 0) {
    return json({ error: 'No ingredients to estimate from' }, 400, cors)
  }

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: NUTRITION_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: NUTRITION_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              title: body.title ?? '',
              servings: body.servings ?? 1,
              ingredients,
            }),
          },
        ],
      }),
    })
  } catch (e) {
    return json({ error: `Upstream fetch failed: ${e}` }, 502, cors)
  }
  if (!res.ok) return json({ error: `Anthropic API ${res.status}` }, 502, cors)

  const data = await res.json()
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  let out
  try {
    out = JSON.parse(text)
  } catch {
    return json({ error: 'Could not parse model output' }, 502, cors)
  }
  return json(out, 200, cors)
}

async function handleVideoImport(body, env, cors) {
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!/^https:\/\/([\w-]+\.)*(instagram\.com|instagr\.am|tiktok\.com)\//i.test(url)) {
    return json({ error: 'Only TikTok and Instagram URLs are supported' }, 400, cors)
  }

  let html = ''
  try {
    // A crawler UA gets the og: meta tags without a login wall.
    const page = await fetch(url, {
      headers: { 'user-agent': 'facebookexternalhit/1.1' },
      redirect: 'follow',
    })
    html = await page.text()
  } catch {
    return json({ error: 'Could not reach that page' }, 502, cors)
  }

  const meta = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i'))
    return m ? decodeEntities(m[1]) : ''
  }
  const caption = meta('og:description')
  const pageTitle = meta('og:title')
  const imageUrl = meta('og:image')
  if (!caption && !imageUrl) {
    return json({ error: 'Could not read a caption or image from that page' }, 502, cors)
  }

  let imageBlock = null
  let imageDataUrl = null
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl)
      const type = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0]
      if (imgRes.ok && type.startsWith('image/')) {
        const b64 = base64(await imgRes.arrayBuffer())
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

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: VIDEO_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: VIDEO_SCHEMA } },
        messages: [{ role: 'user', content }],
      }),
    })
  } catch (e) {
    return json({ error: `Upstream fetch failed: ${e}` }, 502, cors)
  }
  if (!res.ok) return json({ error: `Anthropic API ${res.status}` }, 502, cors)

  const data = await res.json()
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  let recipe
  try {
    recipe = JSON.parse(text)
  } catch {
    return json({ error: 'Could not parse model output' }, 502, cors)
  }
  recipe.image = imageDataUrl
  return json(recipe, 200, cors)
}

function base64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
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

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}
