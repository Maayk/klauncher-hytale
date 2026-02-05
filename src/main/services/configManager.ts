import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import logger from '../../shared/utils/logger';
import {
  Settings,
  SettingsSchemaV1,
  SettingsSchemaV2,
  DEFAULT_SETTINGS,
  GameVersion,
  GAME_VERSION_SCHEMA
} from '../../shared/schemas/config';
import { MIGRATION_REGISTRY, LATEST_VERSION } from '../../shared/schemas/migrations';
import { z } from 'zod';

const CONFIG_DIR = app.getPath('userData');
const CONFIG_FILE = path.join(CONFIG_DIR, 'user-settings.json');
const GAME_VERSION_FILE = path.join(CONFIG_DIR, 'gameVersion.json');

class ConfigManager {
  private settings: Settings = DEFAULT_SETTINGS;
  private gameVersion: GameVersion | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.ensureConfigDirectory();
      await this.loadSettings();
      await this.loadGameVersion();
      this.initialized = true;
      logger.info('ConfigManager initialized', {
        version: this.settings.version,
        gameChannel: this.settings.gameChannel
      });
    } catch (error) {
      logger.error('Failed to initialize ConfigManager', { error });
      throw error;
    }
  }

  private async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        logger.error('Permission denied creating config directory', { error });
        throw error;
      } else {
        logger.error('Failed to create config directory', { error });
        throw error;
      }
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);

      const version = parsed.version || 1;
      logger.debug('Loading settings', { version, latestVersion: LATEST_VERSION });

      if (version < LATEST_VERSION) {
        logger.info('Migrating settings', { from: version, to: LATEST_VERSION });
        const migrated = await this.migrateSettings(parsed, version);
        this.settings = SettingsSchemaV2.parse(migrated);
        await this.saveSettings();
      } else {
        this.settings = SettingsSchemaV2.parse(parsed);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('Settings file not found, using defaults');
        this.settings = DEFAULT_SETTINGS;
        try {
          await this.saveSettings();
        } catch (saveError) {
          logger.warn('Could not save default settings, using in-memory defaults', { error: saveError });
        }
      } else if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        logger.error('Permission denied accessing settings file, using in-memory defaults', { error });
        this.settings = DEFAULT_SETTINGS;
      } else {
        logger.error('Failed to load settings', { error });
        this.settings = DEFAULT_SETTINGS;
      }
    }
  }

  private async migrateSettings(data: unknown, fromVersion: number): Promise<unknown> {
    let currentData = data;

    for (let version = fromVersion + 1; version <= LATEST_VERSION; version++) {
      const migration = MIGRATION_REGISTRY[version];
      if (migration) {
        logger.debug(`Applying migration v${version}`, { version });
        currentData = migration(currentData);
      }
    }

    return currentData;
  }

  async saveSettings(): Promise<void> {
    try {
      const validated = SettingsSchemaV2.parse(this.settings);
      await fs.writeFile(CONFIG_FILE, JSON.stringify(validated, null, 2), 'utf-8');
      logger.debug('Settings saved successfully');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        logger.warn('Permission denied saving settings file, settings will not persist to disk', { error });
      } else {
        logger.error('Failed to save settings', { error });
        throw error;
      }
    }
  }

  private async loadGameVersion(): Promise<void> {
    try {
      const data = await fs.readFile(GAME_VERSION_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.gameVersion = GAME_VERSION_SCHEMA.parse(parsed);
      logger.debug('Game version loaded', this.gameVersion);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Game version file not found');
        this.gameVersion = null;
      } else {
        logger.error('Failed to load game version', { error });
        this.gameVersion = null;
      }
    }
  }

  async saveGameVersion(version: GameVersion): Promise<void> {
    let validated: GameVersion;
    try {
      validated = GAME_VERSION_SCHEMA.parse(version);
      await fs.writeFile(GAME_VERSION_FILE, JSON.stringify(validated, null, 2), 'utf-8');
      this.gameVersion = validated;
      logger.debug('Game version saved', version);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        logger.warn('Permission denied saving game version file, version will not persist to disk', { error });
        // If we failed to save but validated correctly (which we must have if we reached writeFile or failed before but validated is undefined?)
        // Actually if parse throws, we go to catch. valdiated is undefined.
        // If writeFile throws, validated is defined.
        if (validated!) {
          this.gameVersion = validated;
        }
      } else {
        logger.error('Failed to save game version', { error });
        throw error;
      }
    }
  }

  getSettings(): Settings {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized');
    }
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized');
    }

    const merged = { ...this.settings, ...updates };
    const validated = SettingsSchemaV2.parse(merged);
    this.settings = validated;
    await this.saveSettings();

    logger.debug('Settings updated', { updates });
  }

  getGameVersion(): GameVersion | null {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized');
    }
    return this.gameVersion ? { ...this.gameVersion } : null;
  }

  getConfigDir(): string {
    return CONFIG_DIR;
  }

  getGameDir(): string {
    return this.settings.gameDir || path.join(CONFIG_DIR, 'game');
  }

  async setGameDir(dir: string): Promise<void> {
    const validation = await this.validateGameDir(dir);
    if (!validation.success) {
      throw new Error(`Invalid game directory: ${validation.error}`);
    }
    await this.updateSettings({ gameDir: dir });
  }

  private async validateGameDir(dir: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  getGameChannel(): 'latest' | 'beta' {
    return this.settings.gameChannel;
  }

  async setGameChannel(channel: 'latest' | 'beta'): Promise<void> {
    await this.updateSettings({ gameChannel: channel });
  }

  getLanguage(): string {
    return this.settings.language;
  }

  async setLanguage(language: 'pt-BR' | 'en-US' | 'es-ES'): Promise<void> {
    await this.updateSettings({ language });
  }

  getModsEnabled(): boolean {
    return this.settings.modsEnabled;
  }

  async setModsEnabled(enabled: boolean): Promise<void> {
    await this.updateSettings({ modsEnabled: enabled });
  }

  getMaxDownloadSpeed(): number | undefined {
    return this.settings.maxDownloadSpeed;
  }

  getMaxParallelDownloads(): number {
    return this.settings.maxParallelDownloads || 3;
  }

  getPlayerName(): string {
    return this.settings.playerName || 'Player';
  }

  async setPlayerName(name: string): Promise<void> {
    const sanitizedName = name.trim().substring(0, 16);
    if (sanitizedName.length === 0) {
      throw new Error('Player name cannot be empty');
    }
    await this.updateSettings({ playerName: sanitizedName });
  }

  getPlayerUUID(): string {
    return this.settings.playerUUID || '';
  }

  async ensurePlayerUUID(): Promise<string> {
    if (!this.settings.playerUUID) {
      const crypto = await import('node:crypto');
      const uuid = crypto.randomUUID();
      await this.updateSettings({ playerUUID: uuid });
      return uuid;
    }
    return this.settings.playerUUID;
  }
}

export const configManager = new ConfigManager();
