import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Debug from './Debug'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Debug />
  </StrictMode>
)
