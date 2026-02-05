import { SettingsV1, SettingsV2 } from './config';

export const migrations = {
  2: (data: SettingsV1): SettingsV2 => ({
    ...data,
    version: 2,
    analyticsEnabled: false,
    autoUpdateEnabled: false,
    useCustomJava: false,
    hideLauncher: false,
    playerName: 'Player'
  })
};

export type MigrationFunction = (data: unknown) => unknown;

export const MIGRATION_REGISTRY: Record<number, MigrationFunction> = {
  2: migrations[2] as MigrationFunction
};

export const LATEST_VERSION = 2;
