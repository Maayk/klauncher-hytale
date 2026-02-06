import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import logger from '../../shared/utils/logger';
import {
  Settings,
  SettingsSchemaV2,
  DEFAULT_SETTINGS,
  GameVersionInfo,
  GAME_VERSION_INFO_SCHEMA,
  GameVersionsMap,
  GAME_VERSIONS_MAP_SCHEMA
} from '../../shared/schemas/config';
import { MIGRATION_REGISTRY, LATEST_VERSION } from '../../shared/schemas/migrations';

class ConfigManager {
  private settings: Settings = DEFAULT_SETTINGS;
  private gameVersions: GameVersionsMap = {};
  private initialized = false;



  private getConfigFile(): string {
    return path.join(this.getConfigDir(), 'user-settings.json');
  }

  private getGameVersionFile(): string {
    return path.join(this.getConfigDir(), 'gameVersion.json');
  }

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
      await fs.mkdir(this.getConfigDir(), { recursive: true });
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
      const data = await fs.readFile(this.getConfigFile(), 'utf-8');
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
      await fs.writeFile(this.getConfigFile(), JSON.stringify(validated, null, 2), 'utf-8');
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
      const data = await fs.readFile(this.getGameVersionFile(), 'utf-8');
      const parsed = JSON.parse(data);

      // Try parsing as map first
      const mapResult = GAME_VERSIONS_MAP_SCHEMA.safeParse(parsed);
      if (mapResult.success) {
        this.gameVersions = mapResult.data;
      } else {
        // Fallback: try parsing as single object (legacy) and migrate
        const singleResult = GAME_VERSION_INFO_SCHEMA.safeParse(parsed);
        if (singleResult.success) {
          this.gameVersions = {
            [singleResult.data.channel]: singleResult.data
          };
        } else {
          logger.warn('Could not parse game version file, resetting');
          this.gameVersions = {};
        }
      }
      logger.debug('Game versions loaded', this.gameVersions);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Game version file not found, starting fresh');
        this.gameVersions = {};
      } else {
        logger.error('Failed to load game version', { error });
        this.gameVersions = {};
      }
    }
  }

  async saveGameVersion(channel: string, info: GameVersionInfo): Promise<void> {
    try {
      this.gameVersions[channel] = info;
      const validated = GAME_VERSIONS_MAP_SCHEMA.parse(this.gameVersions);
      await fs.writeFile(this.getGameVersionFile(), JSON.stringify(validated, null, 2), 'utf-8');
      logger.debug('Game version saved', { channel, info });
    } catch (error) {
      logger.error('Failed to save game version', { error });
      // Don't throw logic error, allows memory-only persistence in worst case?
      // But for professional app, maybe we should warn logic layer.
      // For now logging is sufficient, state is updated in memory.
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

  getGameVersion(channel: string): GameVersionInfo | null {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized');
    }
    return this.gameVersions[channel] || null;
  }

  getConfigDir(): string {
    return app.getPath('userData');
  }

  getGameDir(): string {
    return this.settings.gameDir || path.join(this.getConfigDir(), 'game');
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

  getGameChannel(): string {
    return this.settings.gameChannel;
  }

  async setGameChannel(channel: string): Promise<void> {
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
