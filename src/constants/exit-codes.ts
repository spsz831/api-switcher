export const EXIT_CODES = {
  success: 0,
  businessFailure: 1,
  runtimeFailure: 2,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

export function mapResultToExitCode(ok: boolean, isRuntimeError = false): ExitCode {
  if (ok) {
    return EXIT_CODES.success
  }

  return isRuntimeError ? EXIT_CODES.runtimeFailure : EXIT_CODES.businessFailure
}
