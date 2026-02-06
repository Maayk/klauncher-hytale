import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import StreamZip from 'node-stream-zip';
import * as tar from 'tar';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DownloadService } from './downloadService';
import { pathManager } from './pathManager';
import logger from '../../shared/utils/logger';
import { CONFIG } from '../../shared/constants/config';
import { configManager } from './configManager';
import { patchDiscovery } from './patchDiscovery';

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
      const zip = new StreamZip.async({ file: archivePath });
      try {
        await zip.extract(null, destDir);
      } finally {
        await zip.close();
      }
      return;
    }

    if (ext === '.tar.gz' || ext === '.tgz' || ext === '.gz') { // Handle tar.gz
      logger.info('Extracting tarball', { archivePath, destDir });
      await tar.x({
        file: archivePath,
        C: destDir,
        preserveOwner: false, // Critical for Linux
      });
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

    // If we downloaded this file specifically for this install (isRemote), delete it to save space
    if ((archiveSource as any).isRemote) {
      logger.info('Removing cached archive after extraction', { archivePath });
      await fs.rm(archivePath, { force: true }).catch(() => { });
    }

    const sourceDir = await this.resolveExtractedGameRoot(tempDir);
    if (!sourceDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
      return false;
    }

    await fs.mkdir(gameDir, { recursive: true });

    // Clear existing directory to avoid conflicts
    await fs.rm(gameDir, { recursive: true, force: true }).catch(() => { });
    await fs.mkdir(gameDir, { recursive: true });

    await this.moveDirContents(sourceDir, gameDir);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });

    // Linux/Mac Requirement: Make the binary executable
    if (process.platform !== 'win32') {
      try {
        const clientBin = pathManager.getClientExecutable(gameDir);
        await fs.chmod(clientBin, 0o755);
        logger.info('Marked game binary as executable', { clientBin });
      } catch (e) {
        logger.warn('Failed to strict permissions on game binary', { error: e });
      }
    }

    return true;
  }

  private async updateGameFiles(gameDir: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    const installedFromLocal = await this.tryInstallFromLocalArchive(gameDir, channel, onProgress);

    // 1. Initialize logic: Check if we have a version record
    let currentInfo = configManager.getGameVersion(channel);

    // Logic: "Assume Latest" for Local Installs (Sync)
    if (installedFromLocal || (!currentInfo && await fs.access(path.join(gameDir, 'Client', 'HytaleClient.exe')).then(() => true).catch(() => false))) {
      logger.info('Detected local installation without version record. Attempting synchronization...');
      onProgress?.('syncing', 0, 'Synchronizing version with server...');

      // Strategy: Use findLatestBaseVersion to get a "known good" anchor.
      const latestBase = await patchDiscovery.findLatestBaseVersion(channel);
      if (latestBase) {
        logger.info(`Assuming local installation is at least ver ${latestBase.toVersion}`);
        currentInfo = {
          version: latestBase.toVersion,
          channel: channel,
          installedAt: Date.now(),
          patchedAt: Date.now()
        };
        await configManager.saveGameVersion(channel, currentInfo);
      } else {
        // Fallback
        currentInfo = { version: 0, channel: channel, installedAt: Date.now() };
      }
    }

    if (!currentInfo) {
      currentInfo = { version: 0, channel: channel, installedAt: Date.now() };
    }

    let currentVerVal = currentInfo.version;

    // Safety Check: If config says we have a version, but files are missing -> Force 0
    if (currentVerVal > 0) {
      const clientExe = path.join(gameDir, 'Client', 'HytaleClient.exe');
      if (!await fs.access(clientExe).then(() => true).catch(() => false)) {
        logger.warn('Version record exists but game files are missing. Forcing fresh install.', { currentVerVal });
        currentVerVal = 0;
      }
    }

    // 2. Fresh Install Flow (If version is 0)
    if (currentVerVal === 0) {
      await this.performFreshInstall(gameDir, channel, onProgress);
      currentInfo = configManager.getGameVersion(channel)!;
      currentVerVal = currentInfo.version;
    }

    // 3. Incremental Update Loop with Self-Healing
    const patcherBin = await this.ensureTools(onProgress);
    const stagingArea = path.join(gameDir, 'staging_temp');

    while (true) {
      const nextPatch = await patchDiscovery.findNextPatch(channel, currentVerVal);
      if (!nextPatch) {
        logger.info('No further updates found', { currentVerVal });
        break;
      }

      onProgress?.('downloading_patch', 0, `Downloading update ${nextPatch.toVersion}...`);

      try {
        await this.applyPatchOrRescue(nextPatch, gameDir, stagingArea, patcherBin, channel, onProgress);

        currentVerVal = nextPatch.toVersion;
        await configManager.saveGameVersion(channel, {
          version: nextPatch.toVersion,
          channel: channel,
          installedAt: currentInfo?.installedAt || Date.now(),
          patchedAt: Date.now()
        });

      } catch (error) {
        throw error;
      }
    }

    await fs.rm(stagingArea, { recursive: true, force: true }).catch(() => { });
    onProgress?.('complete', 100, `Game updated to version ${currentVerVal}`);
  }

  private async performFreshInstall(gameDir: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    onProgress?.('checking_base', 0, 'Searching for latest base version...');
    const basePatch = await patchDiscovery.findLatestBaseVersion(channel);

    if (!basePatch) {
      throw new Error('Could not find any installable version of Hytale. CDN might be down.');
    }

    // Ensure tools are ready
    const patcherBin = await this.ensureTools(onProgress);
    const stagingArea = path.join(gameDir, 'staging_temp');

    await fs.mkdir(gameDir, { recursive: true });

    // Base install is just applying patch 0 -> N
    await this.applyPatchInternal(basePatch, gameDir, stagingArea, patcherBin, onProgress);

    await configManager.saveGameVersion(channel, {
      version: basePatch.toVersion,
      channel: channel,
      installedAt: Date.now(),
      patchedAt: Date.now()
    });

    await fs.rm(stagingArea, { recursive: true, force: true }).catch(() => { });
  }

  // Unified method for applying ANY patch (incremental or full/base)
  private async applyPatchInternal(patchInfo: { fromVersion: number, toVersion: number, url: string }, gameDir: string, stagingArea: string, patcherBin: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    const patchFileName = `patch-${patchInfo.fromVersion}-to-${patchInfo.toVersion}.pwr`;
    const patchPath = path.join(pathManager.getCacheDir(), patchFileName);

    // Download the .pwr file
    const dlResult = await this.downloadService.downloadFile({
      url: patchInfo.url,
      destPath: patchPath,
      expectedHash: undefined,
      priority: 'high'
    }, (p) => onProgress?.('downloading_patch', p.percent, `Downloading data (Build ${patchInfo.toVersion})... ${Math.round(p.percent)}%`));

    if (!dlResult.success) throw new Error(`Failed to download data ${patchFileName}`);

    onProgress?.('applying_patch', 0, `Installing version ${patchInfo.toVersion}...`);

    // Ensure game dir exists
    await fs.mkdir(gameDir, { recursive: true });

    // Butler apply command
    const patchArgs = ['apply', '--staging-dir', stagingArea, patchPath, gameDir];

    try {
      await execFileAsync(patcherBin, patchArgs, { maxBuffer: 10 * 1024 * 1024 });
    } finally {
      // Always cleanup the large patch file to save space
      await fs.unlink(patchPath).catch(() => { });
    }
  }

  private async applyPatchOrRescue(patchInfo: any, gameDir: string, stagingArea: string, patcherBin: string, channel: string, onProgress?: (stage: string, progress: number, message: string) => void): Promise<void> {
    try {
      // Try normal incremental patch
      await this.applyPatchInternal(patchInfo, gameDir, stagingArea, patcherBin, onProgress);
    } catch (patchError: any) {
      logger.warn(`Patch application failed. Initiating Rescue Protocol...`, { error: patchError });
      onProgress?.('rescue_mode', 0, `Repairing installation (Downloading Full Build ${patchInfo.toVersion})...`);

      // Construct rescue patch info (0 -> Target)
      const rescuePatch = {
        fromVersion: 0,
        toVersion: patchInfo.toVersion,
        url: patchDiscovery.getFullVersionUrl(patchInfo.toVersion, channel)
      };

      // Apply rescue patch (Full download + Apply)
      await this.applyPatchInternal(rescuePatch, gameDir, stagingArea, patcherBin, onProgress);
    }
  }
}
