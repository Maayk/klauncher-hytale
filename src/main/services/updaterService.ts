import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import logger from '../../shared/utils/logger';
import * as fs from 'fs/promises';

interface LauncherConfig {
  version: string;
  url: string;
  notes?: string;
  mandatory?: boolean;
}

interface RemoteConfig {
  launcher: LauncherConfig;
  api?: {
    curseforge_key?: string;
    curseforge_url?: string;
    hytale_game_id?: number;
  };
  hytale?: {
    latest?: {
      version: string;
      url: string;
      notes?: string;
      mandatory?: boolean;
    };
    beta?: {
      version: string;
      url: string;
      notes?: string;
      mandatory?: boolean;
    };
  };
}

const UPDATE_CONFIG_URL = 'https://api.battlylauncher.com/hytale/config';

let globalRemoteConfig: RemoteConfig | null = null;

async function fetchRemoteConfig(): Promise<RemoteConfig> {
  if (globalRemoteConfig) {
    return globalRemoteConfig;
  }

  try {
    logger.info('Fetching remote config', { url: UPDATE_CONFIG_URL });

    const { default: axios } = await import('axios');
    const response = await axios.get(UPDATE_CONFIG_URL);
    globalRemoteConfig = response.data;

    logger.info('Remote config fetched', {
      launcherVersion: response.data.launcher?.version,
      hytaleLatest: response.data.hytale?.latest?.version,
      hytaleBeta: response.data.hytale?.beta?.version
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to fetch remote config', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;

    if (n1 > n2) return 1;
    if (n2 > n1) return -1;
  }

  return 0;
}

async function getLauncherVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(app.getAppPath(), 'package.json');
    const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
    const packageData = JSON.parse(packageJson);
    return packageData.version;
  } catch (error) {
    logger.error('Failed to read package.json', {
      error: error instanceof Error ? error.message : String(error)
    });
    return '0.0.0';
  }
}

async function checkForUpdates(win: BrowserWindow | null): Promise<LauncherConfig | null> {
  try {
    const remoteConfig = await fetchRemoteConfig();
    const currentVersion = await getLauncherVersion();

    const launcherConfig = remoteConfig.launcher;
    const remoteVersion = launcherConfig.version;

    logger.info('Checking for updates', {
      current: currentVersion,
      remote: remoteVersion
    });

    if (compareVersions(remoteVersion, currentVersion) > 0) {
      logger.info('Update available', {
        remoteVersion,
        currentVersion,
        url: launcherConfig.url,
        mandatory: launcherConfig.mandatory
      });

      if (win && !win.isDestroyed()) {
        win.webContents.send('update-available', launcherConfig);
      }

      return launcherConfig;
    }

    logger.info('No updates available');
    return null;
  } catch (error) {
    logger.error('Failed to check for updates', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function getRemoteConfig(): RemoteConfig | null {
  return globalRemoteConfig;
}

function getHytaleConfig(channel: string): LauncherConfig | null {
  const remoteConfig = getRemoteConfig();
  if (!remoteConfig || !remoteConfig.hytale) {
    return null;
  }

  const normalizedChannel = channel === 'beta' ? 'beta' : 'latest';
  if (normalizedChannel === 'beta') {
    return remoteConfig.hytale.beta || remoteConfig.hytale.latest || null;
  }
  return remoteConfig.hytale.latest || null;
}

async function getLocalConfigPath(): Promise<string> {
  const appPath = app.getAppPath();
  const configPath = path.join(appPath, 'config.json');

  try {
    await fs.access(configPath);
    return configPath;
  } catch {
    const resourcesPath = process.resourcesPath;
    const resourcesConfigPath = path.join(resourcesPath, 'config.json');

    try {
      await fs.access(resourcesConfigPath);
      return resourcesConfigPath;
    } catch {
      return configPath;
    }
  }
}

async function loadLocalConfig(): Promise<RemoteConfig | null> {
  try {
    const configPath = await getLocalConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    logger.warn('Failed to load local config', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export {
  checkForUpdates,
  getRemoteConfig,
  getHytaleConfig,
  loadLocalConfig,
  getLocalConfigPath
};

export type { LauncherConfig, RemoteConfig };
