This app is a static site, so the two things it can't do in the browser alone
(hold an API key, give every browser the same recipe collection) each get a
tiny optional Cloudflare Worker. Both are independent — deploy either, both,
or neither.

# AI import cleanup Worker (optional)

The app can send scraped recipe text through Claude to fix formatting/typos and
split run-on ingredient lines when you import from a URL. Because Chris Cooks is
a static site, the API key can't live in the browser — this tiny Cloudflare
Worker holds it server-side. It's **optional**: without it, URL imports work
exactly as before, just without the AI polish.

The Worker handles six modes:

- **cleanup** (default) — tidies scraped recipe text on URL imports.
- **healthier** — rewrites a recipe to be lighter; powers the "Rewrite this
  recipe to be healthier" button. (The rule-based tips work without the Worker.)
- **video** — deep TikTok/Instagram import: the Worker fetches the video page
  server-side, reads the caption *and the video's cover image* with Claude, and
  returns a complete recipe — proper dish name, ingredients, method, servings,
  category and photo. Without the Worker, video imports fall back to parsing
  the caption text only.
- **image-import** — powers "Upload a Photo" on the Add Recipe screen: reads a
  photo of a recipe (cookbook page, handwritten card, screenshot) with Claude
  vision and returns the structured recipe. Without the Worker, this option
  isn't available.
- **estimate-nutrition** — estimates per-serving nutrition from a recipe's
  ingredient list when the source doesn't publish any; used by the "Estimate
  Nutrition" buttons on the Nutrition tab and on individual recipes. Estimates
  are always clearly marked (≈) and never presented as source data.

If you deployed the Worker before these modes existed, redeploy with the same
command below to pick up the new code.

## Deploy

1. Install Wrangler and log in:
   ```sh
   npm i -g wrangler
   wrangler login
   ```
2. From this `worker/` directory, create the Worker (first deploy will prompt to
   create it):
   ```sh
   wrangler deploy ai-cleanup.js --name chris-cooks-ai-cleanup --compatibility-date 2024-11-01
   ```
3. Set your Anthropic API key as a secret:
   ```sh
   wrangler secret put ANTHROPIC_API_KEY --name chris-cooks-ai-cleanup
   ```
4. (Recommended) Lock it to your site's origin so only your app can call it:
   ```sh
   wrangler secret put ALLOWED_ORIGIN --name chris-cooks-ai-cleanup
   # value: https://chrisjamesseal.github.io
   ```

Wrangler prints the Worker URL, e.g. `https://chris-cooks-ai-cleanup.<you>.workers.dev`.

## Activate in the app

Set the Worker URL as a build variable so Vite bakes it in:

- **Local:** create `.env.local` with `VITE_AI_CLEANUP_URL=https://…workers.dev`
- **GitHub Pages:** in the repo, add a variable `VITE_AI_CLEANUP_URL` (Settings →
  Secrets and variables → Actions → Variables) and pass it to the build step in
  `.github/workflows/deploy.yml`:
  ```yaml
  - run: npm run build
    env:
      VITE_AI_CLEANUP_URL: ${{ vars.VITE_AI_CLEANUP_URL }}
  ```

When `VITE_AI_CLEANUP_URL` is unset, the app skips cleanup entirely — no errors,
no behavior change.

## Notes

- The Worker uses `claude-opus-4-8`. To reduce cost/latency, change `MODEL` in
  `ai-cleanup.js` to `claude-haiku-4-5` — plenty capable for text cleanup.
- Cleanup is best-effort: if the Worker is slow, errors, or returns something
  unexpected, the import falls back to the raw scraped text.

---

# Sync Worker (optional)

Chris Cooks normally stores everything in the browser (IndexedDB), so a new
browser, a cleared one, or your phone vs. your laptop each start with their
own separate copy. This Worker gives the whole collection — recipes,
favourites, notes, and the meal plan — one home in Cloudflare KV, so every
browser sees the same thing. It's **optional**: without it, the app works
exactly as it does today, purely on local storage.

It's a single-user setup: one passcode (that only you know) gates read and
write access, since the site itself is public. Two browsers editing between
syncs are merged by which edit is newest, not blindly overwritten, so this is
safe to use from more than one device.

## Deploy

1. Install Wrangler and log in (skip if you already did this for the AI Worker):
   ```sh
   npm i -g wrangler
   wrangler login
   ```
2. Create the KV namespace that will hold your data:
   ```sh
   wrangler kv namespace create SYNC_KV
   ```
   This prints an `id`. Create `worker/wrangler.sync.toml` (not committed —
   it's just a deploy convenience) with that id filled in:
   ```toml
   name = "chris-cooks-sync"
   main = "sync.js"
   compatibility_date = "2024-11-01"

   [[kv_namespaces]]
   binding = "SYNC_KV"
   id = "<the id wrangler printed>"
   ```
3. Deploy it:
   ```sh
   wrangler deploy --config wrangler.sync.toml
   ```
4. Set your passcode as a secret — pick anything memorable, this is the only
   thing standing between the public internet and your recipes:
   ```sh
   wrangler secret put PASSCODE --name chris-cooks-sync
   ```
5. (Recommended) Lock it to your site's origin too:
   ```sh
   wrangler secret put ALLOWED_ORIGIN --name chris-cooks-sync
   # value: https://chrisjamesseal.github.io
   ```

Wrangler prints the Worker URL, e.g. `https://chris-cooks-sync.<you>.workers.dev`.

## Activate in the app

Same pattern as the AI Worker:

- **Local:** add `VITE_SYNC_URL=https://…workers.dev` to `.env.local`
- **GitHub Pages:** add a repo variable `VITE_SYNC_URL` (Settings → Secrets and
  variables → Actions → Variables) — the build step already picks it up.

The first time the app talks to the Worker, it'll ask (once, via a plain
browser prompt) for the passcode you set above, then remember it in that
browser. When `VITE_SYNC_URL` is unset, sync is completely inert — no prompt,
no network calls, no behavior change.

## Bringing your existing recipes onto the server

The very first sync from any browser uploads whatever that browser already
has and starts the server's copy from that — no separate migration step. If
your most up-to-date collection is a backup file (Home → Back Up/Restore),
just use the existing **Restore Backup** button in whichever browser you use
day to day *after* setting `VITE_SYNC_URL`; restoring saves each recipe
normally, which syncs it up like any other edit.

## Notes

- What syncs: every recipe (including favourites and notes, since those live
  on the recipe itself) and the meal plan. What doesn't (yet): in-progress
  cooking state (ticked ingredients, step progress, servings on a specific
  device) — that stays local and transient, same as today.
- Sync is best-effort and silent: offline, a wrong/not-yet-entered passcode,
  or the Worker being unreachable all just mean this round is skipped — the
  app keeps working locally either way.
