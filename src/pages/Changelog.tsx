import { Link } from 'react-router-dom'

type Release = { version: string; title: string; notes: string[] }

const RELEASES: Release[] = [
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
