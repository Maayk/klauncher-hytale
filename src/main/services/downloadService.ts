import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { FileHash } from '../../shared/schemas/patcher';
import { CacheManager } from './cacheManager';
import { DownloadManager, type DownloadProgress, type DownloadResult } from './downloadManager';
import { computeHashes } from '../../shared/utils/crypto';
import logger from '../../shared/utils/logger';

export interface FileDownloadTask {
  url: string;
  destPath: string;
  expectedHash?: FileHash;
  priority?: 'high' | 'normal' | 'low';
}

export interface DownloadServiceConfig {
  cacheDir: string;
  tempDir: string;
  maxCacheSizeMB: number;
  cacheMaxAgeDays: number;
  maxConcurrentDownloads: number;
  maxBandwidthBytesPerSecond: number;
  retryCount: number;
}

export interface DownloadServiceStats {
  activeDownloads: number;
  queuedDownloads: number;
  completedDownloads: number;
  failedDownloads: number;
  totalBytesDownloaded: number;
  cacheHits: number;
  cacheMisses: number;
}

export class DownloadService extends EventEmitter {
  private cacheManager: CacheManager;
  private downloadManager: DownloadManager;
  private config: DownloadServiceConfig;
  private activeTasks: Map<string, Promise<DownloadResult>>;
  private stats: DownloadServiceStats;

  constructor(config: DownloadServiceConfig) {
    super();
    this.config = config;
    this.cacheManager = new CacheManager(
      config.cacheDir,
      config.maxCacheSizeMB,
      config.cacheMaxAgeDays
    );
    this.downloadManager = new DownloadManager(
      config.tempDir,
      config.maxBandwidthBytesPerSecond
    );
    this.activeTasks = new Map();
    this.stats = {
      activeDownloads: 0,
      queuedDownloads: 0,
      completedDownloads: 0,
      failedDownloads: 0,
      totalBytesDownloaded: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  async initialize(): Promise<void> {
    await this.cacheManager.initialize();
    await this.downloadManager.initialize();
    await this.cacheManager.verifyCacheIntegrity();
    logger.info('Download service initialized', { config: this.config });
  }

  async downloadFile(
    task: FileDownloadTask,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const taskId = task.url;
    const existingTask = this.activeTasks.get(taskId);

    if (existingTask) {
      logger.debug('Download already in progress', { url: task.url });
      return existingTask;
    }

    const taskPromise = this.executeDownload(task, onProgress);
    this.activeTasks.set(taskId, taskPromise);
    this.stats.activeDownloads++;

    try {
      const result = await taskPromise;

      if (result.success) {
        this.stats.completedDownloads++;
        this.stats.totalBytesDownloaded += result.size;

        if (result.fromCache) {
          this.stats.cacheHits++;
        } else {
          this.stats.cacheMisses++;

          if (task.expectedHash && result.hash) {
            await this.cacheManager.put(task.url, result.path, result.hash);
          }
        }
      } else {
        this.stats.failedDownloads++;
      }

      return result;
    } finally {
      this.activeTasks.delete(taskId);
      this.stats.activeDownloads--;
    }
  }

  private async executeDownload(
    task: FileDownloadTask,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const { url, destPath, expectedHash, priority } = task;

    this.emit('download-started', { url, destPath, priority });

    const cachedPath = await this.cacheManager.get(url);

    if (cachedPath) {
      const destDir = path.dirname(destPath);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(destDir, { recursive: true });
      const { copyFile } = await import('node:fs/promises');
      await copyFile(cachedPath, destPath);

      const stat = await import('node:fs/promises').then(m => m.stat(destPath));
      const hashResult = expectedHash ? await computeHashes(destPath, ['sha256', 'md5']) : undefined;
      const hash = hashResult && hashResult.md5 && hashResult.sha1 && hashResult.sha256 ? {
        md5: hashResult.md5,
        sha1: hashResult.sha1,
        sha256: hashResult.sha256,
        size: hashResult.size
      } : undefined;

      this.emit('download-completed', {
        url,
        destPath,
        fromCache: true,
        size: stat.size
      });

      return {
        success: true,
        path: destPath,
        size: stat.size,
        hash,
        duration: 0,
        fromCache: true
      };
    }

    const result = await this.downloadManager.download(
      {
        url,
        destPath,
        expectedHash,
        bandwidthLimit: this.config.maxBandwidthBytesPerSecond,
        retryCount: this.config.retryCount,
        resume: true
      },
      (progress) => {
        this.emit('download-progress', progress);
        onProgress?.(progress);
      }
    );

    if (result.success) {
      this.emit('download-completed', {
        url,
        destPath,
        fromCache: false,
        size: result.size
      });
    } else {
      this.emit('download-failed', { url, destPath });
    }

    return result;
  }

  async downloadFiles(
    tasks: FileDownloadTask[],
    onProgress?: (overallProgress: { total: number; completed: number; percent: number }) => void,
    onFileProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];
    const total = tasks.length;
    let completed = 0;

    for (let i = 0; i < total; i += this.config.maxConcurrentDownloads) {
      const batch = tasks.slice(i, i + this.config.maxConcurrentDownloads);
      const batchResults = await Promise.all(
        batch.map(task =>
          this.downloadFile(task, (progress) => {
            onFileProgress?.(progress);
          })
        )
      );

      results.push(...batchResults);
      completed += batchResults.length;

      onProgress?.({
        total,
        completed,
        percent: (completed / total) * 100
      });
    }

    return results;
  }

  async verifyFiles(fileHashes: Array<{ path: string; hash: FileHash }>): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const { verifyMultipleFiles } = await import('../../shared/utils/crypto');

    const verifyResults = await verifyMultipleFiles(fileHashes);

    for (const [filePath, result] of verifyResults.entries()) {
      results.set(filePath, result.valid);

      if (!result.valid) {
        logger.warn('File verification failed', {
          filePath,
          mismatches: result.mismatches
        });
      }
    }

    return results;
  }

