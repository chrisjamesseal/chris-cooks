import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db'

// Guard saved recipes against browser storage eviction (iOS Safari clears
// site data after ~7 days without a visit unless persistence is granted).
requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
