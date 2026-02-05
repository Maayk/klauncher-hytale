import logger from './logger';

export interface PerformanceMetric {
  label: string;
  duration: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private marks = new Map<string, number>();

  start(label: string): void {
    this.marks.set(label, performance.now());
    logger.debug('Performance mark started', { label });
  }

  end(label: string): number {
    const startTime = this.marks.get(label);
    if (!startTime) {
      logger.warn('Performance mark not found', { label });
      return 0;
    }

    const duration = performance.now() - startTime;
    this.marks.delete(label);

    logger.info('Performance metric', {
      label,
      duration: `${duration.toFixed(2)}ms`
    });

    return duration;
  }

  measure(label: string, fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      this.end(label);
      return result;
    } catch (error) {
      this.end(label);
      throw error;
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();
