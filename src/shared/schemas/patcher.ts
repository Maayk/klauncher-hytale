import { z } from 'zod';

export const DOWNLOAD_PROGRESS_SCHEMA = z.object({
  channel: z.enum(['latest', 'beta']),
  percent: z.number().min(0).max(100),
  message: z.string(),
  currentFile: z.string().optional(),
  totalFiles: z.number().optional(),
  speed: z.string().optional(),
  eta: z.string().optional()
});

export type DownloadProgress = z.infer<typeof DOWNLOAD_PROGRESS_SCHEMA>;

export const GAME_LAUNCH_PARAMS_SCHEMA = z.object({
  username: z.string().min(1).max(50),
  channel: z.enum(['latest', 'beta'])
});

export type GameLaunchParams = z.infer<typeof GAME_LAUNCH_PARAMS_SCHEMA>;

export const PATCHER_RESULT_SCHEMA = z.object({
  success: z.boolean(),
  filesProcessed: z.number(),
  filesSkipped: z.number(),
  duration: z.number()
});

export type PatcherResult = z.infer<typeof PATCHER_RESULT_SCHEMA>;

export const FILE_HASH_SCHEMA = z.object({
  path: z.string().optional(),
  md5: z.string().length(32),
  sha1: z.string().length(40),
  sha256: z.string().length(64),
  size: z.number().int().positive()
});

export type FileHash = z.infer<typeof FILE_HASH_SCHEMA>;
