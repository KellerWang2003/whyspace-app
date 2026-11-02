// Starts `electron-vite dev`. On macOS it first makes a copy of the Electron app named after this
// app, so the Dock, the menu bar and the app switcher say Whyspace instead of Electron. The copy
// is an APFS clone, so it takes almost no disk space, and node_modules/electron is left as it is.
// Packaged builds get the name from electron-builder instead.
import { execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const env = { ...process.env }

if (process.platform === 'darwin' && !env.ELECTRON_EXEC_PATH) {
  const { productName } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const { version } = require('electron/package.json')
  // require('electron') is the path to .../Electron.app/Contents/MacOS/Electron.
  const source = require('electron').replace(/\/Contents\/MacOS\/[^/]+$/, '')
  const dir = join(root, 'node_modules', '.dev-app', version)
  const bundle = join(dir, `${productName}.app`)
  if (!existsSync(join(dir, 'ready'))) {
    mkdirSync(dir, { recursive: true })
    try {
      execFileSync('cp', ['-cR', source, bundle])
    } catch {
      execFileSync('cp', ['-R', source, bundle])
    }
    const plist = join(bundle, 'Contents', 'Info.plist')
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('plutil', ['-replace', key, '-string', productName, plist])
    }
    // Tell Launch Services about the copy, so the Dock reads its name.
    execFileSync(
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-f', bundle]
    )
    writeFileSync(join(dir, 'ready'), '')
  }
  env.ELECTRON_EXEC_PATH = join(bundle, 'Contents', 'MacOS', 'Electron')
}

const child = spawn(
  process.execPath,
  [
    join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
    'dev',
    ...process.argv.slice(2)
  ],
  { stdio: 'inherit', env }
)
child.on('exit', (code) => process.exit(code ?? 0))
