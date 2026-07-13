import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import AddRecipe from './pages/AddRecipe'
import EditRecipe from './pages/EditRecipe'
import RecipeDetail from './pages/RecipeDetail'
import ThisWeek from './pages/ThisWeek'
import Nutrition from './pages/Nutrition'
import Changelog from './pages/Changelog'
import { getPlan } from './lib/plan'
import { BookIcon, CalendarIcon, NutritionIcon, PlusIcon } from './components/icons'
import './App.css'

/** Sticky app header: brand, version and the add button. */
function AppHeader() {
  return (
    <header className="app-head">
      <Link to="/" className="app-head__title">My Recipes</Link>
      <Link to="/changelog" className="app-head__version">v{__APP_VERSION__}</Link>
      <div className="app-head__actions">
        <Link to="/add" className="btn-primary btn-primary--sm app-head__add">
          <PlusIcon /> New Recipe
        </Link>
      </div>
    </header>
  )
}

/** Fixed bottom navigation: the app's three main places, one tap away. */
function BottomNav() {
  const { pathname } = useLocation()
  const [planCount, setPlanCount] = useState(() => getPlan().length)

  useEffect(() => {
    const update = () => setPlanCount(getPlan().length)
    window.addEventListener('planchange', update)
    return () => window.removeEventListener('planchange', update)
  }, [])
  const active = pathname.startsWith('/plan') ? 'plan' : pathname.startsWith('/nutrition') ? 'nutrition' : 'recipes'

  return (
    <nav className="bottom-nav">
      <Link to="/" className={`bottom-nav__tab${active === 'recipes' ? ' bottom-nav__tab--active' : ''}`}>
        <BookIcon />
        Recipes
      </Link>
      <Link to="/plan" className={`bottom-nav__tab${active === 'plan' ? ' bottom-nav__tab--active' : ''}`}>
        <span className="bottom-nav__icon-wrap">
          <CalendarIcon className="nav-icon" />
          {planCount > 0 && <span className="week-btn__badge">{planCount}</span>}
        </span>
        Meal Plan
      </Link>
      <Link to="/nutrition" className={`bottom-nav__tab${active === 'nutrition' ? ' bottom-nav__tab--active' : ''}`}>
        <NutritionIcon />
        Nutrition
      </Link>
    </nav>
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
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/changelog" element={<Changelog />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  )
}

export default App
