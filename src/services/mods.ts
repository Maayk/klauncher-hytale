import axios from 'axios';
import path from 'node:path';
import fs from 'fs-extra';
import { app } from 'electron';
import logger from '../shared/utils/logger';
import os from 'node:os';

const CF_API_KEY = '$2a$10$S7nVFhQKpxteK4Fwf9yoxejmI.NjJiE53Qh4IeaDbIu/./oTM/MKa';
const CF_API_URL = 'https://api.curseforge.com/v1';
const GAME_ID = 70216;

const modsDir = path.join(app.getPath('appData'), 'Kyamtale', 'UserData', 'Mods');
const manifestPath = path.join(modsDir, 'mods.json');

function logToDesktop(msg: string) {
  try {
    const logPath = path.join(os.homedir(), 'Desktop', 'launcher_debug.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    // ignore
  }
}

interface CurseForgeMod {
  id: number;
  name: string;
  summary: string;
  logo: {
    id: number;
    modId: number;
    title: string;
    thumbnailUrl: string;
    url: string;
  };
  authors: Array<{ name: string }>;
  downloadCount: number;
  dateModified: string;
  latestFiles: Array<{ displayName: string }>;
}

interface ModManifest {
  [fileName: string]: CurseForgeMod;
}

async function loadManifest(): Promise<ModManifest> {
  try {
    if (await fs.pathExists(manifestPath)) {
      return await fs.readJson(manifestPath);
    }
    return {};
  } catch (error) {
    logger.warn('Failed to load mods manifest', { error });
    return {};
  }
}

async function saveManifest(manifest: ModManifest): Promise<void> {
  try {
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  } catch (error) {
    logger.error('Failed to save mods manifest', { error });
  }
}

export async function searchMods(query = ''): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    await fs.ensureDir(modsDir);

    const headers = {
      'x-api-key': CF_API_KEY,
      'Accept': 'application/json'
    };

    let response;
    if (query || GAME_ID === 70216) {
      response = await axios.get(`${CF_API_URL}/mods/search`, {
        params: {
          gameId: GAME_ID,
          searchFilter: query,
          sortField: 2,
          sortOrder: 'desc'
        },
        headers
      });
    } else {
      response = await axios.post(`${CF_API_URL}/mods/featured`, {
        gameId: GAME_ID,
        excludedModIds: [],
        gameVersionTypeId: 0
      }, { headers });
    }

    let modsRaw: CurseForgeMod[] = [];
    if (query || GAME_ID === 70216) {
      modsRaw = response.data.data;
    } else {
      const featured = response.data.data.featured || [];
      const popular = response.data.data.popular || [];
      const map = new Map();
      [...featured, ...popular].forEach((m: CurseForgeMod) => map.set(m.id, m));
      modsRaw = Array.from(map.values());
    }

    const hytaleMods = modsRaw.map((mod: CurseForgeMod) => ({
      id: mod.id,
      name: mod.name,
      summary: mod.summary,
      description: null,
      logo: mod.logo,
      author: mod.authors && mod.authors.length > 0 ? mod.authors[0].name : 'Unknown',
      downloads: mod.downloadCount,
      lastUpdated: new Date(mod.dateModified).toLocaleDateString(),
      version: mod.latestFiles && mod.latestFiles.length > 0 ? mod.latestFiles[0].displayName : 'Unknown'
    }));

    return { success: true, data: hytaleMods };
  } catch (error) {
    logger.error('CurseForge API Error', { error: error instanceof Error ? error.message : error });
    return { success: false, error: 'Erro ao conectar com CurseForge: ' + (error as Error).message };
  }
}

export async function listInstalledMods(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    await fs.ensureDir(modsDir);
    const files = await fs.readdir(modsDir);
    const manifest = await loadManifest();

    const mods = files
      .filter(file => /\.(jar|zip)(\.disabled)?$/.test(file))
      .map(file => {
        const isEnabled = !file.endsWith('.disabled');
        // Handle both simple .disabled and .jar.disabled if that case occurs, but usually it's .jar.disabled or .jar
        // My toggle logic below does fileName + .disabled.

        const manifestData = manifest[file];

        // If we have manifest data, use it for rich display
        if (manifestData) {
          return {
            id: manifestData.id, // Important for matching!
            name: manifestData.name, // The real name (e.g. "EyeSpy")
            fileName: file,
            enabled: isEnabled,
            path: path.join(modsDir, file),
            summary: manifestData.summary,
            logo: manifestData.logo,
            author: manifestData.authors && manifestData.authors.length > 0 ? manifestData.authors[0].name : 'Unknown',
            version: manifestData.latestFiles && manifestData.latestFiles.length > 0 ? manifestData.latestFiles[0].displayName : 'Unknown'
          };
        }

        // Fallback for manually installed mods
        return {
          id: -1, // No ID for manual mods
          name: file.replace(/\.(jar|zip)/, '').replace('.disabled', ''),
          fileName: file,
          enabled: isEnabled,
          path: path.join(modsDir, file),
          author: 'Manual Install',
          summary: 'Mod instalado manualmente'
        };
      });

    return { success: true, data: mods };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function installMod(modData: any): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.ensureDir(modsDir);

    const headers = { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' };

    // Fetch full mod details to ensure we have correct metadata for the manifest
    // (The modData passed from frontend is a simplified version)
    const modInfoPromise = axios.get(`${CF_API_URL}/mods/${modData.id}`, { headers });

    const filesResponsePromise = axios.get(`${CF_API_URL}/mods/${modData.id}/files`, {
      headers,
      params: { pageSize: 1 }
    });

    const [modInfoResponse, filesResponse] = await Promise.all([modInfoPromise, filesResponsePromise]);
    const fullModData = modInfoResponse.data.data;

    const files = filesResponse.data.data;
    if (!files || files.length === 0) {
      return { success: false, error: 'Nenhum arquivo encontrado para este mod.' };
    }

    const latestFile = files[0];
    const downloadUrl = latestFile.downloadUrl;
    const fileName = latestFile.fileName;
    const destPath = path.join(modsDir, fileName);

    if (!downloadUrl) {
      return { success: false, error: 'Nenhuma URL de download direta encontrada.' };
    }

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      headers: { 'x-api-key': CF_API_KEY }
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    // Save metadata to manifest using the FULL mod data
    const manifest = await loadManifest();
    manifest[fileName] = fullModData;
    await saveManifest(manifest);

    return { success: true };
  } catch (error) {
    logger.error('Install Error', { error: error instanceof Error ? error.message : error, modId: modData.id });
    return { success: false, error: (error as Error).message };
  }
}

export async function toggleMod(fileName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const oldPath = path.join(modsDir, fileName);
    let newFileName;

    if (fileName.endsWith('.disabled')) {
      newFileName = fileName.replace('.disabled', '');
    } else {
      newFileName = fileName + '.disabled';
    }

    const newPath = path.join(modsDir, newFileName);

    await fs.rename(oldPath, newPath);

    // Update manifest key
    const manifest = await loadManifest();
    if (manifest[fileName]) {
      manifest[newFileName] = manifest[fileName];
      delete manifest[fileName];
      await saveManifest(manifest);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteMod(fileName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.remove(path.join(modsDir, fileName));

    // Remove from manifest
    const manifest = await loadManifest();
    if (manifest[fileName]) {
      delete manifest[fileName];
      await saveManifest(manifest);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
