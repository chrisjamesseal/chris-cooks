import { Link } from 'react-router-dom'

type Release = { version: string; title: string; notes: string[] }

const RELEASES: Release[] = [
  {
    version: '1.14.0',
    title: 'Firebase as a backend option',
    notes: [
      'The AI helper and cross-browser sync can now be hosted on Firebase Cloud Functions instead of Cloudflare, for anyone with a Firebase account but no Cloudflare one. Same features, same setup effort, see functions/README.md.',
    ],
  },
  {
    version: '1.13.1',
    title: 'Cheaper AI helper',
    notes: [
      'The AI import-cleanup Worker now defaults to a faster, much cheaper model, since it holds up well for tidying scraped text.',
    ],
  },
  {
    version: '1.13.0',
    title: 'Optional cloud sync',
    notes: [
      'New optional sync Worker (see worker/README.md): every recipe, favourite, note and the meal plan can now live in one place in the cloud, so opening the app in a new or cleared browser shows everything exactly as you left it.',
      'Two browsers editing between syncs are merged by which edit is newest, not blindly overwritten, so this is safe to use from more than one device.',
      'Entirely optional and invisible until set up: without deploying the Worker, nothing changes.',
    ],
  },
  {
    version: '1.12.0',
    title: 'A proper Home Screen icon',
    notes: [
      'Add to Home Screen on iPhone now shows the green bowl-of-rice icon instead of a blank page thumbnail.',
      'Opened from the Home Screen, the app now launches full-screen without the Safari address bar, as it always meant to.',
    ],
  },
  {
    version: '1.11.2',
    title: 'Favicon swapped to a bowl of rice',
    notes: [
      'The favicon now shows a bowl of rice instead of a crossed fork and knife, still on the same green background.',
    ],
  },
  {
    version: '1.11.1',
    title: 'A proper favicon',
    notes: [
      'New favicon: a green rounded square with a crossed fork and knife, replacing the old placeholder icon.',
    ],
  },
  {
    version: '1.11.0',
    title: 'Tidier action bar and a proper unit toggle',
    notes: [
      'Delete moved off the sticky bar to its own button at the bottom of the page, so it is out of the way while cooking.',
      'Favourite is now a heart icon in the sticky bar, turning red when a recipe is favourited.',
      'Add to Meal Plan now always fits on one line in the sticky bar.',
      'Tapping the version number a second time (from the changelog) now just takes you back, instead of reopening the changelog.',
      'Bolder, clearer arrows on every collapsible section.',
      'Nutrition is now collapsible too, and closed by default.',
      'Metric and Imperial are now one sliding toggle instead of two separate buttons, with more breathing room above it.',
    ],
  },
  {
    version: '1.10.0',
    title: 'Unit conversion, accordions, and a tidier action bar',
    notes: [
      'Ingredients can now show Metric or Imperial: switch a recipe to lb/oz/cups or to g/kg/ml/l with one tap.',
      'Ingredients, Method and My Notes are now collapsible sections that open by default, so you can collapse what you are not using. Nutrition stays as is.',
      'Edit and Delete moved to icon buttons in the sticky bar at the bottom, next to Add to Meal Plan.',
      'The recipe source now shows the full link instead of just the website name.',
      'When writing steps, pressing Enter now starts a new step instead of adding a line break (Shift+Enter still adds a line break within a step).',
      'The New Recipe button no longer wraps onto two lines.',
    ],
  },
  {
    version: '1.9.0',
    title: 'New categories, cleaner text, and photo import',
    notes: [
      'New Sauce, Soup and Salad categories, existing recipes moved to where they belong (all your sauces, soups and salads are out of Sides and Lunch).',
      'Editing a recipe now shows every category as a checkbox, tick as many as apply instead of one dropdown plus a separate list.',
      'Bullet points, dashes and stray asterisks are now stripped automatically from ingredients and steps, whether typed, pasted or imported, so recipes read as clean prose.',
      'Upload a Photo: got a cookbook page, a handwritten card, or a screenshot? Upload it on the Add Recipe screen and the AI helper reads it into a full recipe for you to review (needs the one-time AI helper setup).',
      'The header add button now reads "New Recipe".',
    ],
  },
  {
    version: '1.8.0',
    title: 'Weight-loss nutrition & tidier cards',
    notes: [
      'The Nutrition tab is now weight-loss focused: Weight-Loss Winners (30g+ protein, under 600 kcal), Most Protein per Calorie, Low-Calorie Snacks, plus the existing protein, fibre, light and low-carb rows.',
      'A Healthy Eating Tips row with practical habits for losing weight.',
      'Missing nutrition? If the AI helper is set up, tap Estimate to fill it in from the ingredients. Estimates are clearly marked with a ≈ so you know they are not from the original recipe.',
      'On a recipe, the Favourite and Add to Meal Plan buttons now stay pinned above the bottom bar so they are always in reach.',
      'Tidier recipe cards (heart and calendar side by side), a square add button, and neater spacing on the recipe page.',
    ],
  },
  {
    version: '1.7.1',
    title: 'Calmer home screen',
    notes: [
      'The category pills are now a single dropdown, much less to look at.',
      'Every recipe card has two neat stacked buttons: tap the heart to favourite, tap the calendar to add it to your meal plan, right from the list.',
      'Recipe titles get two full lines on cards, the category label below them is gone.',
      'More breathing room under the tab bar when the app is opened from your Home Screen.',
    ],
  },
  {
    version: '1.7.0',
    title: 'A proper nutrition hub',
    notes: [
      'The Nutrition tab now leads with six health categories built from real data: Highest Protein, Light Meals, Low Carb, High Fibre, Low Saturated Fat and Low Sugar.',
      'The meal plan summary is still there when you have meals planned, just no longer the main event.',
      'The ❤️ and 💪 buttons are gone from the header. Favourites now lives at the start of the category pills, and protein browsing lives in Nutrition.',
    ],
  },
  {
    version: '1.6.0',
    title: 'Nutrition front and centre',
    notes: [
      'New bottom navigation: Recipes, Meal Plan and Nutrition are one tap away from anywhere.',
      'New Nutrition page: your meal plan totted up (calories, protein, carbs, fat per serving), plus Highest Protein and Light Meals rows to browse.',
      'Calories now show on recipe cards and meal plan entries whenever they are known.',
      'Find Missing Nutrition: the app can check a recipe\'s original source page and pull in the nutrition it states. Values are only ever taken from the source, never guessed. Opening a recipe without nutrition quietly checks once too.',
    ],
  },
  {
    version: '1.5.0',
    title: 'Meal Plan upgrades & recipes in more than one category',
    notes: [
      'Recipes can now live in more than one category: set "Also Show In" when editing, so pancakes can appear under Breakfast and Lunch.',
      '"This Week" is now called Meal Plan everywhere, and its Add to Shopping List button stays pinned to the bottom while you tick things off.',
      'Bigger tap targets on shopping list items.',
      'The Watch the Video link shows the proper TikTok or Instagram app icon, and links typed without "https://" no longer lead nowhere.',
      'A divider now separates cuisines from the main categories, with matching pill styles, and the add button got a crisper, centred plus.',
    ],
  },
  {
    version: '1.4.2',
    title: 'Smarter weekly shop & cleaner filters',
    notes: [
      'This Week now shows every ingredient from your planned meals, grouped by recipe. Tick what you already have and only the rest goes to your shopping list.',
      'Pick a category and the other pills step aside until you tap All (or the category again).',
      'Cakes can no longer masquerade as lunch: titles like "Victoria Sandwich" are recognised as desserts on import, and existing recipes get corrected.',
      'Cleaned up the cuisine filters (one had a stray web address in it).',
      'Header buttons are now the same size with proper press feedback, Clear Plan is red and lines up with the title, and the search hint is shorter.',
    ],
  },
  {
    version: '1.4.1',
    title: 'One header to rule them all',
    notes: [
      'The green bar is gone: "My Recipes" is now the app header, it stays pinned while you scroll, and the version number sits next to it (still opens this page).',
      'The ❤️ and 💪 buttons live in the header on every page, one tap from anywhere shows your favourites or high-protein recipes.',
      'Favourite and protein markers on recipe cards are now neat corner emojis, and an "All Recipes" heading separates the list from the ideas row.',
      'Cuisine filters now look clearly different from the main categories.',
      'The Add button is now simply ＋.',
    ],
  },
  {
    version: '1.4.0',
    title: 'Smarter home, proper categories & fridge search',
    notes: [
      'Fridge search: list what you have with commas ("chicken, potatoes, yogurt") and recipes that use the most of it come first.',
      'My Notes on every recipe: jot tweaks like "less sugar next time" and they stay with the recipe.',
      'High Protein: recipes with 25g+ protein per serving get a 💪 tag and their own filter.',
      'New Sides category, and 22 recipes moved to where they belong (sauces and potato sides are no longer "snacks").',
      'The filter matching the time of day sits first with a 🕒, and the ideas row now suggests breakfasts in the morning, lunches at midday and dinners tonight.',
      'Favourites went red, moved to a heart button in the header, and show on recipe cards.',
      'Cleaner cards (just the category below the title), tidier pills without counts, and removed "I cooked this".',
    ],
  },
  {
    version: '1.3.1',
    title: 'A tidier home screen',
    notes: [
      'The This Week button is now a neat calendar icon with a meal-count badge, so the header fits comfortably.',
      'Lighter remove button on This Week cards.',
    ],
  },
  {
    version: '1.3.0',
    title: 'Your week, your favourites, your backup',
    notes: [
      'This week: add recipes to a weekly plan, then send every ingredient from every planned meal to your shopping list in one tap. Find it at the top of the home screen.',
      'Favourites: tap ♥ on any recipe and filter to just your favourites at home.',
      '“I cooked this”: log each cook at the end of the method, recipes remember how many times you’ve made them.',
      'Backup & restore: download all your recipes as a single file from the bottom of the home screen, and restore them any time. Your collection is now un-losable.',
    ],
  },
  {
    version: '1.2.0',
    title: 'Shopping list polish & editable sources',
    notes: [
      'The shopping button now says “Add to Shopping List” with a little Reminders icon.',
      'Edit a recipe to see, add or change its source link, including swapping in the TikTok/Instagram video link.',
      'Prep and cook times: just type the number of minutes (other formats like “1 hr 20 min” still work).',
      'Video thumbnails now show a subtle “Press to play” label instead of a big play button.',
      'Removed the quick-timer row, steps that mention a time still get their own one-tap timer.',
      'A little more breathing room between Nutrition and the healthier tips.',
    ],
  },
  {
    version: '1.1.0',
    title: 'Tidier titles, tap-to-watch videos & sturdier saving',
    notes: [
      'Video recipes: the photo is now the video, tap the thumbnail (with its play button) to open the original on TikTok or Instagram.',
      'Recipe names tidied everywhere: hype like “THE BEST creamy pesto pasta” becomes “Creamy Pesto Pasta”, and every title is neatly capitalised.',
      'Steps now show ingredient amounts more reliably, fixed missing matches for plurals (potato/potatoes) and fraction quantities like ½ tsp.',
      'Sturdier saving: the app now asks the browser to keep its storage permanently. If recipes have vanished before, that was the browser clearing site data after a week away, adding the app to your Home Screen (Share → Add to Home Screen) prevents it completely.',
      'Removed the “keep screen on” switch.',
    ],
  },
  {
    version: '1.0.0',
    title: 'TikTok & Instagram imports, timers and smarter cooking',
    notes: [
      'Import recipes straight from TikTok and Instagram, paste the link and we pull in the dish, ingredients, photo and video.',
      'Watch the original video right on the recipe page, or open it in the app with one tap.',
      'Kitchen timers: steps that mention a time get a one-tap countdown, plus quick 5/10/15-minute timers on every recipe, with a proper alarm that keeps ringing on screen until you dismiss it.',
      '“Keep screen on” switch in the Method section so your phone doesn’t sleep mid-recipe.',
      'Your progress sticks: ticked ingredients, completed steps and servings are remembered per recipe, even if you close the app mid-shop or mid-cook.',
      'Healthier eating built in: every recipe now shows instant ingredient-swap tips under Nutrition, no setup needed.',
      'Home screen refresh: real photos on recipe cards, a “Recently added” row that updates as you add recipes, category counts, and cook times at a glance.',
      'Optional AI upgrade: deploy the small worker in /worker and video imports get a proper dish name, a written method and the photo read straight from the video, plus a one-tap “rewrite this recipe to be healthier”. See worker/README.md.',
    ],
  },
  {
    version: '0.9.0',
    title: 'Crisper food icons',
    notes: [
      'Recipe icons now render identically on every device, iPhone, Android, laptop, instead of changing with each system font.',
      'Uses the Fluent Emoji (flat) set, bundled into the app so it works offline with no extra loading.',
      'Same picture-from-the-title logic as before, just sharper and consistent everywhere.',
    ],
  },
  {
    version: '0.8.0',
    title: 'Make it healthier',
    notes: [
      'Every recipe has a "Make it healthier" panel, pick what to cut back (calories, saturated fat, sugar or sodium) and get a lighter version.',
      'It keeps the dish recognisable and flags any change that affects taste or texture, so you decide before anything updates.',
      'Needs a one-time AI helper: deploy the small worker in /worker (it holds your API key) and set VITE_AI_CLEANUP_URL, see worker/README.md. Until then the panel says it isn’t connected.',
    ],
  },
  {
    version: '0.7.0',
    title: 'Shopping, tidier data & the edit form',
    notes: [
      'Ingredients cleaned up, brackets and notes removed, just the item.',
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
    notes: ['Add, search, view, edit and delete recipes, saved on your device.'],
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
          Until it’s set up, the button still copies the list to your clipboard, paste it into
          Reminders and it will offer to make separate items.
        </p>
      </section>
    </div>
  )
}
