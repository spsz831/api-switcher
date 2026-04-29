import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

if (!process.env.API_SWITCHER_RUNTIME_DIR) {
  process.env.API_SWITCHER_RUNTIME_DIR = path.join(repoRoot, '.dev-runtime')
}

const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(repoRoot, 'src', 'cli', 'index.ts')

const forwardedArgs = process.argv.slice(2).filter((argument, index) => !(index === 0 && argument === '--'))

const child = spawn(process.execPath, [tsxCliPath, cliEntryPath, ...forwardedArgs], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
