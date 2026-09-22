import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { downloadArchive } from './archive.ts';

const CHUNKS = ['a zip ', 'arrives ', 'in chunks'];
const BODY = CHUNKS.join('');

describe('downloadArchive', () => {
  let dir: string;
  let destination: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-archive-'));
    destination = join(dir, 'gtfs.zip');
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('writes the body and hashes it in the same pass', async () => {
    const result = await downloadArchive(Readable.from(CHUNKS), destination);

    expect(result.bytes).toBe(Buffer.byteLength(BODY));
    expect(result.sha256).toBe(createHash('sha256').update(BODY).digest('hex'));
    expect(await readFile(destination, 'utf8')).toBe(BODY);
  });

  it('leaves no .part behind on success', async () => {
    await downloadArchive(Readable.from(CHUNKS), destination);

    await expect(stat(`${destination}.part`)).rejects.toThrow();
  });

  // A half-file of unknown provenance is worse than downloading again, and a
  // later step must never be able to open one.
  it('commits nothing when the stream fails mid-transfer', async () => {
    const failing = Readable.from(
      (async function* () {
        yield 'a zip ';
        throw new Error('connection reset');
      })(),
    );

    await expect(downloadArchive(failing, destination)).rejects.toThrow(
      /the download failed after 6 bytes/,
    );

    await expect(stat(destination)).rejects.toThrow();
    await expect(stat(`${destination}.part`)).rejects.toThrow();
  });

  // The presigned URL that produced it has expired, so a .part is never resumed.
  it('discards a .part left by an interrupted run', async () => {
    await writeFile(`${destination}.part`, 'half a feed from yesterday');

    const result = await downloadArchive(Readable.from(CHUNKS), destination);

    expect(result.sha256).toBe(createHash('sha256').update(BODY).digest('hex'));
    expect(await readFile(destination, 'utf8')).toBe(BODY);
  });

  it('creates the feed directory if it is not there yet', async () => {
    const nested = join(dir, 'otd-fp2026-20260919', 'gtfs.zip');

    await downloadArchive(Readable.from(CHUNKS), nested);

    expect(await readFile(nested, 'utf8')).toBe(BODY);
  });
});
