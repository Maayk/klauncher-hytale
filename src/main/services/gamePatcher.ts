import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import StreamZip from 'node-stream-zip';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DownloadService } from './downloadService';
import { pathManager } from './pathManager';
import logger from '../../shared/utils/logger';
import { CONFIG } from '../../shared/constants/config';

const execFileAsync = promisify(execFile);

export interface PatcherProgress {
  stage: string;
  percent: number;
  message: string;
  currentFile?: string;
  speed?: string;
  eta?: string;
}

export interface PatcherOptions {
  gameDir: string;
  channel: 'latest' | 'beta';
  onProgress?: (progress: PatcherProgress) => void;
}

export interface PatcherResult {
  success: boolean;
  version: string;
  filesProcessed: number;
  filesSkipped: number;
  duration: number;
  patchType: 'none' | 'patch' | 'full';
}

export class GamePatcher {
  private downloadService: DownloadService;
  private readonly patchConfig = {
    toolsDir: pathManager.getToolsDir(),
    butlerBin: process.platform === 'win32' ? 'butler.exe' : 'butler',
    originalDomain: 'hytale.com',
    targetDomain: CONFIG.TARGET_DOMAIN,
    patchFlagFile: '.patched_custom',
    primaryPatch: '4.pwr',
    fallbackPatch: '5.pwr',
    oldDiscord: '.gg/hytale',
    newDiscord: CONFIG.TARGET_DISCORD || '.gg/hytale',
    localConfigPath: path.join(app.getAppPath(), 'config.json'),
    localCdnDir: path.join(app.getAppPath(), 'cdn'),
    extractScanMaxDepth: 6,
    extractScanMaxEntries: 200
  };

  constructor(downloadService: DownloadService) {
    this.downloadService = downloadService;
  }

  async patchGame(gameDir: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    await this.updateGameFiles(gameDir, channel, onProgress);
  }

  async patchClient(executablePath: string): Promise<void> {
    await this.applyBinaryMods(executablePath);
  }

  private encodeUtf16(str: string): Buffer {
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    return buf;
  }

  private getPatternIndices(buffer: Buffer, pattern: Buffer): number[] {
    const indices: number[] = [];
    let pos = 0;
    while (pos < buffer.length) {
      const index = buffer.indexOf(pattern, pos);
      if (index === -1) break;
      indices.push(index);
      pos = index + 1;
    }
    return indices;
  }

  private replaceBinaryStrings(buffer: Buffer, replacementMap: Array<{ type: 'simple' | 'smart_domain'; oldVal: string; newVal: string }>): { buffer: Buffer; count: number } {
    let totalReplacements = 0;
    let modifiedBuffer = Buffer.from(buffer);

    for (const { type, oldVal, newVal } of replacementMap) {
      if (type === 'simple') {
        const oldBytes = this.encodeUtf16(oldVal);
        const newBytes = this.encodeUtf16(newVal);
        const matches = this.getPatternIndices(modifiedBuffer, oldBytes);

        for (const pos of matches) {
          newBytes.copy(modifiedBuffer, pos);
          totalReplacements++;
        }
      } else if (type === 'smart_domain') {
        const oldBytesStub = this.encodeUtf16(oldVal.slice(0, -1));
        const newBytesStub = this.encodeUtf16(newVal.slice(0, -1));

        const oldEndByte = oldVal.charCodeAt(oldVal.length - 1);
        const newEndByte = newVal.charCodeAt(newVal.length - 1);

        const matches = this.getPatternIndices(modifiedBuffer, oldBytesStub);

        for (const pos of matches) {
          const endBytePos = pos + oldBytesStub.length;
          if (endBytePos + 1 > modifiedBuffer.length) continue;

          if (modifiedBuffer[endBytePos] === oldEndByte) {
            newBytesStub.copy(modifiedBuffer, pos);
            modifiedBuffer[endBytePos] = newEndByte;
            totalReplacements++;
          }
        }
      }
    }

    return { buffer: modifiedBuffer, count: totalReplacements };
  }

