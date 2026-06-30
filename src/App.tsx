import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
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
        </Routes>
      </main>
    </HashRouter>
  )
}

export default App
