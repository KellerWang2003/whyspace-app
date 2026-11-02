import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Debug from './Debug'

// The debug window loads this page with #debug; the lab decisions window without.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#debug' ? <Debug /> : <App />}</StrictMode>
)