  private async ensureTools(onProgress?: (stage: string, progress: number, message: string) => void): Promise<string> {
    const butlerPath = path.join(this.patchConfig.toolsDir, this.patchConfig.butlerBin);
    try {
      await fs.access(butlerPath);
      return butlerPath;
    } catch {
      logger.debug('Butler tool not found locally, initiating download');
    }

    await fs.mkdir(this.patchConfig.toolsDir, { recursive: true });
    const zipPath = path.join(this.patchConfig.toolsDir, 'butler.zip');

    let downloadUrl = '';
    const platform = process.platform;
    const arch = os.arch();

    if (platform === 'win32') {
      downloadUrl = 'https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default';
    } else if (platform === 'darwin') {
      downloadUrl = arch === 'arm64'
        ? 'https://broth.itch.zone/butler/darwin-arm64/LATEST/archive/default'
        : 'https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default';
    } else if (platform === 'linux') {
      downloadUrl = 'https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default';
    } else {
      throw new Error('OS not supported for Butler');
    }

    onProgress?.('downloading_tools', 0, 'Downloading patcher tools...');

    const downloadResult = await this.downloadService.downloadFile({
      url: downloadUrl,
      destPath: zipPath,
      expectedHash: undefined,
      priority: 'high'
    }, (progress) => {
      onProgress?.('downloading_tools', progress.percent, `Downloading tools... ${Math.round(progress.percent)}%`);
    });

    if (!downloadResult.success) {
      throw new Error('Failed to download Butler');
    }

    onProgress?.('extracting_tools', 50, 'Extracting patcher tools...');

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(this.patchConfig.toolsDir, true);
    await fs.unlink(zipPath).catch(() => { });

    if (platform !== 'win32') {
      await fs.chmod(butlerPath, 0o755);
    }

    logger.info('Butler downloaded', { path: butlerPath });
    return butlerPath;
  }

  private async applyBinaryMods(clientPath: string): Promise<void> {
    const trackingFile = clientPath + this.patchConfig.patchFlagFile;

    try {
      const trackingContent = await fs.readFile(trackingFile, 'utf-8');
      if (trackingContent.includes(this.patchConfig.targetDomain)) {
        logger.info('Binary already patched', { path: clientPath });
        return;
      }
    } catch {
      logger.debug('No patch tracking file found, will patch');
    }

    logger.info('Patching client binary', { path: clientPath });

    await fs.copyFile(clientPath, clientPath + '.bak').catch(() => { });

    const rawData = await fs.readFile(clientPath);

    const modifications = [
      { type: 'smart_domain' as const, oldVal: this.patchConfig.originalDomain, newVal: this.patchConfig.targetDomain },
      { type: 'simple' as const, oldVal: this.patchConfig.oldDiscord, newVal: this.patchConfig.newDiscord }
    ];

    const { buffer: newData, count } = this.replaceBinaryStrings(rawData, modifications);

    logger.info('Binary replacements applied', { count });

    await fs.writeFile(clientPath, newData);

    await fs.writeFile(trackingFile, JSON.stringify({
      date: new Date().toISOString(),
      original: this.patchConfig.originalDomain,
      target: this.patchConfig.targetDomain
    }));

    logger.info('Client modifications finished');
  }

  private isHttpUrl(value: string | null | undefined): boolean {
    return /^https?:\/\//i.test(value || '');
  }

  private normalizeConfigChannel(value: string): 'latest' | 'beta' {
    return value === 'beta' ? 'beta' : 'latest';
  }

