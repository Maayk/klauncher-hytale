import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import logger from '../../shared/utils/logger';
import { javaManager, JavaProgress } from './javaManager';
import { GamePatcher } from './gamePatcher';
import { serverPatcher } from './serverPatcher';
import { configManager } from './configManager';
import { DownloadService } from './downloadService';

import { ZeroToOneInstaller } from './zeroToOneInstaller';

export interface AuthTokens {
  identityToken: string;
  sessionToken: string;
}

export interface LaunchProgress {
  stage: 'java' | 'patch' | 'client_patch' | 'server_patch' | 'launching' | 'launched' | 'error';
  message: string;
  progress: number;
}

export interface LaunchOptions {
  username: string;
  gameChannel?: string;
  useCustomJava?: boolean;
  customJavaPath?: string;
  hideLauncher?: boolean;
}

type ProgressCallback = (progress: LaunchProgress) => void;
type StatusCallback = (status: string) => void;
type ErrorCallback = (error: string) => void;
type SuccessCallback = (message: string) => void;

class GameLauncher {
  private readonly GAME_PATH_PARTS = ['install', 'release', 'package', 'game'];
  private readonly USER_AGENT = 'KyamtaleLauncher (https://github.com/kyamtale/launcher, 1.0.0)';
  private readonly AUTH_SERVER_URL = 'https://sessions.sanasol.ws';
  private gameProcess: ChildProcess | null = null;

  private downloadService: DownloadService | null = null;
  private gamePatcher: GamePatcher | null = null;
  private zeroToOneInstaller: ZeroToOneInstaller | null = null;

  private ensureServices(): void {
    if (this.downloadService && this.gamePatcher && this.zeroToOneInstaller) return;

    this.downloadService = new DownloadService({
      cacheDir: path.join(app.getPath('userData'), 'cache'),
      tempDir: path.join(app.getPath('userData'), 'temp'),
      maxCacheSizeMB: 1024,
      cacheMaxAgeDays: 7,
      maxConcurrentDownloads: 3,
      maxBandwidthBytesPerSecond: 0,
      retryCount: 3,
    });

    this.gamePatcher = new GamePatcher(this.downloadService);
    this.zeroToOneInstaller = new ZeroToOneInstaller(this.downloadService);
  }



  private buildGameDir(rootPath: string, channel: string): string {
    return path.join(rootPath, ...this.GAME_PATH_PARTS, channel);
  }

  private async generateLocalTokens(uuid: string, name: string): Promise<AuthTokens> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 36000;

