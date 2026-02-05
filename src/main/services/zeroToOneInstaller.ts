import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import logger from '../../shared/utils/logger';
import { DownloadService } from './downloadService';
import { pathManager } from './pathManager';
import AdmZip from 'adm-zip';

export class ZeroToOneInstaller {
    private downloadService: DownloadService;

    constructor(downloadService: DownloadService) {
        this.downloadService = downloadService;
    }

    async isBaseInstalled(): Promise<boolean> {
        const javaPath = pathManager.getJavaExecutable();
        const envDat = path.join(pathManager.getHytaleRoot(), 'install', 'release', 'env.dat');

        const javaExists = await fs.pathExists(javaPath);
        const envExists = await fs.pathExists(envDat);

        return javaExists && envExists;
    }

    async installBasePackage(setupUrl: string, onProgress?: (message: string, percent: number) => void): Promise<void> {
        if (await this.isBaseInstalled()) {
            logger.info('Base setup already installed');
            return;
        }

        logger.info('Starting Base Setup installation...');
        onProgress?.('Baixando ambiente base...', 0);

        const tempDir = pathManager.getCacheDir();
        await fs.ensureDir(tempDir);
        const zipPath = path.join(tempDir, 'setup-base.zip');

        // 1. Download
        const downloadResult = await this.downloadService.downloadFile({
            url: setupUrl,
            destPath: zipPath,
            priority: 'high'
        }, (progress) => {
            onProgress?.(`Baixando base... ${Math.round(progress.percent)}%`, progress.percent);
        });

        if (!downloadResult.success) {
            console.error('ZeroToOne Download Failed:', downloadResult);
            throw new Error(`Failed to download Base Setup: ${JSON.stringify(downloadResult)}`);
        }

        // 2. Extract
        onProgress?.('Extraindo ambiente base...', 90);
        logger.info('Extracting Base Setup...');

        const hytaleRoot = pathManager.getHytaleRoot();
        await fs.ensureDir(hytaleRoot);

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(hytaleRoot, true); // Overwrite existing if needed

        // 3. Cleanup
        await fs.unlink(zipPath).catch(() => { });

        onProgress?.('Ambiente base instalado!', 100);
        logger.info('Base Setup completed structure');
    }
}
