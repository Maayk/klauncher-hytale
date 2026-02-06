import path from 'node:path';
import fs from 'fs-extra';
import { app } from 'electron';
import { CONFIG } from '../../shared/constants/config';
import logger from '../../shared/utils/logger';
import { configManager } from './configManager';

export class PathManager {

  constructor() {

  }

  getHytaleRoot(): string {
    return app.getPath('userData');
  }

  getGameDir(channel: string): string {
    return path.join(this.getHytaleRoot(), ...CONFIG.GAME_PATH_PARTS, channel);
  }

  getJreDir(): string {
    return path.join(this.getHytaleRoot(), ...CONFIG.JRE_PATH_PARTS);
  }

  getUserDataDir(): string {
    return path.join(this.getHytaleRoot(), 'UserData');
  }

  getCacheDir(): string {
    return path.join(this.getHytaleRoot(), 'cache');
  }

  getToolsDir(): string {
    return path.join(this.getHytaleRoot(), 'tools');
  }

  getButlerPath(): string {
    const butlerBin = process.platform === 'win32' ? 'butler.exe' : 'butler';
    return path.join(this.getToolsDir(), butlerBin);
  }

  getJavaExecutable(): string {
    const javaBin = process.platform === 'win32' ? 'java.exe' : 'java';
    return path.join(this.getJreDir(), 'bin', javaBin);
  }

  getClientExecutable(gameDir: string): string {
    const clientBin = process.platform === 'win32' ? 'HytaleClient.exe' : 'HytaleClient';
    return path.join(gameDir, 'Client', clientBin);
  }

  getServerJar(gameDir: string): string {
    return path.join(gameDir, 'Server', 'HytaleServer.jar');
  }

  getClientPatchFlag(clientPath: string): string {
    return clientPath + CONFIG.PATCH_FLAG_FILE;
  }

  getServerPatchFlag(serverPath: string): string {
    const serverDir = path.dirname(serverPath);
    return path.join(serverDir, CONFIG.SERVER_PATCH_FLAG_FILE);
  }

  getLocalConfigPath(): string {
    const appPath = app.getAppPath();
    const configPath = path.join(appPath, 'config.json');

    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const resourcesPath = path.join(process.resourcesPath || appPath, 'config.json');
    if (fs.existsSync(resourcesPath)) {
      return resourcesPath;
    }

    const cwdPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }



    return configPath;
  }

  getLocalCdnDir(): string {
    return path.join(app.getAppPath(), 'cdn');
  }

  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.getHytaleRoot(),
      this.getCacheDir(),
      this.getToolsDir(),
      this.getUserDataDir(),
      this.getGameDir('latest'),
      this.getGameDir('beta')
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }

    logger.debug('Directories ensured', { dirs });
  }

  getButlerDownloadUrl(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      return 'https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default';
    }

    if (platform === 'darwin') {
      const archPart = arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64';
      return `https://broth.itch.zone/butler/${archPart}/LATEST/archive/default`;
    }

    if (platform === 'linux') {
      return 'https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default';
    }

    throw new Error('Unsupported platform for Butler');
  }

  getButlerPatchUrlBase(): string {
    const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
    return `${CONFIG.BUTLER_PATCH_URL_BASE}${os}/amd64/release/0/`;
  }

  async resolveLocalArchivePath(channel: string): Promise<{ path: string, isRemote: false } | { url: string, isRemote: true } | null> {
    const configPath = this.getLocalConfigPath();

    if (fs.existsSync(configPath)) {
      try {
        const cfg = await fs.readJson(configPath);
        if (cfg.hytale && cfg.hytale[channel] && cfg.hytale[channel].url) {
          const url = cfg.hytale[channel].url;

          if (/^https?:\/\//i.test(url)) {
            return { url, isRemote: true };
          }

          if (url.startsWith('file://')) {
            const filePath = decodeURIComponent(url.replace('file://', ''));
            if (fs.existsSync(filePath)) {
              return { path: filePath, isRemote: false };
            }
          }

          if (path.isAbsolute(url) && fs.existsSync(url)) {
            return { path: url, isRemote: false };
          }

          const relativePath = path.join(app.getAppPath(), url);
          if (fs.existsSync(relativePath)) {
            return { path: relativePath, isRemote: false };
          }
        }
      } catch (error) {
        logger.warn('Failed to read local config', { error });
      }
    }

    const cdnDir = this.getLocalCdnDir();
    if (fs.existsSync(cdnDir)) {
      const entries = await fs.readdir(cdnDir);
      const archives = entries.filter((file) => /\.zip$/i.test(file));

      if (archives.length > 0) {
        const sorted = await Promise.all(archives.map(async (file) => {
          const fullPath = path.join(cdnDir, file);
          const stat = await fs.stat(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        }));

        sorted.sort((a, b) => b.mtime - a.mtime);
        return { path: sorted[0].fullPath, isRemote: false };
      }
    }

    return null;
  }

  async getAvailableVersions(): Promise<{ id: string, label: string, version: string }[]> {
    const versions: { id: string, label: string, version: string }[] = [];
    // Define core channels that are ALWAYS available via CDN
    const coreChannels = ['latest', 'beta'];
    const seenChannels = new Set<string>();

    for (const channel of coreChannels) {
      const label = channel === 'beta' ? 'Pre-Release' : 'Latest';
      let versionText = 'Not Installed';

      // 1. Check ConfigManager (Installed Version)
      const info = configManager.getGameVersion(channel);
      if (info) {
        versionText = `Build ${info.version}`;
      } else {
        // 2. Check Legacy Config (Custom ZIP URL) - purely for display
        const legacyConfigPath = this.getLocalConfigPath();
        if (fs.existsSync(legacyConfigPath)) {
          try {
            const cfg = await fs.readJson(legacyConfigPath);
            if (cfg.hytale && cfg.hytale[channel] && cfg.hytale[channel].version) {
              versionText = cfg.hytale[channel].version;
            }
          } catch { } // Ignore read errors
        }
      }

      versions.push({
        id: channel,
        label: label,
        version: versionText
      });
      seenChannels.add(channel);
    }

    // 3. Add any OTHER channels defined in config.json that aren't core (e.g. custom user channels)
    const legacyConfigPath = this.getLocalConfigPath();
    if (fs.existsSync(legacyConfigPath)) {
      try {
        const cfg = await fs.readJson(legacyConfigPath);
        if (cfg.hytale) {
          for (const key of Object.keys(cfg.hytale)) {
            if (!seenChannels.has(key)) {
              versions.push({
                id: key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                version: cfg.hytale[key].version || 'External'
              });
              seenChannels.add(key);
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to read legacy config for extra versions', { error });
      }
    }

    return versions;
  }
}

export const pathManager = new PathManager();