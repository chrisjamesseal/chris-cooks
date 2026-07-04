import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import AddRecipe from './pages/AddRecipe'
import EditRecipe from './pages/EditRecipe'
import RecipeDetail from './pages/RecipeDetail'
import './App.css'

function App() {
  return (
    <HashRouter>
      <header className="app-bar">
        <Link to="/" className="app-bar__title">🍳 Chris Cooks</Link>
        <span className="app-bar__version">v{__APP_VERSION__}</span>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/recipe/:id/edit" element={<EditRecipe />} />
        </Routes>
      </main>
    </HashRouter>
  )
}

export default App
