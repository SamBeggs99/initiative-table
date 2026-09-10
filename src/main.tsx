import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CloudAuthProvider } from './components/CloudAuthProvider'
import { TableErrorBoundary } from './components/TableErrorBoundary'
import { ensureBundledSeeded } from './lib/bestiary'
import { installUuidPolyfill, redirectInsecureToHttps } from './lib/uuid'
import { registerServiceWorker } from './lib/pwa'
import { waitForPersistHydration } from './store'
import { migrateInlinePortraits } from './lib/portrait-migrate'

redirectInsecureToHttps()
installUuidPolyfill()

void ensureBundledSeeded()
registerServiceWorker()

/*
 * Move inline base64 portraits into the portrait store. Also runs after a cloud
 * pull in CloudSyncGate; this covers the local-only install, which never passes
 * through that gate. Idempotent either way.
 */
void waitForPersistHydration().then(() =>
  migrateInlinePortraits().catch((err) => {
    console.warn(
      'Portrait migration failed; inline portraits still render',
      err instanceof Error ? err.message : err,
    )
  }),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TableErrorBoundary>
      <CloudAuthProvider>
        <App />
      </CloudAuthProvider>
    </TableErrorBoundary>
  </StrictMode>,
)

