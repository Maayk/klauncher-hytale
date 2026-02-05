import path from 'node:path';
import fs from 'fs-extra';
import { app } from 'electron';
import { CONFIG } from '../../shared/constants/config';
import logger from '../../shared/utils/logger';

export class PathManager {
  private hytaleRoot: string;

  constructor() {
    this.hytaleRoot = path.join(app.getPath('appData'), 'Kyamtale');
  }

  getHytaleRoot(): string {
    return this.hytaleRoot;
  }

  getGameDir(channel: string): string {
    return path.join(this.hytaleRoot, ...CONFIG.GAME_PATH_PARTS, channel);
  }

  getJreDir(): string {
    return path.join(this.hytaleRoot, ...CONFIG.JRE_PATH_PARTS);
  }

  getUserDataDir(): string {
    return path.join(this.hytaleRoot, 'UserData');
  }

  getCacheDir(): string {
    return path.join(this.hytaleRoot, 'cache');
  }

  getToolsDir(): string {
    return path.join(this.hytaleRoot, 'tools');
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
    return path.join(gameDir, 'Client', 'HytaleClient.exe');
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
    
    return configPath;
  }

  getLocalCdnDir(): string {
    return path.join(app.getAppPath(), 'cdn');
  }

  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.hytaleRoot,
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
        const normalizedChannel = channel === 'beta' ? 'beta' : 'latest';
        
        if (cfg.hytale && cfg.hytale[normalizedChannel] && cfg.hytale[normalizedChannel].url) {
          const url = cfg.hytale[normalizedChannel].url;
          
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
}

export const pathManager = new PathManager();