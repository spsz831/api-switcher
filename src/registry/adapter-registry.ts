import type { PlatformAdapter } from '../types/adapter'
import type { PlatformName } from '../types/platform'
import { ClaudeAdapter } from '../adapters/claude/claude.adapter'
import { CodexAdapter } from '../adapters/codex/codex.adapter'
import { GeminiAdapter } from '../adapters/gemini/gemini.adapter'

export class AdapterRegistry {
  private readonly adapters = new Map<PlatformName, PlatformAdapter>()

  constructor(adapters: PlatformAdapter[] = [new ClaudeAdapter(), new CodexAdapter(), new GeminiAdapter()]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.platform, adapter)
    }
  }

  get(platform: PlatformName): PlatformAdapter {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      throw new Error(`未注册的平台适配器：${platform}`)
    }

    return adapter
  }
}
