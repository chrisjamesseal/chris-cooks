import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe, saveRecipe } from '../db'
import {
  deQuantifyStep,
  ingredientsForStep,
  ingredientsFromText,
  newId,
  scaleIngredientText,
  stepParagraphs,
} from '../lib/recipe'
import {
  aiEndpoint,
  HEALTH_PRIORITIES,
  makeHealthier,
  type HealthierResult,
  type HealthPriority,
} from '../lib/ai'
import { placeholderEmoji, placeholderGradient } from '../lib/placeholder'
import { healthierTips } from '../lib/healthier'
import { inPlan, togglePlan } from '../lib/plan'
import { sendToShoppingList } from '../lib/shopping'
import { videoInfoFromUrl } from '../lib/video'
import { FoodIcon } from '../components/FoodIcon'
import { CalendarIcon, RemindersIcon } from '../components/icons'
import type { Ingredient, Nutrition, Recipe } from '../types'

const NUTRITION_ROWS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'satFatG', label: 'Saturates', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'sugarG', label: 'Sugars', unit: 'g' },
  { key: 'fiberG', label: 'Fibre', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
]

function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Ticked ingredients, step progress and servings survive reloads — you can
// close the app mid-shop or mid-cook and pick up where you left off.
const COOK_STATE_PREFIX = 'chris-cooks:cook:'
type CookState = { have: string[]; completedThrough: number; people: number }

function loadCookState(recipeId: string): CookState | null {
  try {
    return JSON.parse(localStorage.getItem(COOK_STATE_PREFIX + recipeId) ?? 'null')
  } catch {
    return null
  }
}

/**
 * Pull a usable countdown out of a step's text, e.g. "simmer for 25 minutes",
 * "bake 1 hour 10 min", "cook 6-8 min" (a range uses the longer end).
 */
