import { z } from 'zod';

export const SettingsSchemaV1 = z.object({
  version: z.literal(1),
  gameDir: z.string().min(1, 'Game directory is required'),
  gameChannel: z.string().default('latest'),
  javaPath: z.string().optional(),
  language: z.enum(['pt-BR', 'en-US', 'es-ES']),
  windowBounds: z.object({
    width: z.number().min(800),
    height: z.number().min(600)
  }),
  modsEnabled: z.boolean(),
  maxDownloadSpeed: z.number().min(0).optional(),
  maxParallelDownloads: z.number().min(1).max(10).optional()
});

export const SettingsSchemaV2 = z.object({
  version: z.literal(2),
  gameDir: z.string().min(1, 'Game directory is required'),
  gameChannel: z.string().default('latest'),
  javaPath: z.string().optional(),
  useCustomJava: z.boolean().default(false),
  customJavaPath: z.string().optional(),
  language: z.enum(['pt-BR', 'en-US', 'es-ES']),
  windowBounds: z.object({
    width: z.number().min(800),
    height: z.number().min(600)
  }),
  modsEnabled: z.boolean(),
  maxDownloadSpeed: z.number().min(0).optional(),
  maxParallelDownloads: z.number().min(1).max(10).optional(),
  analyticsEnabled: z.boolean().default(false),
  autoUpdateEnabled: z.boolean().default(false),
  hideLauncher: z.boolean().default(false),
  playerUUID: z.string().optional(),
  playerName: z.string().min(1, 'Player name is required').default('Player'),
  // New Field for Base Setup URL
  setupUrl: z.string().optional()
});

export type SettingsV1 = z.infer<typeof SettingsSchemaV1>;
export type SettingsV2 = z.infer<typeof SettingsSchemaV2>;
export type Settings = SettingsV2;

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  gameDir: '.',
  gameChannel: 'latest',
  javaPath: '',
  useCustomJava: false,
  customJavaPath: '',
  language: 'pt-BR',
  windowBounds: { width: 1280, height: 720 },
  modsEnabled: true,
  maxDownloadSpeed: undefined,
  maxParallelDownloads: undefined,
  analyticsEnabled: false,
  autoUpdateEnabled: false,
  hideLauncher: false,
  playerUUID: '',
  playerName: 'Player',
  setupUrl: 'https://github.com/Maayk/klauncher-hytale/releases/download/initial/klauncher-base.zip'
};

// Game Version Tracking
export const GAME_VERSION_INFO_SCHEMA = z.object({
  version: z.coerce.number().int().nonnegative(),
  channel: z.string().default('latest'),
  installedAt: z.number().int().positive(),
  patchedAt: z.number().int().positive().optional(),
  build: z.string().optional() // Optional build hash/id
});

export const GAME_VERSIONS_MAP_SCHEMA = z.record(z.string(), GAME_VERSION_INFO_SCHEMA);

export type GameVersionInfo = z.infer<typeof GAME_VERSION_INFO_SCHEMA>;
export type GameVersionsMap = z.infer<typeof GAME_VERSIONS_MAP_SCHEMA>;
