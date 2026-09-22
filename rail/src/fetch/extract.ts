/**
 * Unpacks the GTFS archive into a directory of plain CSVs.
 *
 * Streamed member by member rather than read whole, because `stop_times.txt`
 * inflates to gigabytes — it is the file the whole pipeline is built around and
 * it does not fit in memory.
 *
 * Node has no built-in zip reader; `node:zlib` is raw deflate and cannot read a
 * zip container. `node-stream-zip` is the smallest thing that can: no runtime
 * dependencies, its own type declarations, and random access through the central
 * directory rather than a scan.
 */

import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import StreamZip from 'node-stream-zip';

export interface Entry {
  name: string;
  bytes: number;
}

/**
 * Extraction lands in a sibling `.part` directory and is renamed on completion,
 * so an interrupted run can never leave a half-populated `gtfs/` that a later
 * step would happily read.
 *
 * Every member is written under its `basename`. The feed is a flat archive of
 * `.txt` files, so nothing is lost, and resolving an archive-controlled path
 * against the output directory is how a crafted entry name escapes it.
 */
export async function extractArchive(
  archive: string,
  destination: string,
): Promise<Entry[]> {
  const part = `${destination}.part`;

  await rm(part, { force: true, recursive: true });
  await mkdir(part, { recursive: true });

  const zip = new StreamZip.async({ file: archive });

  try {
    const members = Object.values(await zip.entries())
      .filter(entry => !entry.isDirectory)
      .sort((a, b) => a.name.localeCompare(b.name));

    const entries: Entry[] = [];

    for (const member of members) {
      const name = basename(member.name);
      // Sequential on purpose: stop_times.txt alone inflates past 3 GB, and
      // running the members together would have several of those in flight at
      // once for no gain — the bottleneck is the disk, not the wait.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await zip.extract(member.name, join(part, name));
      entries.push({ name, bytes: member.size });
    }

    await rm(destination, { force: true, recursive: true });
    await rename(part, destination);

    return entries;
  } catch (error) {
    await rm(part, { force: true, recursive: true });
    throw new Error(`${archive} could not be extracted`, { cause: error });
  } finally {
    // Swallowed deliberately: closing an archive that never opened throws, and a
    // throw here would replace the real failure with a less useful one.
    await zip.close().catch(() => {});
  }
}
