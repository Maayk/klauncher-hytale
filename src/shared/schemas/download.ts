import { z } from 'zod';

export const FILE_DOWNLOAD_TASK_SCHEMA = z.object({
  url: z.string().url(),
  destPath: z.string().min(1),
  expectedHash: z.object({
    path: z.string(),
    md5: z.string().length(32),
    sha1: z.string().length(40),
    sha256: z.string().length(64),
    size: z.number().int().positive()
  }).optional(),
  priority: z.enum(['high', 'normal', 'low']).optional()
});

export type FileDownloadTask = z.infer<typeof FILE_DOWNLOAD_TASK_SCHEMA>;

export const DOWNLOAD_SERVICE_CONFIG_SCHEMA = z.object({
  cacheDir: z.string().min(1),
  tempDir: z.string().min(1),
  maxCacheSizeMB: z.number().int().min(10).max(10000),
  cacheMaxAgeDays: z.number().int().min(1).max(365),
  maxConcurrentDownloads: z.number().int().min(1).max(16),
  maxBandwidthBytesPerSecond: z.number().int().min(0),
  retryCount: z.number().int().min(0).max(10)
});

export type DownloadServiceConfig = z.infer<typeof DOWNLOAD_SERVICE_CONFIG_SCHEMA>;

export const PATCHER_PROGRESS_SCHEMA = z.object({
  stage: z.enum(['checking', 'downloading', 'extracting', 'patching', 'verifying', 'complete']),
  percent: z.number().min(0).max(100),
  message: z.string(),
  currentFile: z.string().optional(),
  speed: z.string().optional(),
  eta: z.string().optional()
});

export type PatcherProgress = z.infer<typeof PATCHER_PROGRESS_SCHEMA>;

export const PATCHER_RESULT_SCHEMA = z.object({
  success: z.boolean(),
  version: z.string(),
  filesProcessed: z.number().int().min(0),
  filesSkipped: z.number().int().min(0),
  duration: z.number().int().min(0),
  patchType: z.enum(['none', 'patch', 'full'])
});

export type PatcherResult = z.infer<typeof PATCHER_RESULT_SCHEMA>;
