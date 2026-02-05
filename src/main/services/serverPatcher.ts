import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import logger from '../../shared/utils/logger';
import { CONFIG } from '../../shared/constants/config';

export interface PatchResult {
  success: boolean;
  patchedCount: number;
  message: string;
}

export interface ReplacementRule {
  type: 'simple' | 'smart_domain';
  oldVal: string;
  newVal: string;
}

type ProgressCallback = (message: string) => void;

class ServerPatcher {
  private readonly ORIGINAL_DOMAIN: string;
  private readonly TARGET_DOMAIN: string;
  private readonly PATCHED_FLAG: string;
  private readonly DEFAULT_REPLACEMENTS: ReplacementRule[];

  constructor() {
    this.ORIGINAL_DOMAIN = 'hytale.com';
    this.TARGET_DOMAIN = CONFIG.TARGET_DOMAIN;
    this.PATCHED_FLAG = 'patched_server.json';
    this.DEFAULT_REPLACEMENTS = [
      { type: 'simple', oldVal: this.ORIGINAL_DOMAIN, newVal: this.TARGET_DOMAIN }
    ];
  }

  private stringToUtf8(str: string): Buffer {
    return Buffer.from(str, 'utf8');
  }

  private encodeUtf16(str: string): Buffer {
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    return buf;
  }

  private getPatternIndices(buffer: Buffer, pattern: Buffer): number[] {
    const indices: number[] = [];
    let pos = 0;
    while (pos < buffer.length) {
      const index = buffer.indexOf(pattern, pos);
      if (index === -1) break;
      indices.push(index);
      pos = index + 1;
    }
    return indices;
  }

  private findAllOccurrences(buffer: Buffer, pattern: Buffer): number[] {
    return this.getPatternIndices(buffer, pattern);
  }

  private findAndReplaceDomainUtf8(
    data: Buffer,
    oldDomain: string,
    newDomain: string
  ): { buffer: Buffer; count: number } {
    let count = 0;
    const result = Buffer.from(data);
    const oldUtf8 = this.stringToUtf8(oldDomain);
    const newUtf8 = this.stringToUtf8(newDomain);

    const positions = this.findAllOccurrences(result, oldUtf8);

    for (const pos of positions) {
      newUtf8.copy(result, pos);
      count++;
    }

    return { buffer: result, count };
  }

  private replaceBinaryStrings(
    buffer: Buffer,
    replacementMap: ReplacementRule[],
    encoding: 'utf8' | 'utf16' = 'utf8'
  ): { buffer: Buffer; count: number } {
    let totalReplacements = 0;
    let modifiedBuffer = Buffer.from(buffer);

    for (const { type, oldVal, newVal } of replacementMap) {
      if (type === 'simple') {
        const oldBytes = encoding === 'utf16' ? this.encodeUtf16(oldVal) : this.stringToUtf8(oldVal);
        const newBytes = encoding === 'utf16' ? this.encodeUtf16(newVal) : this.stringToUtf8(newVal);
        const matches = this.getPatternIndices(modifiedBuffer, oldBytes);

        for (const pos of matches) {
          newBytes.copy(modifiedBuffer, pos);
          totalReplacements++;
        }
      } else if (type === 'smart_domain') {
        const oldBytesStub = encoding === 'utf16' 
          ? this.encodeUtf16(oldVal.slice(0, -1)) 
          : this.stringToUtf8(oldVal.slice(0, -1));
        const newBytesStub = encoding === 'utf16' 
          ? this.encodeUtf16(newVal.slice(0, -1)) 
          : this.stringToUtf8(newVal.slice(0, -1));

        const oldEndByte = encoding === 'utf16' 
          ? oldVal.charCodeAt(oldVal.length - 1) 
          : oldVal.charCodeAt(oldVal.length - 1);
        const newEndByte = encoding === 'utf16' 
          ? newVal.charCodeAt(newVal.length - 1) 
          : newVal.charCodeAt(newVal.length - 1);

        const matches = this.getPatternIndices(modifiedBuffer, oldBytesStub);

        for (const pos of matches) {
          const endBytePos = pos + oldBytesStub.length;
          if (endBytePos + 1 > modifiedBuffer.length) continue;

          if (modifiedBuffer[endBytePos] === oldEndByte) {
            newBytesStub.copy(modifiedBuffer, pos);
            modifiedBuffer[endBytePos] = newEndByte;
            totalReplacements++;
          }
        }
      }
    }

    return { buffer: modifiedBuffer, count: totalReplacements };
  }

  private isTargetFile(name: string): boolean {
    const lowerName = name.toLowerCase();
    return (
      lowerName.endsWith('.class') ||
      lowerName.endsWith('.properties') ||
      lowerName.endsWith('.json') ||
      lowerName.endsWith('.xml') ||
      lowerName.endsWith('.yml')
    );
  }

  private async isAlreadyPatched(serverPath: string): Promise<boolean> {
    const serverDir = path.dirname(serverPath);
    const flagFile = path.join(serverDir, this.PATCHED_FLAG);

    try {
      const flagData = await fs.readFile(flagFile, 'utf-8');
      const flag = JSON.parse(flagData);
      
      return (
        flag.targetDomain === this.TARGET_DOMAIN &&
        (await fs.access(serverPath).then(() => true).catch(() => false))
      );
    } catch {
      return false;
    }
  }

