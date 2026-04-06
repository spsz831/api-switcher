import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir } from './file-system'

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)

  await ensureDir(dir)
  await fs.writeFile(tmpPath, content, 'utf8')
  await fs.rename(tmpPath, filePath)
}
