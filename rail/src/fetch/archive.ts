/**
 * Writes a response body to disk while hashing it, in one pass.
 *
 * One pass rather than download-then-hash because the 2026 archive is 256 MB:
 * `response.arrayBuffer()` would hold all of it, and a second read would double
 * the wall time for a file this size.
 *
 * It takes a `Readable` rather than a `Response` so it can be tested offline
 * against `Readable.from([...])`; the caller does the `Readable.fromWeb`.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

export interface DownloadResult {
  bytes: number;
  sha256: string;
}

export async function downloadArchive(
  body: Readable,
  destination: string,
): Promise<DownloadResult> {
  const part = `${destination}.part`;
  const hash = createHash('sha256');
  let bytes = 0;

  await mkdir(dirname(destination), { recursive: true });

  // A .part left by an interrupted run is never resumed: the presigned URL that
  // produced it has expired, and half a file of unknown provenance is worse than
  // downloading again.
  await rm(part, { force: true });

  try {
    await pipeline(
      body,
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          bytes += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(part),
    );
  } catch (error) {
    await rm(part, { force: true });
    throw new Error(`the download failed after ${bytes} bytes`, { cause: error });
  }

  // Atomic within the directory, so the destination either does not exist or is
  // complete. There is no state in which a later step opens a truncated archive.
  await rename(part, destination);

  return { bytes, sha256: hash.digest('hex') };
}
