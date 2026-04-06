import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value)
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  if (!(await pathExists(filePath))) {
    return cloneJsonValue(fallback)
  }

  const content = await fs.readFile(filePath, 'utf8')
  if (!content.trim()) {
    return cloneJsonValue(fallback)
  }

  return JSON.parse(content) as T
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf8')
}

export async function readTextFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null
  }

  return fs.readFile(filePath, 'utf8')
}

export async function removeFile(filePath: string): Promise<void> {
  if (await pathExists(filePath)) {
    await fs.unlink(filePath)
  }
}
