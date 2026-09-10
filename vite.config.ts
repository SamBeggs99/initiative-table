/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Emit `sw.js` with a precache list of the shell assets this build actually
 * produced. Hand-rolled instead of vite-plugin-pwa because the project rule is
 * to ask before adding a dependency, and the policy is small enough to own.
 *
 * Precache is the shell only — entry JS/CSS, fonts, icons, manifest. The two
 * multi-megabyte Nethys snapshots are lazily imported and get cached on first
 * use by the runtime rule instead, so installing the app does not pull 3.5 MB.
 */
function serviceWorker(): Plugin {
  const PRECACHE_EXTRA = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/favicon-32.png',
    '/favicon-180.png',
    '/fonts/ibm-plex-sans-var-latin.woff2',
    '/fonts/jetbrains-mono-var-latin.woff2',
    '/fonts/fraunces-var-latin.woff2',
  ]

  return {
    name: 'dm-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      /*
       * The entry chunk plus every chunk it *statically* imports, transitively.
       * Precaching only `isEntry` is not enough: Vite splits shared static
       * imports into their own chunks (systems, spells, …), so an offline boot
       * fetched the entry from cache and then died on a missing sibling —
       * cached HTML, blank page. `dynamicImports` are deliberately excluded;
       * the lazy editors and the multi-megabyte catalogs get cached on first
       * use by the runtime rule instead.
       */
      const shell = new Set<string>()

      const walk = (fileName: string) => {
        if (shell.has(`/${fileName}`)) return
        const output = bundle[fileName]
        if (!output || output.type !== 'chunk') return
        shell.add(`/${fileName}`)
        for (const imported of output.imports) walk(imported)
      }

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'chunk' && output.isEntry) walk(fileName)
        if (output.type === 'asset' && fileName.endsWith('.css')) {
          shell.add(`/${fileName}`)
        }
      }

      const manifest = [...new Set([...PRECACHE_EXTRA, ...shell])]
      const version = createHash('sha1')
        .update(manifest.join('|'))
        .digest('hex')
        .slice(0, 12)

      const template = readFileSync('scripts/sw-template.js', 'utf8')
      const source = template
        .replaceAll('__SW_MANIFEST__', JSON.stringify(manifest, null, 2))
        .replaceAll('__SW_VERSION__', version)

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  // Custom domain (dm-multitool.com) is served at the site root.
  base: '/',
  plugins: [react(), tailwindcss(), serviceWorker()],
  // Matches the redirect URL registered in Supabase and documented in the
  // README; the Vite default of 5173 would fail the auth callback locally.
  server: { port: 5188 },
  build: {
    // The entry chunk is the thing a DM waits on before round 1. Keep the
    // warning tight enough that a stray static import of a catalog is noticed.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
