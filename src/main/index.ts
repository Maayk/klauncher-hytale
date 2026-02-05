import { app, ipcMain } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../shared/constants/channels';
import { fetchHytaleNews } from '../services/news';
import { searchMods, listInstalledMods, installMod, toggleMod, deleteMod } from '../services/mods';
import { configManager } from './services/configManager';
import { setupIpcHandlers } from './ipc';
import { createSplashWindow, createMainWindow, getMainWindow } from './windowManager';
import { gameLauncher } from './services/gameLauncher';
import logger from '../shared/utils/logger';

const distPath = path.join(__dirname, '..');
process.env.DIST = distPath;
process.env.PUBLIC = app.isPackaged ? distPath : path.join(distPath, '../public');

// FORCE UNIFICATION: Set UserData to %APPDATA%/Kyamtale
// This prevents Electron from creating a separate 'kyam-launcher' folder
const appDataPath = app.getPath('appData');
app.setPath('userData', path.join(appDataPath, 'Kyamtale'));

// IPC Handlers
app.whenReady().then(async () => {
    try {
        await configManager.initialize();
        logger.info('Application ready, config loaded');
    } catch (error) {
        logger.error('Failed to initialize config manager, using defaults', { error });
    }

    setupIpcHandlers();

    createSplashWindow();
    createMainWindow();

    ipcMain.handle(IPC_CHANNELS.WINDOW.MINIMIZE, () => {
        logger.info('IPC: Window minimize requested');
        getMainWindow()?.minimize();
    });
    ipcMain.handle(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
        getMainWindow()?.maximize();
    });
    ipcMain.handle(IPC_CHANNELS.WINDOW.CLOSE, () => {
        logger.info('IPC: Window close requested');
        app.quit();
    });

    // News handler
    ipcMain.handle(IPC_CHANNELS.NEWS.GET, async () => {
        try {
            const news = await fetchHytaleNews();
            return { success: true, data: news };
        } catch (error) {
            logger.error('News fetch error', { error });
            return { success: false, data: [], error: (error as Error).message };
        }
    });

    // Shell handler for opening external links
    ipcMain.handle(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, async (_event, url: string) => {
        const { shell } = await import('electron');
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            shell.openExternal(url);
        }
    });

    ipcMain.handle(IPC_CHANNELS.SHELL.OPEN_PATH, async (_event, path: string) => {
        const { shell } = await import('electron');
        try {
            await shell.openPath(path);
            return { success: true };
        } catch (error) {
            logger.error('Failed to open path', { path, error });
            return { success: false, error: (error as Error).message };
        }
    });

    // Mods handlers
    ipcMain.handle(IPC_CHANNELS.MODS.SEARCH, async (_event, query = '') => {
        return await searchMods(query);
    });

    ipcMain.handle(IPC_CHANNELS.MODS.LIST_INSTALLED, async () => {
        return await listInstalledMods();
    });

    ipcMain.handle(IPC_CHANNELS.MODS.INSTALL, async (_event, modData) => {
        return await installMod(modData);
    });

    ipcMain.handle(IPC_CHANNELS.MODS.TOGGLE, async (_event, fileName) => {
        return await toggleMod(fileName);
    });

    ipcMain.handle(IPC_CHANNELS.MODS.DELETE, async (_event, fileName) => {
        return await deleteMod(fileName);
    });
});

app.on('before-quit', async () => {
    try {
        await gameLauncher.killGame();
        logger.info('Game cleanup completed');
    } catch (error) {
        logger.error('Error during game cleanup', { error });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

