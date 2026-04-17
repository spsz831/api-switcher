import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('package metadata', () => {
  it('points the CLI bin to the built entrypoint', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      bin?: Record<string, string>
    }

    expect(packageJson.bin?.['api-switcher']).toBe('dist/src/cli/index.js')
  })
})
