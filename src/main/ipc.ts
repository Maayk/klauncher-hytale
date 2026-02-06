import { ipcMain, shell, dialog, app, BrowserWindow } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../shared/utils/logger';
import { IPC_CHANNELS } from '../shared/constants/channels';
import { gameLauncher, LaunchOptions, LaunchProgress } from './services/gameLauncher';
import { VersionChecker } from './services/versionChecker';
import { configManager } from './services/configManager';
import { javaManager } from './services/javaManager';
import { SettingsV2 } from '../shared/schemas/config';
import { checkForUpdates, getRemoteConfig, getHytaleConfig } from './services/updaterService';
import { pathManager } from './services/pathManager';

const execAsync = promisify(exec);

let cachedGpuInfo: GpuInfo | null = null;
let gpuInfoPromise: Promise<GpuInfo | string> | null = null;

interface GpuInfo {
  all: string[];
  integrated: string | null;
  dedicated: string | null;
}

// Lazy initialization variables
const versionChecker = new VersionChecker();

export function setupIpcHandlers(): void {
  logger.info('Setting up IPC handlers');

  // Initialize services lazily to ensure paths are correct

  ipcMain.handle(IPC_CHANNELS.GAME.LAUNCH, async (event, gameChannel?: string, overrideUsername?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error('No window found');
    }

    try {
      await configManager.initialize();
      const settings = await configManager.getSettings();

      const selectedChannel = gameChannel || settings.gameChannel;
      const username = overrideUsername || configManager.getPlayerName();

      const options: LaunchOptions = {
        username,
        gameChannel: selectedChannel,
        useCustomJava: settings.useCustomJava,
        customJavaPath: settings.customJavaPath,
        hideLauncher: settings.hideLauncher,
      };

      await gameLauncher.launchGame(window, options, {
        onProgress: (progress: LaunchProgress) => {
          event.sender.send(IPC_CHANNELS.GAME.PROGRESS, progress);
        },
        onStatus: (status: string) => {
          event.sender.send(IPC_CHANNELS.GAME.STATUS, status);
        },
        onError: (error: string) => {
          event.sender.send(IPC_CHANNELS.GAME.ERROR, error);
        },
        onSuccess: (message: string) => {
          event.sender.send(IPC_CHANNELS.GAME.SUCCESS, message);
        },
        onStopped: () => {
          event.sender.send(IPC_CHANNELS.GAME.STOPPED);
        },
      });
    } catch (error) {
      const message = `Launch failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Game launch failed', { error });
      event.sender.send(IPC_CHANNELS.GAME.ERROR, message);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.KILL, async () => {
    try {
      await gameLauncher.killGame();
      logger.info('Game killed');
      return { success: true };
    } catch (error) {
      logger.error('Failed to kill game', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.IS_RUNNING, async () => {
    return gameLauncher.isGameRunning();
  });

  ipcMain.handle(IPC_CHANNELS.VERSION.GET, async (_event, channel: 'latest' | 'beta' = 'latest') => {
    try {
      const versionInfo = await versionChecker.getLatestVersion(channel);
      return versionInfo;
    } catch (error) {
      logger.error('Failed to get version', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.VERSION.CHECK, async (_event, gameChannel: 'latest' | 'beta' = 'latest') => {
    try {
      const gameDir = pathManager.getGameDir(gameChannel);
      const checkResult = await versionChecker.checkForUpdates(gameDir, gameChannel);
      return checkResult;
    } catch (error) {
      logger.error('Failed to check version', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.REPAIR, async (event, channel: 'latest' | 'beta' = 'latest') => {
    try {
      const fs = await import('fs-extra');

      await configManager.initialize();
      const settings = configManager.getSettings();
      const targetChannel = channel || settings.gameChannel || 'latest';

      const gameDir = pathManager.getGameDir(targetChannel);

      logger.info('Starting game repair', { targetChannel, gameDir });

      // 0. Ensure game is not running
      if (gameLauncher.isGameRunning()) {
        logger.info('Game is running, attempting to kill before repair...');
        await gameLauncher.killGame();
        // Give it a moment to release file handles
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 1. Force cleanup of the directory with Retry logic for Windows EBUSY
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          if (await fs.pathExists(gameDir)) {
            logger.info(`Deleting existing game directory (Attempt ${i + 1}/${maxRetries})...`, { gameDir });
            await fs.remove(gameDir);
          }
          break; // Success
        } catch (err: any) {
          if (i === maxRetries - 1) throw err; // Re-throw on last failure

          logger.warn(`Failed to delete directory (Attempt ${i + 1}), retrying in 1s...`, { error: err.message });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 2. We do NOT re-create or patch. Just return success.
      // The user will click "Play", which will detect missing files and reinstall.
      logger.info('Game directory deleted. Repair (reset) successful.', { targetChannel });
      return { success: true };
    } catch (error) {
      const message = `Repair failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Game repair failed', { error });
      event.sender.send(IPC_CHANNELS.GAME.ERROR, message);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
    try {
      await configManager.initialize();
      const settings = await configManager.getSettings();
      return settings;
    } catch (error) {
      logger.error('Failed to get settings', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET, async (_event, updates: Partial<SettingsV2>) => {
    try {
      await configManager.updateSettings(updates);
      const updatedSettings = await configManager.getSettings();
      logger.info('Settings updated', { updates });
      return updatedSettings;
    } catch (error) {
      logger.error('Failed to update settings', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.RESET, async () => {
    try {
      const { DEFAULT_SETTINGS } = await import('../shared/schemas/config');
      await configManager.updateSettings(DEFAULT_SETTINGS);
      logger.info('Settings reset to defaults');
      return { success: true };
    } catch (error) {
      logger.error('Failed to reset settings', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.JAVA.SELECT_PATH, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Selecione o executável do Java',
        filters: [{ name: 'Java Executable', extensions: ['exe'] }],
        properties: ['openFile'],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const javaPath = result.filePaths[0];
        await configManager.updateSettings({
          useCustomJava: true,
          customJavaPath: javaPath,
        });
        logger.info('Custom Java path selected', { javaPath });
        return { success: true, path: javaPath };
      }

      return { success: false };
    } catch (error) {
      logger.error('Failed to select Java path', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.JAVA.GET_VERSION, async () => {
    try {
      const version = await javaManager.getJavaVersion();
      return version;
    } catch (error) {
      logger.error('Failed to get Java version', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.JAVA.GET_PATH, async () => {
    try {
      const path = await javaManager.getJavaPath();
      return path;
    } catch (error) {
      logger.error('Failed to get Java path', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.OPEN_LOCATION, async () => {
    try {
      const hytaleRoot = pathManager.getHytaleRoot();
      await shell.openPath(hytaleRoot);
      logger.info('Opened game location', { path: hytaleRoot });
      return { success: true };
    } catch (error) {
      logger.error('Failed to open game location', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.GET_VERSIONS, async () => {
    try {
      return await pathManager.getAvailableVersions();
    } catch (error) {
      logger.error('Failed to get available versions', { error });
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.GAME.GET_GPU_INFO, async () => {
    try {
      const gpuInfo = await loadGpuInfo();
      return gpuInfo;
    } catch (error) {
      logger.error('Failed to get GPU info', { error });
      throw error;
    }
  });

  async function loadGpuInfo(): Promise<GpuInfo | string> {
    if (cachedGpuInfo) return cachedGpuInfo;
    if (gpuInfoPromise) return gpuInfoPromise;

    gpuInfoPromise = new Promise((resolve) => {
      if (process.platform === 'win32') {
        execAsync('wmic path win32_VideoController get name')
          .then(({ stdout }) => {
            const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l && l !== 'Name');

            const gpus: GpuInfo = {
              all: lines,
              integrated: lines.find((l) => l.match(/Intel|Display/i)) || null,
              dedicated: lines.find((l) => l.match(/NVIDIA|AMD|Radeon RX/i)) || null
            };

            if (!gpus.integrated && lines.length > 0) gpus.integrated = lines[0];
            if (!gpus.dedicated && lines.length > 1) gpus.dedicated = lines[lines.length - 1];

            cachedGpuInfo = gpus;
            logger.info('GPU Info Loaded', { gpus });
            resolve(gpus);
          })
          .catch((error) => {
            logger.error('WMIC Error', { error });
            resolve('GPU Detection Failed');
          });
      } else {
        // Basic Linux/Mac Fallback
        // We could use lspci on Linux, but strictly speaking "Unsupported" is fine 
        // as long as it doesn't crash.
        // Let's check for lspci just in case
        execAsync('lspci | grep -i vga')
          .then(({ stdout }) => {
            const lines = stdout.split('\n').filter(l => l.trim().length > 0);
            const gpus: GpuInfo = {
              all: lines,
              integrated: null,
              dedicated: null
            };
            resolve(gpus);
          })
          .catch(() => {
            resolve('Unsupported Platform');
          });
      }
    });

    return gpuInfoPromise;
  }

  ipcMain.handle(IPC_CHANNELS.JAVA.OPEN_LOCATION, async () => {
    try {
      const javaRuntimePath = pathManager.getJreDir();
      await shell.openPath(javaRuntimePath);
      logger.info('Opened Java location', { path: javaRuntimePath });
      return { success: true };
    } catch (error) {
      logger.error('Failed to open Java location', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATES.CHECK, async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      const updateInfo = await checkForUpdates(window || null);
      return updateInfo;
    } catch (error) {
      logger.error('Failed to check for updates', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATES.GET_CONFIG, async () => {
    try {
      const config = getRemoteConfig();
      return config;
    } catch (error) {
      logger.error('Failed to get remote config', { error });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATES.GET_HYTALE_CONFIG, async (_event, channel: 'latest' | 'beta' = 'latest') => {
    try {
      const config = getHytaleConfig(channel);
      return config;
    } catch (error) {
      logger.error('Failed to get Hytale config', { error });
      throw error;
    }
  });

  logger.info('IPC handlers registered');
}