  async downloadMissingFiles(
    fileHashes: Array<{ url: string; path: string; hash: FileHash }>,
    onProgress?: (overallProgress: { total: number; completed: number; percent: number }) => void,
    onFileProgress?: (progress: DownloadProgress) => void
  ): Promise<{ downloaded: DownloadResult[]; skipped: string[]; failed: string[] }> {
    const verificationResults = await this.verifyFiles(
      fileHashes.map(f => ({ path: f.path, hash: f.hash }))
    );

    const missingFiles = fileHashes.filter(f => !verificationResults.get(f.path));
    const skippedFiles = fileHashes.filter(f => verificationResults.get(f.path));

    logger.info('File verification completed', {
      total: fileHashes.length,
      valid: skippedFiles.length,
      missing: missingFiles.length
    });

    const tasks: FileDownloadTask[] = missingFiles.map(f => ({
      url: f.url,
      destPath: f.path,
      expectedHash: f.hash,
      priority: 'normal'
    }));

    const results = await this.downloadFiles(tasks, onProgress, onFileProgress);

    const failedFiles = results
      .filter(r => !r.success)
      .map(r => tasks.find(t => t.destPath === r.path)?.url || r.path);

    return {
      downloaded: results.filter(r => r.success),
      skipped: skippedFiles.map(f => f.path),
      failed: failedFiles
    };
  }

  async clearCache(): Promise<void> {
    await this.cacheManager.clear();
    logger.info('Cache cleared');
  }

  getCacheStats() {
    return this.cacheManager.getStats();
  }

  getStats(): DownloadServiceStats {
    return { ...this.stats };
  }

  updateConfig(config: Partial<DownloadServiceConfig>): void {
    Object.assign(this.config, config);

    if (config.maxBandwidthBytesPerSecond !== undefined) {
      this.downloadManager.updateBandwidthLimit(config.maxBandwidthBytesPerSecond);
    }

    logger.info('Download service config updated', { config: this.config });
  }

  cancelDownload(url: string): void {
    this.downloadManager.cancelDownload(url);
  }

  cancelAllDownloads(): void {
    this.downloadManager.cancelAllDownloads();
    this.activeTasks.clear();
    this.stats.activeDownloads = 0;
  }

  async destroy(): Promise<void> {
    this.cancelAllDownloads();
    this.downloadManager.destroy();
    this.removeAllListeners();
    logger.info('Download service destroyed');
  }
}
