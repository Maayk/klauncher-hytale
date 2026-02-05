import { BrowserWindow } from 'electron';
import * as path from 'path';
import logger from '../shared/utils/logger';

export let mainWindow: BrowserWindow | null = null;
export let splashWindow: BrowserWindow | null = null;

const DIST_PATH = path.join(__dirname, '..');

export function createSplashWindow(): BrowserWindow {
  logger.info('Creating splash window');

  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    splashWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/splash`);
  } else {
    splashWindow.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'splash' });
  }

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

export function createMainWindow(): BrowserWindow {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    frame: false,
    backgroundColor: '#151515',
    show: false,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow?.show();
    logger.info('Main window shown');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    logger.info('Splash window closed');
  }
}

export function closeMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    logger.info('Main window closed');
  }
}
