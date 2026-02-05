import type { DownloadProgress } from '../schemas/patcher';

export interface GameProgressData {
  channel: 'latest' | 'beta';
  percent: number;
  message: string;
  currentFile?: string;
  totalFiles?: number;
  speed?: string;
  eta?: string;
}

export interface GameErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GameStartedData {
  pid: number;
  channel: 'latest' | 'beta';
}

export type PatcherProgressData = DownloadProgress;

export interface PatcherErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PatcherCompleteData {
  success: boolean;
  filesProcessed: number;
  filesSkipped: number;
  duration: number;
}

export interface JavaVersionData {
  version: string;
  path: string;
  isValid: boolean;
}

export interface GameStatusData {
  status: 'idle' | 'launching' | 'running' | 'stopped' | 'error';
  pid?: number;
  error?: string;
}
