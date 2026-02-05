import logger from './logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  retryableErrors: (error: unknown) => {
    if (error instanceof Error) {
      const retryablePatterns = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EPIPE',
        'timeout',
        'network'
      ];

      return retryablePatterns.some(pattern =>
        error.message.toLowerCase().includes(pattern.toLowerCase())
      );
    }
    return false;
  }
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      logger.debug(`Retry attempt ${attempt}/${opts.maxAttempts}`, {
        maxAttempts: opts.maxAttempts
      });

      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === opts.maxAttempts;
      const isRetryable = opts.retryableErrors ? opts.retryableErrors(error) : false;

      if (isLastAttempt || !isRetryable) {
        logger.error('Retry failed - max attempts reached or non-retryable error', {
          attempt,
          maxAttempts: opts.maxAttempts,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt - 1),
        opts.maxDelay
      );

      logger.warn(`Retry attempt ${attempt} failed, retrying in ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
        nextAttempt: attempt + 1,
        delay
      });

      if (opts.onRetry) {
        opts.onRetry(attempt, error);
      }

      await sleep(delay);
    }
  }

  throw new Error('Retry logic failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
