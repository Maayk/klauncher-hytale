export const CONFIG = {
  APP_NAME: 'KyamTale Launcher',
  APP_VERSION: '1.0.0',
  GAME_NAME: 'Hytale',

  PATCH_DOMAIN: 'kyamtale.com',
  ORIGINAL_DOMAIN: 'hytale.com',
  TARGET_DOMAIN: 'sanasol.ws',
  TARGET_DISCORD: '.gg/hytale',

  PATCH_FLAG_FILE: '.patched_custom',
  SERVER_PATCH_FLAG_FILE: 'patched_server.json',

  MIN_JAVA_VERSION: 17,

  BUTLER_BASE_URL: 'https://files.hytale.com/',
  BUTLER_PRIMARY_PATCH: '4.pwr',
  BUTLER_FALLBACK_PATCH: '5.pwr',
  BUTLER_PATCH_URL_BASE: 'https://game-patches.hytale.com/patches/',

  AUTH_URL: 'https://auth.hytale.com',
  SESSION_URL: 'https://sessions.sanasol.ws',

  VERSION_API_URL: 'https://launchermeta.mojang.com/mc/game/version_manifest',

  CURSEFORGE_API_BASE: 'https://api.curseforge.com/v1',
  CURSEFORGE_GAME_ID: 459860,

  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 1000,
  RETRY_MAX_DELAY: 30000,

  CACHE_TTL: 24 * 60 * 60 * 1000,

  DEFAULT_PARALLEL_DOWNLOADS: 3,
  MAX_PARALLEL_DOWNLOADS: 10,

  CHUNK_SIZE: 1024 * 1024,

  BANDWIDTH_THROTTLE_INTERVAL: 100,

  PATCH_CONFIG: {
    EXE: {
      pattern: 'hytale.com',
      replacement: 'sanasol.ws',
      encoding: 'utf16le' as const
    },
    JAR: {
      pattern: 'hytale.com',
      replacement: 'sanasol.ws',
      encoding: 'utf8' as const
    }
  },

  GAME_PATH_PARTS: ['install', 'release', 'package', 'game'] as const,
  JRE_PATH_PARTS: ['install', 'release', 'package', 'jre', 'latest'] as const
} as const;

export const GAME_CHANNELS = {
  LATEST: 'latest',
  BETA: 'beta'
} as const;

export type GameChannel = typeof GAME_CHANNELS[keyof typeof GAME_CHANNELS];
