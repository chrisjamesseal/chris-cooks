# Firebase Cloud Functions (alternative to the Cloudflare Worker)

This is the same two features as `/worker` — the AI import-cleanup proxy and
cross-browser sync — rebuilt on Firebase instead of Cloudflare, for anyone who
has a Firebase account but not a Cloudflare one. Both speak the exact same
request/response format as their Cloudflare counterparts, so the app code
doesn't care which one you deploy — only the URL you set differs.

- **`aiCleanup`** — recipe import cleanup, "make it healthier", TikTok/
  Instagram video import, photo import, nutrition estimate. Same six modes as
  `worker/ai-cleanup.js`. Activate with `VITE_AI_CLEANUP_URL`.
- **`syncApi`** — recipe/meal-plan sync, backed by Firestore instead of
  Cloudflare KV (one document per recipe, so there's no size limit on the
  whole collection). Same merge logic as `worker/sync.js`. Activate with
  `VITE_SYNC_URL`.

**A note on cost:** Firebase requires the pay-as-you-go **Blaze** plan to
deploy Cloud Functions at all (Spark, the free plan, can't run them) — that
means adding a card, but the Blaze plan still gives you 2,000,000 function
invocations, 400,000 GB-seconds of compute, and 5GB of internet traffic free
every month, which is enormously more than a personal recipe app will ever
use. Realistically this costs $0/month. On top of that, calling the Anthropic
API for `aiCleanup` is billed separately by Anthropic (see the AI Worker
section in `worker/README.md` for that side of the cost — it's the same
either way you host this).

## Deploy

**Automatic (recommended):** `.github/workflows/deploy-functions.yml` deploys
this folder to Firebase on every push to `main` that touches `functions/**`,
using a service account key stored as the `FIREBASE_SERVICE_ACCOUNT` GitHub
repo secret. Set it up once:

1. Firebase console → Project settings → Service accounts → **Generate new
   private key** (downloads a JSON file).
2. GitHub repo → Settings → Secrets and variables → Actions → **New
   repository secret** → name it `FIREBASE_SERVICE_ACCOUNT`, paste the
   entire JSON file as the value.
3. Delete the downloaded JSON file from your computer — GitHub now holds it
   encrypted, and no one (including Claude) needs to see it again for future
   deploys. The secrets and one-time setup steps below (Blaze plan, API
   secrets, Firestore) still need doing once by hand first.

After that, changing anything in `functions/` and merging to `main` deploys
it automatically — no key handoff needed ever again. You can also trigger a
deploy manually from the Actions tab (**Deploy Firebase Functions** →
Run workflow) without waiting for a functions change.

**Manual (alternative):**

1. Install the Firebase CLI and log in:
   ```sh
   npm i -g firebase-tools
   firebase login
   ```
2. From the repo root, link this project to a Firebase project (create one
   free at [console.firebase.google.com](https://console.firebase.google.com)
   if you don't have one yet):
   ```sh
   firebase use --add
   ```
3. Upgrade that project to the **Blaze** plan (Firebase console → your
   project → the plan/upgrade link at the bottom of the left sidebar) — this
   is required before Cloud Functions will deploy, but see the cost note
   above.
4. Set your secrets (you'll be prompted to paste each value — never pass
   these as command-line arguments, so they don't end up in shell history):
   ```sh
   firebase functions:secrets:set PASSCODE
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   `PASSCODE` gates `syncApi` (pick anything memorable — it's the only thing
   standing between the public internet and your recipes). `ANTHROPIC_API_KEY`
   powers `aiCleanup` (get one at
   [console.anthropic.com](https://console.anthropic.com); skip this one if
   you only want sync, not the AI import helper).
5. (Recommended) Lock both functions to your site's origin — create
   `functions/.env` with:
   ```
   ALLOWED_ORIGIN=https://chrisjamesseal.github.io
   ```
   (Not sensitive, no secrets in it — but it's still git-ignored by default;
   that's fine, it only needs to exist on your machine at deploy time.)
6. Deploy:
   ```sh
   cd functions
   npm install
   firebase deploy --only functions
   ```

Firebase prints each function's URL, e.g.:
`https://aicleanup-xxxxxxxxxx-uc.a.run.app` and
`https://syncapi-xxxxxxxxxx-uc.a.run.app`.

## Activate in the app

Same pattern as the Cloudflare Worker versions — set these as build variables
so Vite bakes them in:

- **Local:** add to `.env.local`:
  ```
  VITE_AI_CLEANUP_URL=https://aicleanup-xxxxxxxxxx-uc.a.run.app
  VITE_SYNC_URL=https://syncapi-xxxxxxxxxx-uc.a.run.app
  ```
- **GitHub Pages:** add repo variables `VITE_AI_CLEANUP_URL` / `VITE_SYNC_URL`
  (Settings → Secrets and variables → Actions → Variables) — the build step
  in `.github/workflows/deploy.yml` already reads both.

Deploy only the one you want; the other stays inert (no prompts, no network
calls) exactly as if you'd deployed neither.

## Bringing your existing recipes onto the server

Same as the Cloudflare path: once `VITE_SYNC_URL` is set, open the app in
whichever browser you use day to day and use the existing **Restore Backup**
button (Home screen) with your latest backup file — that saves each recipe
through the normal path, which now syncs automatically.

## Local testing (optional)

The Firebase emulator suite runs both functions and a local Firestore
instance on your machine with no live project needed:

```sh
firebase emulators:start --project demo-test --only functions,firestore
```

It'll print local URLs like `http://127.0.0.1:5001/demo-test/us-central1/syncApi`
you can `curl` directly to sanity-check before deploying for real.
