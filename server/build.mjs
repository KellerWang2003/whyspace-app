// Builds the hosted server with Vercel's Build Output API. Runs on Vercel during deploy
// (and locally for checking): bundles server/api.ts into one function that handles every path.
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

const out = '.vercel/output'
const fn = `${out}/functions/api.func`
rmSync(out, { recursive: true, force: true })
mkdirSync(fn, { recursive: true })

await build({
  entryPoints: ['server/api.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Some bundled dependencies still call require().
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  }
})

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    maxDuration: 30
  })
)
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [{ src: '/(.*)', dest: '/api?path=/$1' }]
  })
)
