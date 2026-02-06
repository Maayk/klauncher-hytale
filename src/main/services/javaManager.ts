import fs from 'fs-extra';
import * as path from 'path';
import { app } from 'electron';
import * as os from 'os';
import StreamZip from 'adm-zip';
import * as tar from 'tar';
import { pathManager } from './pathManager';
import logger from '../../shared/utils/logger';

export interface JavaConfig {
  download_url: {
    windows?: { x64?: { url: string; sha256?: string }; arm64?: { url: string; sha256?: string } };
    macos?: { x64?: { url: string; sha256?: string }; arm64?: { url: string; sha256?: string } };
    linux?: { x64?: { url: string; sha256?: string }; arm64?: { url: string; sha256?: string } };
  };
}

export interface JavaProgress {
  status: 'checking' | 'downloading' | 'extracting' | 'complete' | 'error';
  progress: number;
  message: string;
}

type ProgressCallback = (progress: JavaProgress) => void;

export class JavaManager {
  constructor() {
  }

  private getJavaExecutablePath(): string {
    return pathManager.getJavaExecutable();
  }

  private async loadJavaConfig(): Promise<JavaConfig> {
    const possiblePaths = [
      path.join(app.getAppPath(), 'jre.json'),
      path.join(process.resourcesPath || app.getAppPath(), 'jre.json'),
      path.join(process.cwd(), 'jre.json'),
    ];

    for (const configPath of possiblePaths) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as JavaConfig;
        return config;
      } catch {
        continue;
      }
    }

    throw new Error('jre.json configuration not found');
  }

  private async downloadWithProgress(
    url: string,
    outputPath: string,
    onProgress: ProgressCallback
  ): Promise<void> {
    const { default: axios } = await import('axios');
    const { createWriteStream } = await import('fs');
    const { promisify } = await import('util');
    const pipeline = promisify(
      (await import('stream')).pipeline
    );

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
    });

    const totalLength = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedLength = 0;

    const writer = createWriteStream(outputPath);

    response.data.on('data', (chunk: Buffer) => {
      downloadedLength += chunk.length;
      if (totalLength > 0) {
        const progress = Math.round((downloadedLength / totalLength) * 100);
        onProgress({
          status: 'downloading',
          progress,
          message: `Baixando Java Runtime... ${progress}%`,
        });
      }
    });

    await pipeline(response.data, writer);
  }

  private async extractZip(
    zipPath: string,
    extractTo: string,
    onProgress: ProgressCallback
  ): Promise<void> {
    const zip = new StreamZip(zipPath);

    await fs.mkdir(extractTo, { recursive: true });
    zip.extractAllTo(extractTo, true);

    onProgress({
      status: 'extracting',
      progress: 100,
      message: 'Java Runtime extraído com sucesso',
    });

    logger.info('Zip extraction complete', { extractTo });
  }

  private async extractTarGz(
    tarPath: string,
    extractTo: string,
    onProgress: ProgressCallback
  ): Promise<void> {
    logger.info('Starting tar.gz extraction', { tarPath, extractTo });

    try {
      await tar.x({
        file: tarPath,
        C: extractTo,
        strict: true,
        preserveOwner: false, // Critical for avoiding EACCES on Linux if files are root-owned in archive
      });

      onProgress({
        status: 'extracting',
        progress: 100,
        message: 'Java Runtime extraído com sucesso',
      });

      logger.info('Tar.gz extraction complete');
    } catch (error) {
      logger.error('Failed to extract tar.gz', { error, tarPath, extractTo });
      throw error;
    }
  }

  private async logDirectoryStructure(dirPath: string, depth = 0, maxDepth = 3): Promise<void> {
    if (depth > maxDepth) return;
    try {
      const items = await fs.readdir(dirPath);
      logger.info(`Directory structure [depth=${depth}]`, { dirPath, items });

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          await this.logDirectoryStructure(itemPath, depth + 1, maxDepth);
        }
      }
    } catch (error) {
      logger.warn('Failed to log directory structure', { dirPath, error });
    }
  }

  private async flattenNestedDirectory(baseDir: string): Promise<void> {
    logger.info('Starting directory flattening', { baseDir });
    await this.logDirectoryStructure(baseDir); // Log BEFORE flattening

    const items = await fs.readdir(baseDir);
    let jdkRootDir: string | null = null;

    logger.debug('Scanning for JDK root', { items });

    for (const item of items) {
      const itemPath = path.join(baseDir, item);
      try {
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          const binPath = path.join(itemPath, 'bin');
          try {
            await fs.access(binPath);
            jdkRootDir = itemPath;
            logger.info('Found JDK root candidate', { jdkRootDir });
            break;
          } catch {
            logger.debug('Directory does not contain bin folder', { itemPath });
          }
        }
      } catch (e) {
        logger.warn('Error accessing item during flattening', { itemPath, error: e });
      }
    }

    if (jdkRootDir) {
      logger.info('Flattening JDK structure', { from: jdkRootDir, to: baseDir });
      const nestedItems = await fs.readdir(jdkRootDir);

      for (const item of nestedItems) {
        const sourcePath = path.join(jdkRootDir, item);
        const destPath = path.join(baseDir, item);

        try {
          await fs.move(sourcePath, destPath, { overwrite: true });
        } catch (e) {
          logger.warn(`Failed to move ${item} from nested dir`, { error: e });
        }
      }

      try {
        await fs.rmdir(jdkRootDir);
      } catch (e) {
        logger.warn('Failed to remove JDK root dir', { error: e });
      }
    } else {
      logger.warn('No nested JDK root found during flattening', { baseDir });
    }

    await this.logDirectoryStructure(baseDir); // Log AFTER flattening
  }

  async checkJavaInstalled(): Promise<boolean> {
    const javaPath = this.getJavaExecutablePath();
    try {
      await fs.access(javaPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureJavaInstalled(onProgress?: ProgressCallback): Promise<string> {
    const bundledJava = this.getJavaExecutablePath();

    if (await this.checkJavaInstalled()) {
      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Java Runtime encontrado',
      });
      return bundledJava;
    }

    onProgress?.({
      status: 'checking',
      progress: 0,
      message: 'Verificando Java Runtime...',
    });

    const javaConfig = await this.loadJavaConfig();
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const arch = os.arch() === 'x64' ? 'x64' : 'arm64';

    const platformConfig = javaConfig.download_url[platform];
    if (!platformConfig) {
      throw new Error(`Java runtime not defined for platform: ${platform}`);
    }

    const targetInfo = platformConfig[arch];
    if (!targetInfo) {
      throw new Error(`Java runtime not defined for ${platform} ${arch}`);
    }

    const downloadUrl = targetInfo.url;
    const tempDir = app.getPath('temp');
    const fileName = path.basename(downloadUrl);
    const downloadPath = path.join(tempDir, fileName);

    try {
      await this.downloadWithProgress(downloadUrl, downloadPath, onProgress || (() => { }));

      onProgress?.({
        status: 'extracting',
        progress: 0,
        message: 'Extraindo Java Runtime...',
      });

      const jreDir = pathManager.getJreDir();
      await fs.emptyDir(jreDir); // Ensure clean state before extraction

      if (fileName.endsWith('.zip')) {
        await this.extractZip(downloadPath, jreDir, onProgress || (() => { }));
      } else if (fileName.endsWith('.tar.gz')) {
        await this.extractTarGz(downloadPath, jreDir, onProgress || (() => { }));
      } else {
        throw new Error('Unsupported JRE file format (only zip and tar.gz supported)');
      }

      await this.flattenNestedDirectory(jreDir);

      await fs.unlink(downloadPath);

      const installedPath = this.getJavaExecutablePath();

      // On Linux/Mac, we need to ensure the executable has +x permissions
      if (process.platform !== 'win32') {
        await fs.chmod(installedPath, 0o755);
      }

      if (!(await this.checkJavaInstalled())) {
        throw new Error('Java installation verification failed');
      }

      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Java Runtime instalado com sucesso',
      });

      return installedPath;
    } catch (error) {
      onProgress?.({
        status: 'error',
        progress: 0,
        message: `Erro ao instalar Java: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
  }

  async getJavaVersion(): Promise<string | null> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const javaPath = this.getJavaExecutablePath();
      const { stdout } = await execAsync(`"${javaPath}" -version`, { windowsHide: true });
      const match = stdout.match(/version "(.+?)"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async getJavaPath(): Promise<string> {
    const javaPath = this.getJavaExecutablePath();
    if (await this.checkJavaInstalled()) {
      return javaPath;
    }
    throw new Error('Java runtime not installed');
  }

  async getJavaExec(): Promise<string> {
    const bundledJava = this.getJavaExecutablePath();
    if (await this.checkJavaInstalled()) {
      return bundledJava;
    }
    return 'java';
  }
}

export const javaManager = new JavaManager();
