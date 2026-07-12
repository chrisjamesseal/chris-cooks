import { HashRouter, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom'
import Home from './pages/Home'
import AddRecipe from './pages/AddRecipe'
import EditRecipe from './pages/EditRecipe'
import RecipeDetail from './pages/RecipeDetail'
import ThisWeek from './pages/ThisWeek'
import Changelog from './pages/Changelog'
import { getPlan } from './lib/plan'
import { CalendarIcon } from './components/icons'
import './App.css'

/**
 * Sticky app header: "My Recipes" is the brand and home link, with quick
 * favourite/protein filters that work from any page (they link to a
 * pre-filtered home screen; on the home screen they toggle).
 */
function AppHeader() {
  const [params] = useSearchParams()
  useLocation() // subscribe to navigation so the plan badge re-reads localStorage
  const fav = params.get('fav') === '1'
  const protein = params.get('protein') === '1'
  const planCount = getPlan().length

  const filterLink = (key: 'fav' | 'protein', on: boolean) => {
    const next = new URLSearchParams()
    if (key === 'fav' ? !on : fav) next.set('fav', '1')
    if (key === 'protein' ? !on : protein) next.set('protein', '1')
    const qs = next.toString()
    return qs ? `/?${qs}` : '/'
  }

  return (
    <header className="app-head">
      <Link to="/" className="app-head__title">My Recipes</Link>
      <Link to="/changelog" className="app-head__version">v{__APP_VERSION__}</Link>
      <div className="app-head__actions">
        <Link
          to={filterLink('fav', fav)}
          className={`btn-ghost btn-ghost--sm emoji-btn${fav ? ' emoji-btn--fav' : ''}`}
          aria-label="Favourites"
          aria-pressed={fav}
        >
          ❤️
        </Link>
        <Link
          to={filterLink('protein', protein)}
          className={`btn-ghost btn-ghost--sm emoji-btn${protein ? ' emoji-btn--protein' : ''}`}
          aria-label="High Protein"
          aria-pressed={protein}
        >
          💪
        </Link>
        <Link to="/plan" className="btn-ghost btn-ghost--sm week-btn" aria-label="This Week">
          <CalendarIcon />
          {planCount > 0 && <span className="week-btn__badge">{planCount}</span>}
        </Link>
        <Link to="/add" className="btn-primary btn-primary--sm app-head__add" aria-label="Add Recipe">
          ＋
        </Link>
      </div>
    </header>
  )
}

function App() {
  return (
    <HashRouter>
      <AppHeader />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/recipe/:id/edit" element={<EditRecipe />} />
          <Route path="/plan" element={<ThisWeek />} />
          <Route path="/changelog" element={<Changelog />} />
        </Routes>
      </main>
    </HashRouter>
  )
}

export default App
