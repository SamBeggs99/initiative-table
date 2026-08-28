import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CloudAuthProvider } from './components/CloudAuthProvider'
import { ensureBundledSeeded } from './lib/bestiary'

void ensureBundledSeeded()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudAuthProvider>
      <App />
    </CloudAuthProvider>
  </StrictMode>,
)

