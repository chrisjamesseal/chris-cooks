import { Link } from 'react-router-dom'

type Release = { version: string; title: string; notes: string[] }

const RELEASES: Release[] = [
  {
    version: '1.3.0',
    title: 'Your week, your favourites, your backup',
    notes: [
      'This week: add recipes to a weekly plan, then send every ingredient from every planned meal to your shopping list in one tap. Find it at the top of the home screen.',
      'Favourites: tap ♥ on any recipe and filter to just your favourites at home.',
      '“I cooked this”: log each cook at the end of the method — recipes remember how many times you’ve made them.',
      'Backup & restore: download all your recipes as a single file from the bottom of the home screen, and restore them any time. Your collection is now un-losable.',
    ],
  },
  {
    version: '1.2.0',
    title: 'Shopping list polish & editable sources',
    notes: [
      'The shopping button now says “Add to Shopping List” with a little Reminders icon.',
      'Edit a recipe to see, add or change its source link — including swapping in the TikTok/Instagram video link.',
      'Prep and cook times: just type the number of minutes (other formats like “1 hr 20 min” still work).',
      'Video thumbnails now show a subtle “Press to play” label instead of a big play button.',
      'Removed the quick-timer row — steps that mention a time still get their own one-tap timer.',
      'A little more breathing room between Nutrition and the healthier tips.',
    ],
  },
  {
    version: '1.1.0',
    title: 'Tidier titles, tap-to-watch videos & sturdier saving',
    notes: [
      'Video recipes: the photo is now the video — tap the thumbnail (with its play button) to open the original on TikTok or Instagram.',
      'Recipe names tidied everywhere: hype like “THE BEST creamy pesto pasta” becomes “Creamy Pesto Pasta”, and every title is neatly capitalised.',
      'Steps now show ingredient amounts more reliably — fixed missing matches for plurals (potato/potatoes) and fraction quantities like ½ tsp.',
      'Sturdier saving: the app now asks the browser to keep its storage permanently. If recipes have vanished before, that was the browser clearing site data after a week away — adding the app to your Home Screen (Share → Add to Home Screen) prevents it completely.',
      'Removed the “keep screen on” switch.',
    ],
  },
  {
    version: '1.0.0',
    title: 'TikTok & Instagram imports, timers and smarter cooking',
    notes: [
      'Import recipes straight from TikTok and Instagram — paste the link and we pull in the dish, ingredients, photo and video.',
      'Watch the original video right on the recipe page, or open it in the app with one tap.',
      'Kitchen timers: steps that mention a time get a one-tap countdown, plus quick 5/10/15-minute timers on every recipe — with a proper alarm that keeps ringing on screen until you dismiss it.',
      '“Keep screen on” switch in the Method section so your phone doesn’t sleep mid-recipe.',
      'Your progress sticks: ticked ingredients, completed steps and servings are remembered per recipe, even if you close the app mid-shop or mid-cook.',
      'Healthier eating built in: every recipe now shows instant ingredient-swap tips under Nutrition — no setup needed.',
      'Home screen refresh: real photos on recipe cards, a “Recently added” row that updates as you add recipes, category counts, and cook times at a glance.',
      'Optional AI upgrade: deploy the small worker in /worker and video imports get a proper dish name, a written method and the photo read straight from the video — plus a one-tap “rewrite this recipe to be healthier”. See worker/README.md.',
    ],
  },
  {
    version: '0.9.0',
    title: 'Crisper food icons',
    notes: [
      'Recipe icons now render identically on every device — iPhone, Android, laptop — instead of changing with each system font.',
      'Uses the Fluent Emoji (flat) set, bundled into the app so it works offline with no extra loading.',
      'Same picture-from-the-title logic as before, just sharper and consistent everywhere.',
    ],
  },
  {
    version: '0.8.0',
    title: 'Make it healthier',
    notes: [
      'Every recipe has a "Make it healthier" panel — pick what to cut back (calories, saturated fat, sugar or sodium) and get a lighter version.',
      'It keeps the dish recognisable and flags any change that affects taste or texture, so you decide before anything updates.',
      'Needs a one-time AI helper: deploy the small worker in /worker (it holds your API key) and set VITE_AI_CLEANUP_URL — see worker/README.md. Until then the panel says it isn’t connected.',
    ],
  },
  {
    version: '0.7.0',
    title: 'Shopping, tidier data & the edit form',
    notes: [
      'Ingredients cleaned up — brackets and notes removed, just the item.',
      'Steps no longer repeat quantities (they follow the servings you pick).',
      'Edit: upload a photo, ingredient/step boxes grow to fit, steps are separate fields.',
      'Pick a category on the home screen to filter by cuisine underneath.',
      'Servings moved below the ingredients; shopping list wording clearer.',
      'More accurate emoji, and this changelog.',
    ],
  },
  {
    version: '0.6.0',
    title: 'Shopping list & cooking mode',
    notes: [
      'Tick off ingredients you have and send the rest to Apple Reminders.',
      'Tap a step to mark it (and everything above) complete.',
      'Cleaner recipe titles and cuisine shown on cards.',
    ],
  },
  {
    version: '0.5.0',
    title: 'Your recipe collection',
    notes: [
      'Imported 129 recipes with nutrition, times and categories.',
      'Servings calculator, per-step ingredient amounts, square photos.',
    ],
  },
  {
    version: '0.3.0',
    title: 'Import from a link',
    notes: ['Paste a recipe URL to pull in the title, ingredients and steps.'],
  },
  {
    version: '0.2.0',
    title: 'The basics',
    notes: ['Add, search, view, edit and delete recipes — saved on your device.'],
  },
]

export default function Changelog() {
  return (
    <div>
      <Link to="/" className="back-link">← All recipes</Link>
      <h1 className="page-title">What’s new</h1>
      <p className="muted" style={{ marginTop: '-8px' }}>
        Currently on v{__APP_VERSION__}.
      </p>

      <div className="changelog">
        {RELEASES.map((r) => (
          <section className="changelog-entry" key={r.version}>
            <div className="changelog-entry__head">
              <span className="changelog-entry__version">v{r.version}</span>
              <h2 className="changelog-entry__title">{r.title}</h2>
            </div>
            <ul className="changelog-entry__notes">
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="card shortcut-help">
        <h2 className="section-title" style={{ marginTop: 0 }}>Set up one-tap shopping lists</h2>
        <p className="muted">
          The <strong>Add to Reminders</strong> button hands your list to an Apple Shortcut so each
          item becomes its own reminder. Create it once:
        </p>
        <ol className="ingredient-list">
          <li>Open the <strong>Shortcuts</strong> app → <strong>＋</strong> → <strong>New Shortcut</strong>.</li>
          <li>Add the action <strong>“Split Text”</strong> (split Shortcut Input by New Lines).</li>
          <li>Add <strong>“Add New Reminder”</strong> → set its text to the split result, and pick your shopping list.</li>
          <li>Name the shortcut exactly <strong>Add to Shopping List</strong>.</li>
        </ol>
        <p className="muted">
          Until it’s set up, the button still copies the list to your clipboard — paste it into
          Reminders and it will offer to make separate items.
        </p>
      </section>
    </div>
  )
}
