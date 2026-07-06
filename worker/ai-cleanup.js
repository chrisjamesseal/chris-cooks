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

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}