  private async resolveLocalArchivePath(channel: string): Promise<{ path?: string; url?: string; isRemote: boolean } | null> {
    const normalizedChannel = this.normalizeConfigChannel(channel);
    let configUrl = null;

    // Robust config path resolution - consistent with VersionChecker
    const configPaths = [
      path.join(process.resourcesPath, 'config.json'),
      path.join(app.getAppPath(), 'config.json'),
      path.join(process.cwd(), 'config.json')
    ];

    let foundConfigPath = null;

    for (const configPath of configPaths) {
      try {
        await fs.access(configPath);
        const configContent = await fs.readFile(configPath, 'utf-8');
        const cfg = JSON.parse(configContent);
        const hytaleConfig = cfg.hytale?.[normalizedChannel] || cfg.hytale?.latest;

        if (hytaleConfig?.url) {
          configUrl = hytaleConfig.url;
          foundConfigPath = configPath;
          logger.info('Found custom game configuration', { configPath, channel: normalizedChannel, url: configUrl });
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }

    if (!configUrl) {
      // Only log if we genuinely couldn't find any config with a URL
      logger.debug('No custom game URL found in any config.json location');
    }

    if (configUrl && this.isHttpUrl(configUrl)) {
      return { url: configUrl, isRemote: true };
    }

    let candidate = null;
    if (configUrl && !this.isHttpUrl(configUrl)) {
      if (configUrl.startsWith('file://')) {
        candidate = fileURLToPath(configUrl);
      } else if (path.isAbsolute(configUrl)) {
        candidate = configUrl;
      } else {
        // Resolve relative paths relative to the CONFIG FILE location, or AppPath?
        // Usually relative to where the config is.
        // If foundConfigPath is defined, we should resolve relative to its directory.
        if (foundConfigPath) {
          candidate = path.join(path.dirname(foundConfigPath), configUrl);
        } else {
          candidate = path.join(app.getAppPath(), configUrl);
        }
      }
    }

    if (candidate && await fs.access(candidate).then(() => true).catch(() => false)) {
      return { path: candidate, isRemote: false };
    }

    try {
      await fs.access(this.patchConfig.localCdnDir);
      const entries = await fs.readdir(this.patchConfig.localCdnDir);
      const archives = entries.filter((file) => /\.zip$/i.test(file));

      if (archives.length) {
        const sorted = await Promise.all(archives.map(async (file) => {
          const fullPath = path.join(this.patchConfig.localCdnDir, file);
          const stat = await fs.stat(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        }));

        sorted.sort((a, b) => b.mtime - a.mtime);
        return { path: sorted[0].fullPath, isRemote: false };
      }
    } catch {
      logger.debug('Local archive not found, will use remote source');
    }

    return null;
  }

  private async extractArchive(archivePath: string, destDir: string): Promise<void> {
    const ext = path.extname(archivePath).toLowerCase();
    await fs.mkdir(destDir, { recursive: true });

    if (ext === '.zip') {
      // Use node-stream-zip for memory-efficient extraction (avoids Array Buffer Allocation Failed)
      const zip = new StreamZip.async({ file: archivePath });
      try {
        await zip.extract(null, destDir);
      } finally {
        await zip.close();
      }
      return;
    }

    throw new Error(`Unsupported archive format: ${ext}`);
  }

  private async moveDirContents(sourceDir: string, targetDir: string): Promise<void> {
    const entries = await fs.readdir(sourceDir);
    for (const entry of entries) {
      await fs.rename(
        path.join(sourceDir, entry),
        path.join(targetDir, entry)
      );
    }
  }

  private async resolveExtractedGameRoot(baseDir: string): Promise<string | null> {
    const directCandidates = [
      baseDir,
      path.join(baseDir, 'install', 'release', 'package', 'game'),
      path.join(baseDir, 'release', 'package', 'game'),
      path.join(baseDir, 'package', 'game')
    ];

    for (const candidate of directCandidates) {
      if (await fs.access(path.join(candidate, 'Client')).then(() => true).catch(() => false)) {
        return candidate;
      }
    }

    const entries = await fs.readdir(baseDir);
    if (entries.length !== 1) return null;

    const onlyPath = path.join(baseDir, entries[0]);
    const stat = await fs.stat(onlyPath);
    if (!stat.isDirectory()) return null;

    const nestedCandidates = [
      onlyPath,
      path.join(onlyPath, 'install', 'release', 'package', 'game'),
      path.join(onlyPath, 'release', 'package', 'game'),
      path.join(onlyPath, 'package', 'game')
    ];

    for (const candidate of nestedCandidates) {
      if (await fs.access(path.join(candidate, 'Client')).then(() => true).catch(() => false)) {
        return candidate;
      }
    }

    return await this.findGameRootByScan(baseDir);
  }

  private async findGameRootByScan(baseDir: string): Promise<string | null> {
    const queue = [{ dir: baseDir, depth: 0 }];
    let scanned = 0;

    while (queue.length) {
      const { dir, depth } = queue.shift()!;
      scanned += 1;
      if (scanned > this.patchConfig.extractScanMaxEntries) return null;

      const clientDir = path.join(dir, 'Client');
      if (await fs.access(clientDir).then(() => true).catch(() => false)) {
        const clientExe = path.join(clientDir, 'HytaleClient.exe');
        if (await fs.access(clientExe).then(() => true).catch(() => false)) return dir;
        return dir;
      }

      if (depth >= this.patchConfig.extractScanMaxDepth) continue;

      let entries = null;
      try {
        entries = await fs.readdir(dir);
      } catch {
        entries = null;
      }

      if (!entries || !entries.length) continue;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat = null;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          stat = null;
        }
        if (stat && stat.isDirectory()) {
          queue.push({ dir: fullPath, depth: depth + 1 });
        }
      }
    }

    return null;
  }

  private async tryInstallFromLocalArchive(gameDir: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<boolean> {
    const archiveSource = await pathManager.resolveLocalArchivePath(channel);
    if (!archiveSource) return false;

    let archivePath = (archiveSource as any).path;
    if (archiveSource.isRemote && (archiveSource as any).url) {
      const cacheDir = pathManager.getCacheDir();
      await fs.mkdir(cacheDir, { recursive: true });
      let fileName = `hytale-${channel}.zip`;
      try {
        const urlObj = new URL((archiveSource as any).url);
        const baseName = path.basename(urlObj.pathname);
        if (baseName) fileName = baseName;
      } catch {
        logger.warn('Failed to parse archive URL, using default filename');
      }
      archivePath = path.join(cacheDir, fileName);

      // Clean up previous attempts
      await fs.rm(archivePath, { force: true }).catch(() => { });
      await fs.rm(archivePath + '.tmp', { force: true }).catch(() => { });

      onProgress?.('downloading', 0, 'Downloading game from custom source...');

      const downloadResult = await this.downloadService.downloadFile({
        url: (archiveSource as any).url,
        destPath: archivePath,
        expectedHash: undefined,
        priority: 'high'
      }, (progress) => {
        onProgress?.('downloading', progress.percent, `Downloading game... ${Math.round(progress.percent)}%`);
      });

      if (!downloadResult.success) {
        throw new Error(`Failed to download custom game archive from: ${(archiveSource as any).url}`);
      }
    }

    onProgress?.('extracting', 50, 'Extracting game files...');
    logger.info('Installing game from archive', { archivePath });

    if (!archivePath) {
      throw new Error('Archive path is undefined');
    }

    const cacheDir = pathManager.getCacheDir();
    const tempDir = path.join(cacheDir, `extract_${channel}`);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
    await this.extractArchive(archivePath, tempDir);

    const sourceDir = await this.resolveExtractedGameRoot(tempDir);
    if (!sourceDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
      return false;
    }

    await fs.mkdir(gameDir, { recursive: true });

    // Clear existing directory to avoid conflicts
    // We should probably NOT nuke the whole gameDir if it's the root game dir, but here gameDir IS the versioned dir (e.g. .../latest).
    // So clearing it is correct for a fresh install/reinstall from local archive.
    await fs.rm(gameDir, { recursive: true, force: true }).catch(() => { });
    await fs.mkdir(gameDir, { recursive: true });

    await this.moveDirContents(sourceDir, gameDir);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
    return true;
  }

  private async updateGameFiles(gameDir: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    const installedFromLocal = await this.tryInstallFromLocalArchive(gameDir, channel, onProgress);
    if (installedFromLocal) {
      onProgress?.('complete', 100, 'Game installed successfully from local archive');
      return;
    }

    if (channel !== 'latest') {
      throw new Error(`Failed to install custom version for channel '${channel}'. Verifique o arquivo de configuração ou a URL.`);
    }

    const patcherBin = await this.ensureTools(onProgress);

    const sysOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
    const sysArch = 'amd64';

    const patchUrlBase = `https://game-patches.hytale.com/patches/${sysOs}/${sysArch}/release/0/`;
    const cacheDir = pathManager.getCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });

    const targetPatchFile = path.join(cacheDir, this.patchConfig.primaryPatch);

    const patchExists = await fs.access(targetPatchFile).then(() => true).catch(() => false);

    if (!patchExists) {
      onProgress?.('downloading_patch', 10, 'Downloading game patch...');

      try {
        logger.info(`Attempting download: ${this.patchConfig.primaryPatch}`);

        const downloadResult = await this.downloadService.downloadFile({
          url: patchUrlBase + this.patchConfig.primaryPatch,
          destPath: targetPatchFile,
          expectedHash: undefined,
          priority: 'high'
        }, (progress) => {
          onProgress?.('downloading_patch', 10 + progress.percent * 0.4, `Downloading patch... ${Math.round(progress.percent)}%`);
        });

        if (!downloadResult.success) {
          throw new Error('Failed to download primary patch');
        }
      } catch (err) {
        logger.error(`Download failed for ${this.patchConfig.primaryPatch}, attempting fallback...`, { error: err });

        const fallbackPath = path.join(cacheDir, this.patchConfig.fallbackPatch);
        try {
          onProgress?.('downloading_patch_fallback', 10, 'Attempting fallback patch...');

          const fallbackResult = await this.downloadService.downloadFile({
            url: patchUrlBase + this.patchConfig.fallbackPatch,
            destPath: fallbackPath,
            expectedHash: undefined,
            priority: 'high'
          }, (progress) => {
            onProgress?.('downloading_patch_fallback', 10 + progress.percent * 0.4, `Downloading fallback... ${Math.round(progress.percent)}%`);
          });

          if (!fallbackResult.success) {
            throw new Error('Failed to download fallback patch');
          }

          await fs.copyFile(fallbackPath, targetPatchFile);
        } catch (fallbackErr) {
          logger.error('All download attempts failed', { error: fallbackErr });
          throw err;
        }
      }
    }

    const stagingArea = path.join(gameDir, 'staging_temp');
    await fs.mkdir(gameDir, { recursive: true });

    const patchArgs = ['apply', '--staging-dir', stagingArea, targetPatchFile, gameDir];

    onProgress?.('applying_patch', 70, 'Applying game patch...');

    try {
      await execFileAsync(patcherBin, patchArgs, { maxBuffer: 10 * 1024 * 1024 });
      logger.info('Game files updated successfully');
    } catch (error) {
      logger.error('Patcher failed', { error });
      throw new Error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await fs.rm(stagingArea, { recursive: true, force: true }).catch(() => { });
    }

    onProgress?.('complete', 100, 'Game patched successfully');
  }
}
