import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { existsSync } from 'node:fs';
import https from 'node:https';
import axios from 'axios';
import type { FileHash } from '../../shared/schemas/patcher';
import { computeHashes } from '../../shared/utils/crypto';
import { BandwidthManager } from './bandwidthManager';
import { withRetry } from '../../shared/utils/retry';
import logger from '../../shared/utils/logger';

export interface DownloadOptions {
  url: string;
  destPath: string;
  expectedHash?: FileHash;
  bandwidthLimit?: number;
  retryCount?: number;
  resume?: boolean;
  maxRedirects?: number;
  redirectCount?: number;
}

export interface DownloadProgress {
  url: string;
  destPath: string;
  downloaded: number;
  total: number;
  percent: number;
  speed: number;
  eta: number;
}

export interface DownloadResult {
  success: boolean;
  path: string;
  size: number;
  hash?: FileHash;
  duration: number;
  fromCache: boolean;
}

export class DownloadManager {
  private bandwidthManager: BandwidthManager;
  private activeDownloads: Map<string, AbortController>;
  private tempDir: string;

  constructor(tempDir: string, bandwidthLimit: number = 0) {
    this.bandwidthManager = new BandwidthManager({ maxSpeedBytesPerSecond: bandwidthLimit });
    this.activeDownloads = new Map();
    this.tempDir = tempDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async download(options: DownloadOptions, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadResult> {
    const { url, destPath, expectedHash, retryCount = 3 } = options;
    const startTime = Date.now();
    const abortController = new AbortController();

    this.activeDownloads.set(url, abortController);

    try {
      const result = await withRetry(async () => {
        return await this.performDownload(options, abortController.signal, onProgress);
      }, {
        maxAttempts: retryCount,
        baseDelay: 1000,
        maxDelay: 30000,
        onRetry: (attempt, error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn('Download failed, retrying', { url, attempt, error: errorMessage });
        }
      });

      if (result.success && expectedHash) {
        const hash = await computeHashes(result.path, ['sha256', 'md5']);
        if (!hash.sha256 || hash.sha256 !== expectedHash.sha256) {
          await fs.unlink(result.path).catch(() => { });
          throw new Error(`Hash mismatch for ${url}`);
        }
        result.hash = expectedHash;
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info('Download completed', { url, success: result.success, duration, size: result.size });
      return result;
    } catch (error) {
      console.error('[DownloadManager] Fatal Download Error:', error);
      logger.error('Download failed', { url, error });
      return {
        success: false,
        path: destPath,
        size: 0,
        duration: Date.now() - startTime,
        fromCache: false
      };
    } finally {
      this.activeDownloads.delete(url);
    }
  }

  private agent = new https.Agent({
    keepAlive: true,
    maxSockets: Infinity,
    keepAliveMsecs: 1000,
    family: 4,
    noDelay: true
  });

  private async performDownload(options: DownloadOptions, signal: AbortSignal, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadResult> {
    const { url, destPath, bandwidthLimit = 0, resume = true } = options;

    if (bandwidthLimit > 0) {
      this.bandwidthManager.updateConfig({ maxSpeedBytesPerSecond: bandwidthLimit });
    }

    let downloaded = 0;
    let total = 0;
    let startTime = Date.now();

    const getTempPath = () => `${destPath}.part`;
    const tempPath = getTempPath();

    // Check for existing partial file for resume
    if (resume && existsSync(tempPath)) {
      const stat = await fs.stat(tempPath);
      downloaded = stat.size;
      logger.debug('Resuming download', { url, downloaded });
    } else {
      // If not resuming, ensure we start fresh
      await fs.unlink(tempPath).catch(() => { });
    }

    const bandwidthManager = this.bandwidthManager;

    return new Promise((resolve, reject) => {
      (async () => {
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://hytale.com/',
          'Origin': 'https://hytale.com',
          'Connection': 'keep-alive'
        };

        if (downloaded > 0) {
          headers['Range'] = `bytes=${downloaded}-`;
        }

        try {
          const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers,
            httpAgent: this.agent,
            httpsAgent: this.agent,
            signal: signal,
            validateStatus: (status) => {
              return (status >= 200 && status < 300) || status === 416;
            }
          });

          if (response.status === 416) {
            logger.warn('Range request not supported or invalid, restarting', { url });
            await fs.unlink(tempPath).catch(() => { });
            downloaded = 0;
            // Recursive retry without resume
            const result = await this.performDownload({ ...options, resume: false }, signal, onProgress);
            resolve(result);
            return;
          }

          const contentLength = response.headers['content-length'];
          total = downloaded + parseInt(contentLength || '0', 10);

          const fileStream = createWriteStream(tempPath, { flags: downloaded > 0 ? 'a' : 'w' });
          const stream = response.data;

          let lastEmitTime = Date.now();
          const emitInterval = 100;

          try {
            for await (const chunk of stream) {
              if (signal.aborted) {
                throw new Error('Download aborted');
              }

              await bandwidthManager.acquire(chunk.length);

              if (!fileStream.write(chunk)) {
                await new Promise<void>((resolve) => fileStream.once('drain', () => resolve()));
              }

              downloaded += chunk.length;

              const now = Date.now();
              if (now - lastEmitTime >= emitInterval) {
                const elapsed = (now - startTime) / 1000;
                const speed = downloaded / elapsed;
                const eta = speed > 0 ? (total - downloaded) / speed : 0;
                const percent = total > 0 ? (downloaded / total) * 100 : 0;

                lastEmitTime = now;
                onProgress?.({
                  url: options.url,
                  destPath,
                  downloaded,
                  total,
                  percent,
                  speed,
                  eta
                });
              }
            }
          } catch (err) {
            fileStream.destroy();
            throw err;
          }

          fileStream.end();

          await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', () => resolve());
            fileStream.on('error', reject);
          });

          if (total > 0 && downloaded < total) {
            throw new Error(`Incomplete download: ${downloaded}/${total}`);
          }

          await fs.rename(tempPath, destPath);
          const stat = await fs.stat(destPath);
          resolve({
            success: true,
            path: destPath,
            size: stat.size,
            duration: Date.now() - startTime,
            fromCache: false
          });

        } catch (error: any) {
          // Handle Request Errors
          console.error('[DownloadManager] Axios Error:', {
            message: error.message,
            status: error.response?.status,
            headers: error.response?.headers,
            url: options.url
          });

          if (axios.isCancel(error)) {
            reject(new Error('Download aborted'));
          } else {
            reject(error);
          }
        }
      })();
    });
  }

  async downloadParallel(
    downloads: DownloadOptions[],
    maxConcurrent: number = 4,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];
    const queue = [...downloads];
    const active: Promise<void>[] = [];

    const processDownload = async (options: DownloadOptions): Promise<void> => {
      const result = await this.download(options, onProgress);
      results.push(result);
    };

    while (queue.length > 0 || active.length > 0) {
      while (active.length < maxConcurrent && queue.length > 0) {
        const options = queue.shift()!;
        const promise = processDownload(options).finally(() => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
        });
        active.push(promise);
      }

      if (active.length > 0) {
        await Promise.race(active);
      }
    }

    return results;
  }

  cancelDownload(url: string): void {
    const controller = this.activeDownloads.get(url);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(url);
      logger.info('Download cancelled', { url });
    }
  }

  cancelAllDownloads(): void {
    for (const [url, controller] of this.activeDownloads) {
      controller.abort();
      logger.info('Download cancelled', { url });
    }
    this.activeDownloads.clear();
  }

  updateBandwidthLimit(limit: number): void {
    this.bandwidthManager.updateConfig({ maxSpeedBytesPerSecond: limit });
  }

  destroy(): void {
    this.cancelAllDownloads();
    this.bandwidthManager.destroy();
  }
}
