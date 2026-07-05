# AI import cleanup Worker (optional)

The app can send scraped recipe text through Claude to fix formatting/typos and
split run-on ingredient lines when you import from a URL. Because Chris Cooks is
a static site, the API key can't live in the browser — this tiny Cloudflare
Worker holds it server-side. It's **optional**: without it, URL imports work
exactly as before, just without the AI polish.

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
