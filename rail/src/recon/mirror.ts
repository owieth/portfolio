/**
 * Lists the members of the geOps mirror's archive without downloading it.
 *
 * The question is whether the mirror ships `shapes.txt`, and the honest way to
 * answer it — fetch the archive and look — costs 194 MB for one boolean. A zip
 * keeps its table of contents at the end, so two ranged GETs of a few kilobytes
 * answer the same question, and the mirror serves `Range` correctly.
 *
 * Parsing is separated from fetching because the interesting cases — a ZIP64
 * archive, a truncated tail, a server that ignores `Range` and sends the whole
 * file — are all cheap to construct as buffers and impossible to provoke on
 * demand from a live server.
 */

const EOCD_SIGNATURE = 0x0605_4b50;
const ZIP64_EOCD_SIGNATURE = 0x0606_4b50;
const ZIP64_LOCATOR_SIGNATURE = 0x0706_4b50;
const CENTRAL_FILE_SIGNATURE = 0x0201_4b50;

const EOCD_MIN_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const ZIP64_EOCD_BYTES = 56;

/** The zip comment may be 64 KB; the tail has to be able to contain one plus the record. */
const TAIL_BYTES = 66_560;

/** A 32-bit field at its maximum means "the real value is in the ZIP64 record". */
const UNSET_32 = 0xffff_ffff;
const UNSET_16 = 0xffff;

const PROBE_TIMEOUT_MS = 20_000;

export interface Directory {
  offset: number;
  bytes: number;
  entries: number;
  /** Absolute offset of the ZIP64 end-of-central-directory record, when the archive has one. */
  zip64Offset: number | null;
}

export type MirrorProbe =
  | { ok: true; url: string; archiveBytes: number; entries: string[] }
  | { ok: false; url: string; reason: string };

/**
 * Scans backwards for the end-of-central-directory record. Backwards because the
 * record is at the very end unless there is a comment, and a forward scan would
 * stop at the first four bytes of compressed data that happen to spell `PK\x05\x06`.
 */
export function findDirectory(tail: Buffer): Directory {
  for (let index = tail.length - EOCD_MIN_BYTES; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) !== EOCD_SIGNATURE) {
      continue;
    }

    const entries = tail.readUInt16LE(index + 10);
    const bytes = tail.readUInt32LE(index + 12);
    const offset = tail.readUInt32LE(index + 16);

    const needsZip64 =
      entries === UNSET_16 || bytes === UNSET_32 || offset === UNSET_32;

    return {
      offset,
      bytes,
      entries,
      zip64Offset: needsZip64 ? readZip64Locator(tail, index) : null,
    };
  }

  throw new Error('no end-of-central-directory record in the tail of the archive');
}

/** The locator sits immediately before the EOCD and points at the real record. */
function readZip64Locator(tail: Buffer, eocdIndex: number): number {
  const index = eocdIndex - ZIP64_LOCATOR_BYTES;

  if (index < 0 || tail.readUInt32LE(index) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new Error('the archive needs a ZIP64 record and does not have a locator');
  }

  return Number(tail.readBigUInt64LE(index + 8));
}

export function readZip64Directory(record: Buffer): Pick<Directory, 'offset' | 'bytes' | 'entries'> {
  if (record.length < ZIP64_EOCD_BYTES || record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) {
    throw new Error('the ZIP64 end-of-central-directory record is not where the locator said');
  }

  return {
    entries: Number(record.readBigUInt64LE(32)),
    bytes: Number(record.readBigUInt64LE(40)),
    offset: Number(record.readBigUInt64LE(48)),
  };
}

/**
 * Member names, in the order the archive lists them. Only the name is read: the
 * sizes are in there too, but the question is which files exist, and a size read
 * from a header this code does not otherwise validate would invite trust it has
 * not earned.
 */
export function listEntries(directory: Buffer, entries: number): string[] {
  const names: string[] = [];
  let index = 0;

  while (names.length < entries) {
    if (index + 46 > directory.length) {
      throw new Error(
        `the central directory ends after ${names.length} of ${entries} entries`,
      );
    }

    if (directory.readUInt32LE(index) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error(`no central directory header at byte ${index}`);
    }

    const nameBytes = directory.readUInt16LE(index + 28);
    const extraBytes = directory.readUInt16LE(index + 30);
    const commentBytes = directory.readUInt16LE(index + 32);

    names.push(directory.toString('utf8', index + 46, index + 46 + nameBytes));
    index += 46 + nameBytes + extraBytes + commentBytes;
  }

  return names;
}

/**
 * Asks for `bytes=<range>` and insists the server honoured it. A server that
 * ignores `Range` answers 200 with the whole body, and streaming 194 MB into a
 * buffer to answer one question is exactly what this function exists to avoid.
 */
async function range(url: string, spec: string): Promise<{ body: Buffer; total: number }> {
  const response = await fetch(url, {
    headers: { range: `bytes=${spec}` },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  if (response.status !== 206) {
    throw new Error(`asked for bytes=${spec} and got ${response.status}, not 206 Partial Content`);
  }

  const contentRange = response.headers.get('content-range') ?? '';
  const total = Number(contentRange.split('/')[1]);

  if (!Number.isFinite(total)) {
    throw new Error(`the mirror answered 206 without a usable content-range (${contentRange})`);
  }

  return { body: Buffer.from(await response.arrayBuffer()), total };
}

/**
 * Never throws: a mirror that is down or has stopped serving `Range` is a
 * footnote in the report, not a reason to lose the rest of it.
 */
export async function probeMirror(url: string): Promise<MirrorProbe> {
  try {
    const tail = await range(url, `-${TAIL_BYTES}`);
    const tailStart = tail.total - tail.body.length;

    let directory = findDirectory(tail.body);

    if (directory.zip64Offset !== null) {
      const record = await range(
        url,
        `${directory.zip64Offset}-${directory.zip64Offset + ZIP64_EOCD_BYTES - 1}`,
      );

      directory = { ...directory, ...readZip64Directory(record.body) };
    }

    const start = directory.offset;
    const end = directory.offset + directory.bytes - 1;

    // The directory is usually already inside the tail that was fetched, so slice
    // it rather than asking for the same bytes twice.
    const body =
      start >= tailStart
        ? tail.body.subarray(start - tailStart, end - tailStart + 1)
        : (await range(url, `${start}-${end}`)).body;

    return {
      ok: true,
      url,
      archiveBytes: tail.total,
      entries: listEntries(body, directory.entries).sort(),
    };
  } catch (error) {
    return { ok: false, url, reason: error instanceof Error ? error.message : String(error) };
  }
}
