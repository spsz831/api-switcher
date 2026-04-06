import type { PlatformCapabilities } from '../types/capabilities'
import type { PlatformName } from '../types/platform'

export const SUPPORTED_PLATFORMS: PlatformName[] = ['claude', 'codex', 'gemini']

export const DEFAULT_CAPABILITIES: Record<PlatformName, PlatformCapabilities> = {
  claude: {
    supportsMultiFileWrite: false,
    supportsRollback: true,
    supportsCurrentDetection: true,
    supportsPartialMerge: true,
  },
  codex: {
    supportsMultiFileWrite: true,
    supportsRollback: true,
    supportsCurrentDetection: false,
    supportsPartialMerge: false,
  },
  gemini: {
    supportsMultiFileWrite: false,
    supportsRollback: true,
    supportsCurrentDetection: false,
    supportsPartialMerge: true,
  },
}
