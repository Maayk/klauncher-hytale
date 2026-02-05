import { z } from 'zod';

export const SettingsSchemaV1 = z.object({
  version: z.literal(1),
  gameDir: z.string().min(1, 'Game directory is required'),
  gameChannel: z.enum(['latest', 'beta']),
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
  gameChannel: z.enum(['latest', 'beta']),
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
  setupUrl: 'https://github.com/Maayk/kyam-launcher/releases/download/Client/setup-base.zip'
};

export const GAME_VERSION_SCHEMA = z.object({
  version: z.string().min(1),
  channel: z.enum(['latest', 'beta']),
  installedAt: z.number().int().positive(),
  patchedAt: z.number().int().positive().optional()
});

export type GameVersion = z.infer<typeof GAME_VERSION_SCHEMA>;