    const header = Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        kid: '2025-10-01',
        typ: 'JWT',
      })
    ).toString('base64url');

    const identityPayload = Buffer.from(
      JSON.stringify({
        sub: uuid,
        name: name,
        username: name,
        entitlements: ['game.base'],
        scope: 'hytale:server hytale:client',
        iat: now,
        exp: exp,
        iss: this.AUTH_SERVER_URL,
        jti: crypto.randomUUID(),
      })
    ).toString('base64url');

    const sessionPayload = Buffer.from(
      JSON.stringify({
        sub: uuid,
        scope: 'hytale:server',
        iat: now,
        exp: exp,
        iss: this.AUTH_SERVER_URL,
        jti: crypto.randomUUID(),
      })
    ).toString('base64url');

    const signature = crypto.randomBytes(64).toString('base64url');

    return {
      identityToken: `${header}.${identityPayload}.${signature}`,
      sessionToken: `${header}.${sessionPayload}.${signature}`,
    };
  }

  private async fetchAuthTokens(uuid: string, name: string): Promise<AuthTokens> {
    try {
      logger.info('Requesting auth tokens', { server: this.AUTH_SERVER_URL });

      const response = await fetch(`${this.AUTH_SERVER_URL}/game-session/child`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.USER_AGENT,
        },
        body: JSON.stringify({
          uuid: uuid,
          name: name,
          scopes: ['hytale:server', 'hytale:client'],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server returned ${response.status}: ${text}`);
      }

      const data = await response.json() as Record<string, unknown>;
      logger.info('Tokens obtained from server');

      return {
        identityToken: (data.IdentityToken || data.identityToken) as string,
        sessionToken: (data.SessionToken || data.sessionToken) as string,
      };
    } catch (error) {
      logger.error('Error fetching auth tokens, using fallback', { error });
      return this.generateLocalTokens(uuid, name);
    }
  }

  private async cleanupTempFiles(userDir: string): Promise<void> {
    const tempFiles = [
      'Settings.json.tmp',
      'AssetsIndex.json.tmp',
      'CachedAssetsIndex.cache.tmp',
    ];

    for (const tempFile of tempFiles) {
      const tempPath = path.join(userDir, tempFile);
      try {
        if (await fs.pathExists(tempPath)) {
          logger.warn('Removing temporary file before launch', { path: tempPath });
          await fs.unlink(tempPath);
          logger.debug('Temporary file removed', { path: tempPath });
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'EBUSY') {
          logger.warn('Could not remove temporary file (file locked by another process), will continue anyway', { path: tempPath, error });
        } else {
          logger.warn('Could not remove temporary file', { path: tempPath, error });
        }
      }
    }
  }

  async launchGame(
    window: BrowserWindow,
    options: LaunchOptions,
    callbacks: {
      onProgress?: ProgressCallback;
      onStatus?: StatusCallback;
      onError?: ErrorCallback;
      onSuccess?: SuccessCallback;
      onStopped?: () => void;
    }
  ): Promise<void> {
    const { username, gameChannel, useCustomJava, customJavaPath, hideLauncher } = options;
    const { onProgress, onStatus, onError, onSuccess, onStopped } = callbacks;

    logger.info('Launch game requested', { username, gameChannel });

    this.ensureServices();
    const gamePatcher = this.gamePatcher!;
    const zeroToOneInstaller = this.zeroToOneInstaller!;

    const hytaleRoot = app.getPath('userData');
    const settings = await configManager.getSettings();

    // Use channel directly (dynamic versioning)
    const channel = gameChannel || settings.gameChannel || 'latest';
    const gameDir = this.buildGameDir(hytaleRoot, channel);
    const executablePath = path.join(gameDir, 'Client', 'HytaleClient.exe');
    const userDir = path.join(hytaleRoot, 'UserData');

    await fs.ensureDir(userDir);
    await fs.ensureDir(path.join(userDir, 'Logs'));
    await fs.ensureDir(path.join(userDir, 'Telemetry'));
    await fs.ensureDir(path.join(userDir, 'CachedAvatarPreviews'));
    await fs.ensureDir(path.join(userDir, 'CachedPlayerSkins'));

    await this.cleanupTempFiles(userDir);

    // ZERO-TO-ONE: Ensure Base Package is installed
    try {
      const setupUrl = settings.setupUrl;
      if (setupUrl) {
        await zeroToOneInstaller.installBasePackage(setupUrl, (message, percent) => {
          onProgress?.({ stage: 'java', message, progress: percent * 0.1 }); // Map base install to first 10%
          onStatus?.(message);
        });
      } else {
        logger.warn('No setupUrl defined in settings, skipping ZeroToOne check');
      }
    } catch (error) {
      const message = `Erro ao instalar ambiente base: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Base installation failed', { error });
      onError?.(message);
      throw new Error(message);
    }

    let javaExec: string;

    try {
      onProgress?.({ stage: 'java', message: 'Verificando Java Runtime...', progress: 10 });
      onStatus?.('Verificando Java Runtime...');

      const javaProgressHandler = (progress: JavaProgress) => {
        onProgress?.({
          stage: 'java',
          message: progress.message,
          progress: 10 + (progress.progress * 0.4),
        });
        onStatus?.(progress.message);
      };

      javaExec = await javaManager.ensureJavaInstalled(javaProgressHandler);
    } catch (error) {
      const message = `Erro ao instalar Java: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Java installation failed', { error });
      onError?.(message);
      throw new Error(message);
    }

    try {
      const executableExists = await fs.access(executablePath).then(() => true).catch(() => false);

      if (!executableExists) {
        onProgress?.({ stage: 'patch', message: 'Baixando e instalando Hytale...', progress: 50 });
        onStatus?.('Baixando e instalando Hytale...');

        const patchProgressHandler = (stage: string, progress: number, message: string) => {
          onProgress?.({
            stage: 'patch',
            message,
            progress: 50 + (progress * 0.3),
          });
          onStatus?.(message);
        };

        await gamePatcher.patchGame(gameDir, channel, patchProgressHandler);
      }
    } catch (error) {
      const message = `Erro ao instalar jogo: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Game installation failed', { error });
      onError?.(message);
      throw new Error(message);
    }

    try {
      const executableExists = await fs.access(executablePath).then(() => true).catch(() => false);

      if (!executableExists) {
        throw new Error('Game executable not found after patching');
      }

      onProgress?.({ stage: 'client_patch', message: 'Parcheando cliente...', progress: 80 });
      onStatus?.('Parcheando cliente...');

      await gamePatcher.patchClient(executablePath);

      const serverPath = path.join(gameDir, 'Server', 'HytaleServer.jar');
      const serverExists = await fs.access(serverPath).then(() => true).catch(() => false);

      if (serverExists) {
        onProgress?.({ stage: 'server_patch', message: 'Parcheando servidor...', progress: 85 });
        onStatus?.('Parcheando servidor...');

        const serverPatchProgress = (message: string) => {
          onStatus?.(message);
        };

        const result = await serverPatcher.patchServer(serverPath, serverPatchProgress);

        if (!result.success) {
          logger.warn('Server patch failed', { message: result.message });
        }
      } else {
        logger.warn('Server JAR not found', { path: serverPath });
      }
    } catch (error) {
      const message = `Erro ao patchear cliente/servidor: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Client/server patch failed', { error });
      onError?.(message);
      throw new Error(message);
    }

    let playerUUID = await configManager.ensurePlayerUUID();

    const tokens = await this.fetchAuthTokens(playerUUID, username);

    const args = [
      '--app-dir', gameDir,
      '--user-dir', userDir,
      '--java-exec', (useCustomJava && customJavaPath) ? customJavaPath : javaExec,
      '--auth-mode', 'authenticated',
      '--uuid', playerUUID,
      '--name', username,
      '--identity-token', tokens.identityToken,
      '--session-token', tokens.sessionToken,
    ];

    logger.info('Launching game', { executable: executablePath, args });

    if (hideLauncher) {
      window.hide();
    }

    onProgress?.({ stage: 'launching', message: 'Iniciando Hytale...', progress: 95 });
    onStatus?.('Iniciando Hytale...');

    return new Promise<void>((resolve, reject) => {
      this.gameProcess = spawn(executablePath, args, {
        cwd: gameDir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.gameProcess.stdout?.on('data', (data: Buffer) => {
        logger.info(`[Game] ${data.toString().trim()}`);
      });

      this.gameProcess.stderr?.on('data', (data: Buffer) => {
        logger.error(`[Game Error] ${data.toString().trim()}`);
      });

      this.gameProcess.on('error', (err) => {
        const message = `Erro ao iniciar processo: ${err.message}`;
        logger.error('Failed to start game process', { error: err });
        onError?.(message);
        window.show();
        window.focus();
        reject(new Error(message));
      });

      this.gameProcess.on('close', (code) => {
        logger.info(`Game process exited with code ${code}`);
        window.show();
        window.focus();
        onStatus?.('');

        if (code !== 0) {
          onError?.(`O jogo fechou com código: ${code}`);
        } else {
          onSuccess?.('Jogo terminado');
        }

        // Always call onStopped when process exits
        onStopped?.();
        this.gameProcess = null;
      });

      this.gameProcess.unref();

      onProgress?.({ stage: 'launched', message: 'Jogo iniciado', progress: 100 });
      onSuccess?.('Jogo iniciado');
      resolve();
    });
  }

  async killGame(): Promise<void> {
    if (this.gameProcess) {
      try {
        this.gameProcess.kill('SIGTERM');
        logger.info('Game process terminated');
      } catch (error) {
        logger.error('Failed to kill game process', { error });
      }
      this.gameProcess = null;
    }

    const hytaleRoot = path.join(app.getPath('appData'), 'Kyamtale');
    const userDir = path.join(hytaleRoot, 'UserData');

    try {
      await this.cleanupTempFiles(userDir);
    } catch (error) {
      logger.warn('Could not cleanup temp files after kill', { error });
    }
  }

  isGameRunning(): boolean {
    return this.gameProcess !== null && !this.gameProcess.killed;
  }

  async forceKillGame(): Promise<void> {
    // 1. Kill internal process reference if exists
    await this.killGame();

    // 2. Force kill any system process named HytaleClient.exe
    return new Promise((resolve) => {
      logger.info('Attempting to force kill Hytale processes...');
      const cmd = process.platform === 'win32'
        ? 'taskkill /F /IM HytaleClient.exe /T'
        : 'pkill -f HytaleClient'; // fallback for unix-like

      import('child_process').then(({ exec }) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            if (stderr.includes('not found') || stdout.includes('not found') || err.message.includes('not found')) {
              logger.info('No external Hytale process found to kill.');
            } else {
              logger.warn('Error during force kill', { error: err.message });
            }
          } else {
            logger.info('Force kill command executed', { stdout });
          }
          resolve();
        });
      });
    });
  }
}

export const gameLauncher = new GameLauncher();
