import path from 'node:path';
import { app } from 'electron';
import { CONFIG } from './config';

export const PATHS = {
  get appData(): string {
    return path.join(app.getPath('appData'), 'Kyamtale');
  },

  get configDir(): string {
    return this.appData;
  },

  get logsDir(): string {
    return path.join(this.appData, 'logs');
  },

  get cacheDir(): string {
    return path.join(this.appData, 'cache');
  },

  get settingsFile(): string {
    return path.join(this.configDir, 'settings.json');
  },

  get gameVersionFile(): string {
    return path.join(this.configDir, 'gameVersion.json');
  },

  get jreDir(): string {
    return path.join(this.appData, 'jre');
  },

  get defaultGameDir(): string {
    return path.join(this.appData, 'game');
  },

  get modsDir(): string {
    return path.join(this.defaultGameDir, 'mods');
  },

  get tempDir(): string {
    return path.join(this.appData, 'temp');
  },

  get cacheIndexPath(): string {
    return path.join(this.cacheDir, 'index.json');
  },

  getPatchFlagFile(gamePath: string): string {
    return gamePath + CONFIG.PATCH_FLAG_FILE;
  },

  getClientPath(gameDir: string): string {
    return path.join(gameDir, 'HytaleClient.exe');
  },

  getServerPath(gameDir: string): string {
    return path.join(gameDir, 'HytaleServer.jar');
  },

  getLocalArchivePath(gameDir: string): string {
    return path.join(gameDir, 'local.zip');
  },

  getTempExtractionPath(gameDir: string): string {
    return path.join(gameDir, '.patch_temp');
  }
} as const;
