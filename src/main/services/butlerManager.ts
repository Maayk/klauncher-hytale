import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import logger from '../../shared/utils/logger';
import { pathManager } from './pathManager';

const execAsync = promisify(exec);

export interface ButlerProgress {
  percent: number;
  speed: string;
  eta: string;
  currentFile: string;
}

type ProgressCallback = (progress: ButlerProgress) => void;

export class ButlerManager {
  private butlerPath: string;

  constructor() {
    this.butlerPath = pathManager.getButlerPath();
  }

  private async ensureButlerInstalled(): Promise<void> {
    try {
      await fs.access(this.butlerPath);
      return;
    } catch {
      logger.info('Butler not found, downloading...');
    }

    const downloadUrl = pathManager.getButlerDownloadUrl();
    const tempDir = app.getPath('temp');
    const zipPath = path.join(tempDir, 'butler.zip');
    const toolsDir = pathManager.getToolsDir();

    await fs.mkdir(toolsDir, { recursive: true });

    const { default: axios } = await import('axios');
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');

    logger.info('Downloading Butler', { url: downloadUrl });

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    const writer = createWriteStream(zipPath);
    await pipeline(response.data, writer);

    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(toolsDir, true);

    await fs.unlink(zipPath);

    const butlerBin = process.platform === 'win32' ? 'butler.exe' : 'butler';
    const extractedPath = path.join(toolsDir, butlerBin);

    if (await fs.access(extractedPath).then(() => true).catch(() => false)) {
      await fs.chmod(extractedPath, 0o755);
      logger.info('Butler installed', { path: extractedPath });
    }
  }

  private runButlerCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return execAsync(`"${this.butlerPath}" ${args.join(' ')}`, {
      cwd,
      windowsHide: true
    });
  }

  async applyPatch(
    gameDir: string,
    patchUrl: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    await this.ensureButlerInstalled();

    logger.info('Applying Butler patch', { gameDir, patchUrl });

    const patchDir = path.join(gameDir, '.patch');
    await fs.mkdir(patchDir, { recursive: true });

    const patchFile = path.join(patchDir, 'game.pwr');

    const { default: axios } = await import('axios');
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');

    logger.info('Downloading patch file', { url: patchUrl });

    const response = await axios({
      method: 'GET',
      url: patchUrl,
      responseType: 'stream'
    });

    const writer = createWriteStream(patchFile);
    await pipeline(response.data, writer);

    logger.info('Applying patch with Butler');

    try {
      await this.runButlerCommand(['apply', patchFile, gameDir], gameDir);
      logger.info('Butler patch applied');
    } finally {
      await fs.rm(patchDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async verifyChannel(gameDir: string, channel: string): Promise<boolean> {
    try {
      await this.ensureButlerInstalled();

      const { stdout } = await this.runButlerCommand(['dl', 'list', '--json'], gameDir);
      const data = JSON.parse(stdout);
      
      return data.caves?.some((cave: any) => cave.game?.id === channel);
    } catch {
      return false;
    }
  }

  async extractLocalArchive(archivePath: string, gameDir: string, onProgress?: ProgressCallback): Promise<void> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(archivePath);

    const entries = zip.getEntries();
    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const destPath = path.join(gameDir, entry.entryName);

      if (entry.isDirectory) {
        await fs.mkdir(destPath, { recursive: true });
      } else {
        const destDir = path.dirname(destPath);
        await fs.mkdir(destDir, { recursive: true });
        
        const content = entry.getData();
        await fs.writeFile(destPath, content);
      }

      if (onProgress && i % 10 === 0) {
        onProgress({
          percent: Math.round((i / total) * 100),
          speed: '-',
          eta: '-',
          currentFile: entry.entryName
        });
      }
    }

    logger.info('Local archive extracted', { archivePath, gameDir, total });
  }

  async downloadChannel(
    channel: string,
    gameDir: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    await this.ensureButlerInstalled();

    logger.info('Downloading channel with Butler', { channel, gameDir });

    const channelId = `hytale/${channel}`;

    await this.runButlerCommand(['dl', channelId, gameDir, '--ifchanged'], gameDir);

    logger.info('Channel downloaded', { channel });
  }
}

export const butlerManager = new ButlerManager();