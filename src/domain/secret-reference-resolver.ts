export type SecretReferenceResolutionStatus = 'resolved' | 'missing' | 'unsupported-scheme'

export interface SecretReferenceResolution {
  reference: string
  status: SecretReferenceResolutionStatus
  scheme?: string
}

export interface SecretReferenceResolver {
  resolve(reference: string): SecretReferenceResolution
}

function parseScheme(reference: string): string | undefined {
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(reference)
  return match?.[1]?.toLowerCase()
}

export class EnvSecretReferenceResolver implements SecretReferenceResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  resolve(reference: string): SecretReferenceResolution {
    const trimmed = reference.trim()
    const scheme = parseScheme(trimmed)

    if (scheme !== 'env') {
      return {
        reference: trimmed,
        status: 'unsupported-scheme',
        scheme,
      }
    }

    const name = trimmed.slice('env://'.length).trim()
    const value = name ? this.env[name] : undefined
    return {
      reference: trimmed,
      status: value && value.trim().length > 0 ? 'resolved' : 'missing',
      scheme,
    }
  }
}

export const defaultSecretReferenceResolver = new EnvSecretReferenceResolver()
