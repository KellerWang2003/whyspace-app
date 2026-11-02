import './pill.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Pill } from './Pill'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pill />
  </StrictMode>
)
