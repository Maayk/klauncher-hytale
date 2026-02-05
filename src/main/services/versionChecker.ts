import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import { configManager } from './configManager';
import logger from '../../shared/utils/logger';
import { CONFIG } from '../../shared/constants/config';
import { z } from 'zod';

interface ConfigVersionInfo {
  version: string;
  url: string;
  notes: string;
  mandatory: boolean;
}

interface AppConfig {
  launcher: {
    version: string;
    url: string;
    notes: string;
    mandatory: boolean;
  };
  api: {
    curseforge_key: string;
    curseforge_url: string;
    hytale_game_id: number;
  };
  hytale: {
    latest: ConfigVersionInfo;
    beta: ConfigVersionInfo;
  };
}

const AppConfigSchema = z.object({
  launcher: z.object({
    version: z.string(),
    url: z.string(),
    notes: z.string(),
    mandatory: z.boolean()
  }),
  api: z.object({
    curseforge_key: z.string(),
    curseforge_url: z.string(),
    hytale_game_id: z.number()
  }),
  hytale: z.object({
    latest: z.object({
      version: z.string(),
      url: z.string(),
      notes: z.string(),
      mandatory: z.boolean()
    }),
    beta: z.object({
      version: z.string(),
      url: z.string(),
      notes: z.string(),
      mandatory: z.boolean()
    })
  })
});

let appConfig: AppConfig | null = null;

export interface GameVersionInfo {
  version: string;
  lastUpdated: number;
  channel: 'latest' | 'beta';
}

export interface RemoteVersionInfo extends GameVersionInfo {
  downloadUrl: string;
  patchUrl?: string;
  fileSize: number;
  patchSize?: number;
}

export interface VersionCheckResult {
  needsUpdate: boolean;
  currentVersion?: GameVersionInfo;
  remoteVersion?: RemoteVersionInfo;
  updateType: 'none' | 'patch' | 'full';
  reason?: string;
}

export class VersionChecker {
  private versionFileCache: Map<string, GameVersionInfo>;

  constructor() {
    this.versionFileCache = new Map();
  }

  async getLatestVersion(channel: 'latest' | 'beta'): Promise<RemoteVersionInfo | null> {
    return this.getRemoteVersion(channel);
  }

  async checkForUpdates(gameDir: string, channel: 'latest' | 'beta'): Promise<VersionCheckResult> {
    return this.checkVersion(gameDir, channel);
  }

  async checkVersion(gameDir: string, channel: 'latest' | 'beta'): Promise<VersionCheckResult> {
    const currentVersion = await this.getLocalVersion(gameDir, channel);
    const remoteVersion = await this.getRemoteVersion(channel);

    if (!remoteVersion) {
      logger.error('Failed to fetch remote version', { channel });
      return {
        needsUpdate: false,
        currentVersion: currentVersion || undefined,
        updateType: 'none',
        reason: 'Remote version unavailable'
      };
    }

    if (!currentVersion) {
      logger.info('No local version found, full installation required', { channel });
      return {
        needsUpdate: true,
        currentVersion: undefined,
        remoteVersion,
        updateType: 'full',
        reason: 'First installation'
      };
    }

    if (currentVersion.version === remoteVersion.version) {
      logger.info('Game is up to date', { version: currentVersion.version });
      return {
        needsUpdate: false,
        currentVersion,
        remoteVersion,
        updateType: 'none',
        reason: 'Already up to date'
      };
    }

    if (currentVersion.channel !== channel) {
      logger.info('Channel change detected, full installation required', {
        oldChannel: currentVersion.channel,
        newChannel: channel
      });
      return {
        needsUpdate: true,
        currentVersion,
        remoteVersion,
        updateType: 'full',
        reason: 'Channel changed'
      };
    }

    if (remoteVersion.patchUrl && remoteVersion.patchSize && remoteVersion.patchSize < remoteVersion.fileSize) {
      logger.info('Patch available', {
        current: currentVersion.version,
        remote: remoteVersion.version,
        patchSize: remoteVersion.patchSize
      });
      return {
        needsUpdate: true,
        currentVersion,
        remoteVersion,
        updateType: 'patch',
        reason: `Update available: ${currentVersion.version} -> ${remoteVersion.version}`
      };
    }

    logger.info('Full update required', {
      current: currentVersion.version,
      remote: remoteVersion.version
    });
    return {
      needsUpdate: true,
      currentVersion,
      remoteVersion,
      updateType: 'full',
      reason: `Update available: ${currentVersion.version} -> ${remoteVersion.version}`
    };
  }

