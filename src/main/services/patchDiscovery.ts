import axios from 'axios';
import { CONFIG } from '../../shared/constants/config';
import logger from '../../shared/utils/logger';

export interface PatchInfo {
    url: string;
    fromVersion: number;
    toVersion: number;
    isFull: boolean; // True if it's 0 -> N (full download/install), False if N -> N+1 (incremental)
}

export class PatchDiscoveryService {
    private readonly baseUrl: string;
    private readonly maxSearchVersion = 100; // Reasonable upper bound for unreleased game

    constructor() {
        const sysOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
        const sysArch = 'amd64'; // Currently Hytale seems to only target amd64
        // Base URL now ends at architecture, channel is appended dynamically
        this.baseUrl = `${CONFIG.BUTLER_PATCH_URL_BASE}${sysOs}/${sysArch}/`;
    }

    private resolveCdnChannel(channel: string): string {
        if (channel === 'beta') return 'pre-release';
        return 'release';
    }

    /**
     * Generates the URL for a patch file.
     * Format: base/channel/from/to.pwr
     */
    private getPatchUrl(from: number, to: number, channel: string): string {
        const cdnChannel = this.resolveCdnChannel(channel);
        return `${this.baseUrl}${cdnChannel}/${from}/${to}.pwr`;
    }

    /**
     * Checks if a URL exists using a HEAD request.
     */
    private async probeUrl(url: string): Promise<boolean> {
        try {
            const response = await axios.head(url, {
                timeout: 8000,
                headers: { 'User-Agent': 'HytaleLauncher/1.0' },
                validateStatus: (status) => status >= 200 && status < 300
            });
            return true;
        } catch (error) {
            try {
                const response = await axios.get(url, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'HytaleLauncher/1.0', 'Range': 'bytes=0-0' },
                    validateStatus: (status) => status >= 200 && status < 300
                });
                return true;
            } catch (e) {
                return false;
            }
        }
    }

    /**
     * Finds the next incremental patch for the current version.
     */
    async findNextPatch(channel: string, currentVersion: number): Promise<PatchInfo | null> {
        const nextVersion = currentVersion + 1;
        const url = this.getPatchUrl(currentVersion, nextVersion, channel);

        logger.debug(`Probing next patch: ${currentVersion} -> ${nextVersion}`, { url });

        if (await this.probeUrl(url)) {
            logger.info(`Found next patch: ${currentVersion} -> ${nextVersion}`);
            return {
                url,
                fromVersion: currentVersion,
                toVersion: nextVersion,
                isFull: false
            };
        }

        return null;
    }

    /**
     * Finds the latest available FULL version (0 -> N) using Binary Search.
     */
    async findLatestBaseVersion(channel: string): Promise<PatchInfo | null> {
        logger.info('Starting binary search for latest base version...', { channel });

        let low = 0;
        let high = this.maxSearchVersion;
        let bestVersion = -1;

        // First ensure 0->1 exists (sanity check)
        if (!await this.probeUrl(this.getPatchUrl(0, 1, channel))) {
            logger.warn('Could not even find base patch 0->1. CDN might be unreachable or changed.');
            return null;
        }

        // Binary search for the highest N where 0->N exists
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (mid === 0) {
                low = 1;
                continue;
            }

            const url = this.getPatchUrl(0, mid, channel);

            if (await this.probeUrl(url)) {
                bestVersion = mid;
                low = mid + 1; // Try higher
            } else {
                high = mid - 1; // Try lower
            }
        }

        if (bestVersion > 0) {
            const url = this.getPatchUrl(0, bestVersion, channel);
            logger.info(`Found latest base version: ${bestVersion}`, { url });
            return {
                url,
                fromVersion: 0,
                toVersion: bestVersion,
                isFull: true
            };
        }

        return null;
    }

    /**
     * Gets the URL for a specific full version download.
     */
    getFullVersionUrl(version: number, channel: string): string {
        return this.getPatchUrl(0, version, channel);
    }
}


export const patchDiscovery = new PatchDiscoveryService();
