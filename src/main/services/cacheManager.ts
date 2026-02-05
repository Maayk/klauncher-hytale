import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { FileHash } from '../../shared/schemas/patcher';
import { computeHashes } from '../../shared/utils/crypto';
import logger from '../../shared/utils/logger';

export interface CacheEntry {
  url: string;
  filePath: string;
  hash: FileHash;
  createdAt: number;
  lastAccessed: number;
  size: number;
  accessCount: number;
}

export interface CacheStats {
  entries: number;
  totalSize: number;
  hitRate: number;
}

export class CacheManager {
  private cacheDir: string;
  private indexFile: string;
  private index: Map<string, CacheEntry>;
  private maxSizeBytes: number;
  private maxAgeMs: number;

  constructor(cacheDir: string, maxSizeMB: number = 500, maxAgeDays: number = 30) {
    this.cacheDir = cacheDir;
    this.indexFile = path.join(cacheDir, 'index.json');
    this.index = new Map();
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
    this.maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
    await this.pruneExpiredEntries();
    await this.enforceSizeLimit();
  }

  private async loadIndex(): Promise<void> {
    try {
      if (existsSync(this.indexFile)) {
        const data = await fs.readFile(this.indexFile, 'utf-8');
        const entries = JSON.parse(data) as CacheEntry[];
        this.index = new Map(entries.map(e => [e.url, e]));
      }
    } catch (error) {
      logger.warn('Failed to load cache index, starting fresh', { error });
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      const entries = Array.from(this.index.values());
      await fs.writeFile(this.indexFile, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save cache index', { error });
    }
  }

  async get(url: string): Promise<string | null> {
    const entry = this.index.get(url);
    if (!entry) {
      return null;
    }

    const filePath = entry.filePath;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size !== entry.size) {
        await this.remove(url);
        return null;
      }

      const hash = await computeHashes(filePath, ['sha256']);
      if (!hash.sha256 || hash.sha256 !== entry.hash.sha256) {
        await this.remove(url);
        return null;
      }

      entry.lastAccessed = Date.now();
      entry.accessCount++;
      await this.saveIndex();

      logger.debug('Cache hit', { url, size: entry.size });
      return filePath;
    } catch (error) {
      logger.warn('Cache entry corrupted, removing', { url, error });
      await this.remove(url);
      return null;
    }
  }

  async put(url: string, filePath: string, hash: FileHash): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      const entry: CacheEntry = {
        url,
        filePath,
        hash,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        size: stat.size,
        accessCount: 0
      };

      await this.enforceSizeLimit(entry.size);
      this.index.set(url, entry);
      await this.saveIndex();

      logger.debug('Cache stored', { url, size: entry.size });
    } catch (error) {
      logger.error('Failed to cache file', { url, filePath, error });
    }
  }

  async remove(url: string): Promise<void> {
    const entry = this.index.get(url);
    if (!entry) return;

    try {
      await fs.unlink(entry.filePath);
    } catch (error) {
      logger.warn('Failed to delete cached file during removal', { url, filePath: entry.filePath, error });
    }

    this.index.delete(url);
    await this.saveIndex();
  }

  async clear(): Promise<void> {
    for (const entry of this.index.values()) {
      try {
        await fs.unlink(entry.filePath);
      } catch (error) {
        logger.warn('Failed to delete cached file during clear', { url: entry.url, filePath: entry.filePath, error });
      }
    }
    this.index.clear();
    await this.saveIndex();
  }

  private async pruneExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [url, entry] of this.index.entries()) {
      if (now - entry.createdAt > this.maxAgeMs) {
        expired.push(url);
      }
    }

    for (const url of expired) {
      await this.remove(url);
    }

    if (expired.length > 0) {
      logger.info('Pruned expired cache entries', { count: expired.length });
    }
  }

  private async enforceSizeLimit(AdditionalBytes: number = 0): Promise<void> {
    let currentSize = Array.from(this.index.values()).reduce((sum, e) => sum + e.size, 0);
    const targetSize = this.maxSizeBytes - AdditionalBytes;

    if (currentSize <= targetSize) return;

    const sortedEntries = Array.from(this.index.entries())
      .sort((a, b) => {
        const scoreA = a[1].lastAccessed + (a[1].accessCount * 60000);
        const scoreB = b[1].lastAccessed + (b[1].accessCount * 60000);
        return scoreA - scoreB;
      });

    for (const [url] of sortedEntries) {
      if (currentSize <= targetSize) break;
      const entry = this.index.get(url);
      if (entry) {
        currentSize -= entry.size;
        await this.remove(url);
      }
    }

    logger.debug('Enforced cache size limit', { freedSize: currentSize - targetSize });
  }

  getStats(): CacheStats {
    const entries = Array.from(this.index.values());
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    const totalAccesses = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const uniqueAccesses = entries.filter(e => e.accessCount > 0).length;
    const hitRate = uniqueAccesses > 0 ? (totalAccesses / entries.length) * 100 : 0;

    return {
      entries: entries.length,
      totalSize,
      hitRate
    };
  }

  async verifyCacheIntegrity(): Promise<void> {
    const corrupted: string[] = [];

    for (const [url, entry] of this.index.entries()) {
      try {
        const stat = await fs.stat(entry.filePath);
        if (stat.size !== entry.size) {
          corrupted.push(url);
          continue;
        }

        const hash = await computeHashes(entry.filePath, ['sha256']);
        if (!hash.sha256 || hash.sha256 !== entry.hash.sha256) {
          corrupted.push(url);
        }
      } catch {
        corrupted.push(url);
      }
    }

    for (const url of corrupted) {
      await this.remove(url);
    }

    if (corrupted.length > 0) {
      logger.warn('Cache integrity check completed', { corrupted: corrupted.length });
    }
  }
}