  async getLocalVersion(gameDir: string, channel: 'latest' | 'beta'): Promise<GameVersionInfo | null> {
    const cacheKey = `${gameDir}-${channel}`;
    const cached = this.versionFileCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.lastUpdated < 60000) {
      return cached;
    }

    const versionFilePath = path.join(gameDir, 'gameVersion.json');

    if (!existsSync(versionFilePath)) {
      logger.debug('Local version file not found', { versionFilePath });
      return null;
    }

    try {
      const content = await fs.readFile(versionFilePath, 'utf-8');
      const data = JSON.parse(content);

      const versionInfo: GameVersionInfo = {
        version: data.version,
        lastUpdated: Date.now(),
        channel: data.channel || 'latest'
      };

      this.versionFileCache.set(cacheKey, versionInfo);
      logger.debug('Local version loaded', { versionInfo });
      return versionInfo;
    } catch (error) {
      logger.error('Failed to read local version file', { versionFilePath, error });
      return null;
    }
  }

  async getRemoteVersion(channel: 'latest' | 'beta'): Promise<RemoteVersionInfo | null> {
    try {
      const config = await this.loadAppConfig();
      const versionInfo = config.hytale[channel];

      const remoteInfo: RemoteVersionInfo = {
        version: versionInfo.version,
        channel,
        downloadUrl: versionInfo.url,
        fileSize: 0,
        lastUpdated: Date.now()
      };

      logger.debug('Remote version loaded from config.json', { versionInfo: remoteInfo });
      return remoteInfo;
    } catch (error) {
      logger.error('Failed to load remote version from config.json', { channel, error });
      return null;
    }
  }

  private async loadAppConfig(): Promise<AppConfig> {
    if (appConfig) {
      return appConfig;
    }

    const configPaths = [
      path.join(process.resourcesPath, 'config.json'),
      path.join(app.getAppPath(), 'config.json'),
      path.join(process.cwd(), 'config.json')
    ];

    for (const configPath of configPaths) {
      try {
        if (existsSync(configPath)) {
          const content = await fs.readFile(configPath, 'utf-8');
          const parsed = JSON.parse(content);
          appConfig = AppConfigSchema.parse(parsed);
          logger.info('App config loaded', { configPath });
          return appConfig;
        }
      } catch (error) {
        logger.debug('Failed to load config from path', { configPath, error });
      }
    }

    throw new Error('No valid config.json found');
  }

  async updateLocalVersion(gameDir: string, version: string, channel: 'latest' | 'beta'): Promise<void> {
    const versionFilePath = path.join(gameDir, 'gameVersion.json');
    const versionInfo: GameVersionInfo = {
      version,
      channel,
      lastUpdated: Date.now()
    };

    await fs.mkdir(gameDir, { recursive: true });
    await fs.writeFile(versionFilePath, JSON.stringify(versionInfo, null, 2), 'utf-8');

    const cacheKey = `${gameDir}-${channel}`;
    this.versionFileCache.set(cacheKey, versionInfo);

    logger.info('Local version updated', { versionInfo, versionFilePath });
  }

  async clearCache(): Promise<void> {
    this.versionFileCache.clear();
  }

  async compareVersions(v1: string, v2: string): Promise<number> {
    const parseVersion = (v: string) => v.split('.').map(Number);
    const parts1 = parseVersion(v1);
    const parts2 = parseVersion(v2);

    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const p1 = parts1[i] ?? 0;
      const p2 = parts2[i] ?? 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }
}