function stepTimerSeconds(text: string): number | undefined {
  const hr = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i)
  const min = text.match(/(?:\d+\s*(?:[-–—]|to)\s*)?(\d+)\s*(?:minutes?|mins?)\b/i)
  const sec = text.match(/(\d+)\s*(?:seconds?|secs?)\b/i)
  let total = 0
  if (hr) total += parseFloat(hr[1]) * 3600
  if (min) total += Number(min[1]) * 60
  if (!hr && !min && sec) total += Number(sec[1])
  return total >= 30 && total <= 6 * 3600 ? Math.round(total) : undefined
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function timerLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} hr`
  if (seconds > 3600) return `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`
  return `${Math.round(seconds / 60)} min`
}

/** A short repeating beep pattern, loud enough to hear across a kitchen. */
function ringAlarm(ctx: AudioContext | null) {
  if (!ctx) return
  ctx.resume().catch(() => {})
  const t0 = ctx.currentTime + 0.05
  for (let i = 0; i < 8; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = i % 2 ? 660 : 880
    const start = t0 + i * 0.45
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.42)
  }
}


/** Auto-growing textarea for the notes editor. */
function AutoNotes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="field__input field__input--auto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      placeholder="Less sugar next time, 20 minutes was plenty…"
      autoFocus
    />
  )
}

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [people, setPeople] = useState(1)
  // A single "completed through" frontier: tapping a step marks it and every
  // step above done; un-tapping clears it and everything below.
  const [completedThrough, setCompletedThrough] = useState(-1)
  const [have, setHave] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  // "Make it healthier"
  const [priority, setPriority] = useState<HealthPriority>('calories')
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthResult, setHealthResult] = useState<HealthierResult | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const aiOn = !!aiEndpoint()
  // One running timer at a time. When a timer finishes it rings and stays in
  // a "done" state until dismissed, so a finished timer can't be missed. The
  // AudioContext is created on the start tap (a user gesture) so iOS allows
  // the alarm to play.
  const [timer, setTimer] = useState<{ stepId: string; endsAt: number } | null>(null)
  const [timerDone, setTimerDone] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const audioRef = useRef<AudioContext | null>(null)
  const [planned, setPlanned] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  useEffect(() => {
    if (id) setPlanned(inPlan(id))
    setEditingNotes(false)
  }, [id])

  useEffect(() => {
    if (!id) return
    getRecipe(id).then((r) => {
      setRecipe(r ?? null)
      if (!r) return
      setPeople(r.servings)
      // Restore in the same batch as setRecipe so the save effect below never
      // sees (and persists) the default state before the restore lands.
      const saved = loadCookState(r.id)
      if (saved) {
        setHave(new Set(saved.have))
        setCompletedThrough(saved.completedThrough ?? -1)
        if (Number.isFinite(saved.people) && saved.people >= 1) setPeople(saved.people)
      }
    })
  }, [id])

  useEffect(() => {
    if (!recipe) return
    try {
      if (have.size === 0 && completedThrough < 0 && people === recipe.servings) {
        localStorage.removeItem(COOK_STATE_PREFIX + recipe.id)
      } else {
        const state: CookState = { have: [...have], completedThrough, people }
        localStorage.setItem(COOK_STATE_PREFIX + recipe.id, JSON.stringify(state))
      }
    } catch {
      // Private browsing or full storage — progress just won't persist.
    }
  }, [recipe, have, completedThrough, people])

  useEffect(() => {
    if (!timer) return
    const iv = setInterval(() => setNowTick(Date.now()), 500)
    return () => clearInterval(iv)
  }, [timer])

  useEffect(() => {
    if (timer && nowTick >= timer.endsAt) {
      setTimerDone(timer.stepId)
      setTimer(null)
      navigator.vibrate?.([300, 150, 300, 150, 300])
      ringAlarm(audioRef.current)
    }
  }, [timer, nowTick])

  if (recipe === undefined) return <p className="muted">Loading…</p>
  if (recipe === null) {
    return (
      <div>
        <p className="muted">Recipe not found.</p>
        <Link to="/" className="btn-primary">Back to recipes</Link>
      </div>
    )
  }

  const loaded = recipe // non-null within handlers below

  function toggleStep(index: number) {
    setCompletedThrough((current) => (index <= current ? index - 1 : index))
  }

  function toggleHave(ingId: string) {
    setHave((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      return next
    })
  }

  async function handleDelete() {
    if (!confirm(`Delete “${loaded.title}”?`)) return
    await deleteRecipe(loaded.id)
    try {
      localStorage.removeItem(COOK_STATE_PREFIX + loaded.id)
    } catch {
      // best-effort cleanup
    }
    navigate('/', { replace: true })
  }

  function toggleTimer(stepId: string, seconds: number) {
    // Create/resume the AudioContext inside the tap so iOS lets the alarm play later.
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioContext()
      } catch {
        // No Web Audio — vibration/visual state still signal completion.
      }
    }
    audioRef.current?.resume().catch(() => {})
    setTimerDone(null)
    setNowTick(Date.now())
    setTimer((current) =>
      current?.stepId === stepId ? null : { stepId, endsAt: Date.now() + seconds * 1000 },
    )
  }

  /** One chip that covers all three timer states: idle → counting down → done. */
  function timerChip(stepId: string, seconds: number, idleLabel: string) {
    const running = timer?.stepId === stepId
    const done = timerDone === stepId
    const remaining = running && timer ? Math.max(0, Math.ceil((timer.endsAt - nowTick) / 1000)) : 0
    return (
      <button
        type="button"
        className={`step-timer${running ? ' step-timer--running' : ''}${done ? ' step-timer--done' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (done) setTimerDone(null)
          else toggleTimer(stepId, seconds)
        }}
      >
        {done ? '⏱ Time’s Up! Tap to Dismiss' : running ? `⏱ ${formatCountdown(remaining)} · Tap to Cancel` : idleLabel}
      </button>
    )
  }

  function sendToReminders() {
    const remaining = loaded.ingredients.filter((i) => !have.has(i.id)).map((i) => scaleIngredientText(i, factor))
    if (remaining.length === 0) return
    sendToShoppingList(remaining)
    flash('Opening Reminders… (List Also Copied)')
  }

  async function toggleFavorite() {
    const updated: Recipe = { ...loaded, favorite: !loaded.favorite }
    await saveRecipe(updated)
    setRecipe(updated)
    flash(updated.favorite ? 'Added to Favourites ♥' : 'Removed From Favourites')
  }

  function handleTogglePlan() {
    const nowIn = togglePlan(loaded.id)
    setPlanned(nowIn)
    flash(nowIn ? 'Added to This Week 🗓' : 'Removed From This Week')
  }

  async function saveNotes() {
    const notes = notesDraft.trim()
    const updated: Recipe = { ...loaded, notes: notes || undefined }
    await saveRecipe(updated)
    setRecipe(updated)
    setEditingNotes(false)
    flash('Notes Saved ✓')
  }

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function generateHealthier() {
    setHealthLoading(true)
    setHealthError(null)
    setHealthResult(null)
    try {
      setHealthResult(await makeHealthier(loaded, priority))
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setHealthLoading(false)
    }
  }

  async function applyHealthier() {
    if (!healthResult) return
    const updated: Recipe = {
      ...loaded,
      ingredients: ingredientsFromText(healthResult.ingredients.join('\n')),
      steps: healthResult.steps.map((text) => ({ id: newId(), text })),
      updatedAt: Date.now(),
    }
    await saveRecipe(updated)
    setRecipe(updated)
    setPeople(updated.servings)
    setCompletedThrough(-1)
    setHave(new Set())
    setHealthResult(null)
    flash('Updated to a Healthier Version')
  }

  const baseServings = recipe.servings || 1
  const factor = people / baseServings
  const scaled = people !== baseServings
  const remainingCount = recipe.ingredients.length - have.size

  const times = [
    recipe.times.prep && `Prep ${recipe.times.prep}`,
    recipe.times.cook && `Cook ${recipe.times.cook}`,
  ].filter(Boolean)

  const nutritionRows = recipe.nutrition
    ? NUTRITION_ROWS.filter(({ key }) => recipe.nutrition![key] !== undefined)
    : []

  const video = videoInfoFromUrl(recipe.source?.url)
  const tips = healthierTips(recipe)

  // Each ingredient appears as a pill only once across the method (its first
  // use) so an ingredient touched in several steps isn't doubled up.
  const shownPills = new Set<string>()
  const stepPills: Ingredient[][] = recipe.steps.map((step) => {
    const used = ingredientsForStep(step, recipe.ingredients).filter(
      (i) => i.quantity !== undefined && !shownPills.has(i.id),
    )
    used.forEach((i) => shownPills.add(i.id))
    return used
  })

  return (
    <article className="recipe-detail">
      <Link to="/" className="back-link">← All recipes</Link>
      {recipe.image && video ? (
        // The thumbnail IS the video: square like every other photo, opening
        // the original on TikTok/Instagram. The cover art usually carries the
        // platform's own play glyph, so just a small label at the bottom.
        <a
          className="recipe-hero recipe-hero--video"
          href={video.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Watch the Video on ${video.label}`}
        >
          <img src={recipe.image} alt={recipe.title} />
        </a>
      ) : recipe.image ? (
        <img
          className="recipe-hero"
          src={recipe.image}
          alt={recipe.title}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <Link
          to={`/recipe/${recipe.id}/edit`}
          className="recipe-hero recipe-hero--ph"
          style={{ background: placeholderGradient(recipe.mainCategory) }}
          aria-label="Add a Photo"
        >
          <FoodIcon emoji={placeholderEmoji(recipe.title, recipe.mainCategory)} />
          <span className="recipe-hero__add">＋ Add a photo</span>
        </Link>
      )}
      <h1 className="page-title">{recipe.title}</h1>

      <div className="chips">
        <span className="chip">{recipe.mainCategory}</span>
        {recipe.cuisine && <span className="chip chip--cuisine">{recipe.cuisine}</span>}
        {times.map((t) => (
          <span className="chip" key={t as string}>{t}</span>
        ))}
        {(recipe.nutrition?.proteinG ?? 0) >= 25 && (
          <span className="chip chip--protein">💪 High Protein</span>
        )}
      </div>

      <div className="recipe-actions">
        <button
          type="button"
          className={`recipe-action${recipe.favorite ? ' recipe-action--fav' : ''}`}
          onClick={toggleFavorite}
          aria-pressed={!!recipe.favorite}
        >
          {recipe.favorite ? '♥ Favourite' : '♡ Favourite'}
        </button>
        <button
          type="button"
          className={`recipe-action${planned ? ' recipe-action--on' : ''}`}
          onClick={handleTogglePlan}
          aria-pressed={planned}
        >
          <CalendarIcon className="calendar-icon calendar-icon--inline" />
          {planned ? ' In This Week ✓' : ' Add to This Week'}
        </button>
      </div>

      {video && !recipe.image && (
        <a className="video-link card" href={video.url} target="_blank" rel="noreferrer">
          {video.platform === 'tiktok' ? '🎵' : '📸'} Watch the Video on {video.label}
          <span className="video-link__arrow" aria-hidden="true">↗</span>
        </a>
      )}

      <section>
        <h2 className="section-title">Ingredients</h2>
        <p className="scale-note">
          Select any items you already have to create a shopping list.{' '}
          {have.size > 0 && (
            <button type="button" className="link-btn" onClick={() => setHave(new Set())}>
              Clear Ticks
            </button>
          )}
        </p>
        <ul className="ingredient-list ingredient-list--check">
          {recipe.ingredients.map((ing) => {
            const has = have.has(ing.id)
            return (
              <li key={ing.id}>
                <button
                  type="button"
                  className={`ingredient-item${has ? ' ingredient-item--have' : ''}`}
                  onClick={() => toggleHave(ing.id)}
                  aria-pressed={has}
                >
                  <span className="ingredient-item__check" aria-hidden="true">
                    {has ? '✓' : ''}
                  </span>
                  <span className="ingredient-item__text">{scaleIngredientText(ing, factor)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="servings-row" role="group" aria-label="Number of Servings">
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setPeople((p) => Math.max(1, p - 1))}
            aria-label="Fewer Servings"
          >
            −
          </button>
          <span className="servings-row__value">
            {people} {people === 1 ? 'serving' : 'servings'}
            {scaled && (
              <button type="button" className="link-btn" onClick={() => setPeople(baseServings)}>
                Reset
              </button>
            )}
          </span>
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setPeople((p) => p + 1)}
            aria-label="More Servings"
          >
            +
          </button>
        </div>

        <div className="shopping-actions">
          <button
            type="button"
            className="btn-primary btn-reminders"
            onClick={sendToReminders}
            disabled={remainingCount === 0}
          >
            {remainingCount === 0 ? (
              'Got Everything ✓'
            ) : (
              <>
                <RemindersIcon /> Add {remainingCount} to Shopping List
              </>
            )}
          </button>
        </div>
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h2 className="section-title">Method</h2>
          <p className="scale-note">Click on a step to mark it as complete.</p>
          <ol className="step-list">
            {recipe.steps.map((step, index) => {
              const used = stepPills[index]
              const done = index <= completedThrough
              const seconds = stepTimerSeconds(step.text)
              return (
                <li
                  key={step.id}
                  className={`step-card${done ? ' step-card--done' : ''}`}
                  onClick={() => toggleStep(index)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={done}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                      e.preventDefault()
                      toggleStep(index)
                    }
                  }}
                >
                  <span className="step-card__num">{done ? '✓' : index + 1}</span>
                  <div className="step-card__body">
                    {stepParagraphs(deQuantifyStep(step.text)).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                    {seconds !== undefined && timerChip(step.id, seconds, `⏱ Start ${timerLabel(seconds)} Timer`)}
                    {used.length > 0 && (
                      <div className="step-ingredients">
                        {used.map((ing) => (
                          <span className="step-ingredient" key={ing.id}>
                            {scaleIngredientText(ing, factor)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section>
        <h2 className="section-title">My Notes</h2>
        {editingNotes ? (
          <div className="notes-edit">
            <AutoNotes value={notesDraft} onChange={setNotesDraft} />
            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => setEditingNotes(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveNotes}>
                Save Notes
              </button>
            </div>
          </div>
        ) : recipe.notes ? (
          <div className="notes card" onClick={() => { setNotesDraft(loaded.notes ?? ''); setEditingNotes(true) }}>
            {recipe.notes.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <span className="notes__edit-hint">Tap to Edit</span>
          </div>
        ) : (
          <button
            type="button"
            className="btn-ghost btn-notes"
            onClick={() => { setNotesDraft(''); setEditingNotes(true) }}
          >
            ✏️ Add a Note
          </button>
        )}
      </section>

      <section>
        <h2 className="section-title">
          Nutrition{' '}
          {nutritionRows.length > 0 && (
            <span className="section-title__hint">
              per serving{recipe.nutrition?.servingSizeG ? ` (${recipe.nutrition.servingSizeG}g)` : ''}
            </span>
          )}
        </h2>
        {nutritionRows.length > 0 ? (
          <dl className="nutrition-table">
            {nutritionRows.map(({ key, label, unit }) => (
              <div className="nutrition-row" key={key}>
                <dt>{label}</dt>
                <dd>
                  {recipe.nutrition![key]}
                  {unit}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="scale-note">
            No nutrition info yet, add it via <Link to={`/recipe/${recipe.id}/edit`}>Edit</Link>.
          </p>
        )}

        <div className="healthier card">
          <h3 className="healthier__title">🥗 Tips to make it healthier</h3>
          {tips.length > 0 ? (
            <ul className="health-tips">
              {tips.map((t) => (
                <li key={t.id}>
                  <strong>{t.swap}</strong> {t.benefit}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No obvious swaps to suggest, this one already looks pretty lean.</p>
          )}

          {aiOn && (
            <div className="healthier__body">
              {healthResult ? (
                <>
                  <p className="muted">
                    A lighter version with less {HEALTH_PRIORITIES.find((p) => p.key === priority)?.label.toLowerCase()}.
                    {healthResult.changes.length === 0 && ' No big taste or texture changes.'}
                  </p>
                  {healthResult.changes.length > 0 && (
                    <div className="healthier__flags">
                      <span className="healthier__flags-title">Worth knowing, these affect taste or texture:</span>
                      <ul>
                        {healthResult.changes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="form-actions">
                    <button type="button" className="btn-ghost" onClick={() => setHealthResult(null)}>
                      Keep Original
                    </button>
                    <button type="button" className="btn-primary" onClick={applyHealthier}>
                      Apply Changes
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="filter-chips">
                    {HEALTH_PRIORITIES.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={`filter-chip filter-chip--sm${priority === p.key ? ' filter-chip--active' : ''}`}
                        onClick={() => setPriority(p.key)}
                      >
                        Less {p.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-primary healthier__go"
                    onClick={generateHealthier}
                    disabled={healthLoading}
                  >
                    {healthLoading ? 'Thinking…' : 'Rewrite This Recipe to Be Healthier'}
                  </button>
                  {healthError && <p className="form-error" role="alert">{healthError}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {recipe.source?.url && !video && (
        <p className="muted">
          Source:{' '}
          <a href={recipe.source.url} target="_blank" rel="noreferrer">
            {sourceHostname(recipe.source.url)}
          </a>
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn-danger" onClick={handleDelete}>
          Delete
        </button>
        <Link to={`/recipe/${recipe.id}/edit`} className="btn-primary">
          Edit
        </Link>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </article>
  )
}