  async patchServer(
    serverPath: string,
    onProgress?: ProgressCallback,
    customReplacementRules?: ReplacementRule[]
  ): Promise<PatchResult> {
    const serverDir = path.dirname(serverPath);
    const flagFile = path.join(serverDir, this.PATCHED_FLAG);

    logger.info('=== Server Patcher ===', { target: serverPath });

    try {
      if (await this.isAlreadyPatched(serverPath)) {
        logger.info('Server already patched');
        return {
          success: true,
          patchedCount: 0,
          message: 'Servidor já está patcheado',
        };
      }

      logger.info('Server needs patching');
      onProgress?.('Parcheando servidor (Rápido)...');

      const backupPath = serverPath + '.bak';
      
      if (await fs.access(backupPath).then(() => true).catch(() => false)) {
        logger.info('Restoring from backup to ensure clean state');
        await fs.copyFile(backupPath, serverPath);
      } else {
        logger.info('Creating backup');
        await fs.copyFile(serverPath, backupPath);
      }

      logger.info('Loading JAR into memory');
      let zip: AdmZip;
      try {
        zip = new AdmZip(serverPath);
      } catch (error) {
        logger.error('Failed to load JAR', { error });
        throw new Error(`Falha ao carregar JAR: ${error instanceof Error ? error.message : String(error)}`);
      }

      const entries = zip.getEntries();
      logger.info(`JAR contains ${entries.length} entries`);

      const replacementRules = customReplacementRules || this.DEFAULT_REPLACEMENTS;
      let totalCount = 0;
      let processedFiles = 0;

      for (const entry of entries) {
        const name = entry.entryName;

        if (this.isTargetFile(name)) {
          let data: Buffer;
          try {
            data = entry.getData();
          } catch (error) {
            logger.warn(`Skipping unreadable entry: ${name}`);
            continue;
          }

          let dataModified = false;
          let fileData = Buffer.from(data);

          for (const rule of replacementRules) {
            if (rule.type === 'simple') {
              const oldBytes = this.stringToUtf8(rule.oldVal);
              if (fileData.includes(oldBytes)) {
                const result = this.replaceBinaryStrings(
                  fileData,
                  [rule],
                  'utf8'
                );
                if (result.count > 0) {
                  fileData = Buffer.from(result.buffer);
                  totalCount += result.count;
                  dataModified = true;
                }
              }
            } else if (rule.type === 'smart_domain') {
              const oldBytesStub = this.stringToUtf8(rule.oldVal.slice(0, -1));
              if (fileData.includes(oldBytesStub)) {
                const result = this.replaceBinaryStrings(
                  fileData,
                  [rule],
                  'utf8'
                );
                if (result.count > 0) {
                  fileData = Buffer.from(result.buffer);
                  totalCount += result.count;
                  dataModified = true;
                }
              }
            }
          }

          if (dataModified) {
            zip.updateFile(entry, fileData);
            processedFiles++;
          }
        }
      }

      logger.info(`Total replaced: ${totalCount} in ${processedFiles} files`);

      if (totalCount > 0) {
        logger.info('Writing patched JAR');
        zip.writeZip(serverPath);

        await fs.writeFile(
          flagFile,
          JSON.stringify({
            patchedAt: new Date().toISOString(),
            targetDomain: this.TARGET_DOMAIN,
            patcherVersion: '2.0.0',
            replacementRules: replacementRules,
          }, null, 2)
        );

        logger.info('Patching complete');
        onProgress?.('Servidor patcheado com sucesso');
      } else {
        logger.info('No occurrences found');
        await fs.writeFile(
          flagFile,
          JSON.stringify({
            patchedAt: new Date().toISOString(),
            targetDomain: this.TARGET_DOMAIN,
            status: 'no-changes',
          }, null, 2)
        );
      }

      return {
        success: true,
        patchedCount: totalCount,
        message: totalCount > 0 
          ? `Servidor patcheado com sucesso (${totalCount} substituições em ${processedFiles} arquivos)`
          : 'Nenhuma substituição necessária',
      };
    } catch (error) {
      logger.error('Server patching failed', { error });
      return {
        success: false,
        patchedCount: 0,
        message: `Falha ao patchear servidor: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async patchServerWithSmartDomain(
    serverPath: string,
    oldDomain: string,
    newDomain: string,
    onProgress?: ProgressCallback
  ): Promise<PatchResult> {
    const replacementRules: ReplacementRule[] = [
      { type: 'smart_domain', oldVal: oldDomain, newVal: newDomain }
    ];

    return this.patchServer(serverPath, onProgress, replacementRules);
  }

  async verifyPatch(serverPath: string): Promise<boolean> {
    return await this.isAlreadyPatched(serverPath);
  }

  async removePatchFlag(serverPath: string): Promise<void> {
    const serverDir = path.dirname(serverPath);
    const flagFile = path.join(serverDir, this.PATCHED_FLAG);

    try {
      await fs.unlink(flagFile);
      logger.info('Patch flag removed', { path: flagFile });
    } catch {
      logger.warn('No patch flag to remove');
    }
  }
}

export const serverPatcher = new ServerPatcher();
