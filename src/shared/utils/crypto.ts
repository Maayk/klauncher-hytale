import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { FileHash } from '../schemas/patcher';

export interface HashResult {
  md5?: string;
  sha1?: string;
  sha256?: string;
  size: number;
}

export interface VerifyResult {
  valid: boolean;
  expected?: FileHash;
  actual?: HashResult;
  mismatches?: Array<keyof FileHash>;
}

const CHUNK_SIZE = 8 * 1024 * 1024;

export async function computeHashes(filePath: string, algorithms: Array<'md5' | 'sha1' | 'sha256'> = ['md5', 'sha1', 'sha256']): Promise<HashResult> {
  const hashes: Record<string, crypto.Hash> = {};
  algorithms.forEach(alg => {
    hashes[alg] = crypto.createHash(alg);
  });

  const handle = await fs.open(filePath, 'r');
  const stat = await handle.stat();
  let position = 0;

  while (position < stat.size) {
    const { bytesRead, buffer } = await handle.read({
      buffer: Buffer.allocUnsafe(Math.min(CHUNK_SIZE, stat.size - position)),
      length: CHUNK_SIZE,
      position
    });

    algorithms.forEach(alg => {
      hashes[alg].update(buffer.subarray(0, bytesRead));
    });

    position += bytesRead;
  }

  await handle.close();

  const result: HashResult = { size: stat.size };
  algorithms.forEach(alg => {
    result[alg] = hashes[alg].digest('hex') as any;
  });

  return result;
}

export async function verifyFile(filePath: string, expected: FileHash): Promise<VerifyResult> {
  try {
    const actual = await computeHashes(filePath, ['md5', 'sha1', 'sha256']);
    const mismatches: Array<keyof FileHash> = [];

    if (expected.md5 && actual.md5 !== expected.md5) mismatches.push('md5');
    if (expected.sha1 && actual.sha1 !== expected.sha1) mismatches.push('sha1');
    if (expected.sha256 && actual.sha256 !== expected.sha256) mismatches.push('sha256');
    if (expected.size !== undefined && actual.size !== expected.size) mismatches.push('size');

    return {
      valid: mismatches.length === 0,
      expected,
      actual,
      mismatches: mismatches.length > 0 ? mismatches : undefined
    };
  } catch (error) {
    return {
      valid: false,
      expected,
      actual: undefined,
      mismatches: ['path']
    };
  }
}

export async function verifyMultipleFiles(fileHashes: Array<{ path: string; hash: FileHash }>): Promise<Map<string, VerifyResult>> {
  const results = new Map<string, VerifyResult>();
  const verifyPromises = fileHashes.map(async ({ path: filePath, hash }) => {
    const result = await verifyFile(filePath, hash);
    return { filePath, result };
  });

  const resolved = await Promise.all(verifyPromises);
  resolved.forEach(({ filePath, result }) => results.set(filePath, result));

  return results;
}

export function generateQuickHash(data: string | Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
