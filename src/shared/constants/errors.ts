export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PATCH_FAILED: 'PATCH_FAILED',
  JAVA_NOT_FOUND: 'JAVA_NOT_FOUND',
  JAVA_VERSION_INVALID: 'JAVA_VERSION_INVALID',
  GAME_NOT_INSTALLED: 'GAME_NOT_INSTALLED',
  GAME_ALREADY_RUNNING: 'GAME_ALREADY_RUNNING',
  AUTH_FAILED: 'AUTH_FAILED',
  INVALID_CONFIG: 'INVALID_CONFIG',
  DISK_SPACE_INSUFFICIENT: 'DISK_SPACE_INSUFFICIENT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export class LauncherError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LauncherError';
  }
}

export function createError(code: ErrorCode, message: string, details?: Record<string, unknown>): LauncherError {
  return new LauncherError(message, code, details);
}
