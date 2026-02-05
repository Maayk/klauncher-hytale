import { EventEmitter } from 'node:events';

export interface BandwidthConfig {
  maxSpeedBytesPerSecond: number;
  updateIntervalMs: number;
}

export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

export class BandwidthManager extends EventEmitter {
  private config: BandwidthConfig;
  private bucket: TokenBucketState;
  private intervalId: NodeJS.Timeout | null;

  constructor(config: Partial<BandwidthConfig> = {}) {
    super();
    this.config = {
      maxSpeedBytesPerSecond: config.maxSpeedBytesPerSecond ?? 0,
      updateIntervalMs: config.updateIntervalMs ?? 100
    };
    this.bucket = {
      tokens: 0,
      lastRefill: Date.now()
    };
    this.intervalId = null;

    if (this.config.maxSpeedBytesPerSecond > 0) {
      this.startRefill();
    }
  }

  private startRefill(): void {
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.bucket.lastRefill;
      const refillAmount = (this.config.maxSpeedBytesPerSecond * elapsed) / 1000;

      this.bucket.tokens = Math.min(
        this.bucket.tokens + refillAmount,
        this.config.maxSpeedBytesPerSecond
      );
      this.bucket.lastRefill = now;
    }, this.config.updateIntervalMs);
  }

  async acquire(bytes: number): Promise<void> {
    if (this.config.maxSpeedBytesPerSecond === 0) {
      return;
    }

    const startTime = Date.now();
    let acquired = 0;

    while (acquired < bytes) {
      const available = Math.min(this.bucket.tokens, bytes - acquired);
      this.bucket.tokens -= available;
      acquired += available;

      if (acquired < bytes) {
        const waitMs = Math.ceil((bytes - acquired) / this.config.maxSpeedBytesPerSecond * 1000);
        await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, this.config.updateIntervalMs)));
      }
    }

    const elapsed = Date.now() - startTime;
    const actualSpeed = (bytes / elapsed) * 1000;

    this.emit('throttle', {
      bytes,
      elapsed,
      speed: actualSpeed,
      limit: this.config.maxSpeedBytesPerSecond
    });
  }

  updateConfig(config: Partial<BandwidthConfig>): void {
    if (config.maxSpeedBytesPerSecond !== undefined) {
      this.config.maxSpeedBytesPerSecond = config.maxSpeedBytesPerSecond;

      if (this.config.maxSpeedBytesPerSecond > 0 && !this.intervalId) {
        this.startRefill();
      } else if (this.config.maxSpeedBytesPerSecond === 0 && this.intervalId) {
        this.stopRefill();
      }
    }

    if (config.updateIntervalMs !== undefined) {
      this.config.updateIntervalMs = config.updateIntervalMs;
      if (this.intervalId) {
        this.stopRefill();
        this.startRefill();
      }
    }
  }

  private stopRefill(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy(): void {
    this.stopRefill();
    this.removeAllListeners();
  }

  getCurrentLimit(): number {
    return this.config.maxSpeedBytesPerSecond;
  }

  getAvailableTokens(): number {
    return this.bucket.tokens;
  }
}
