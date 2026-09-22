import { describe, expect, it } from 'vitest';

import { findDirectory, listEntries, readZip64Directory } from './mirror.ts';

/**
 * Zips are built by hand here rather than with a zip library, because the cases
 * worth testing are the malformed ones — a truncated directory, a ZIP64 archive,
 * a tail with no record in it — and a library that produces valid archives
 * cannot produce any of them.
 */

const EOCD_BYTES = 22;
const LOCATOR_BYTES = 20;
const ZIP64_EOCD_BYTES = 56;

function centralHeader(name: string, extra = 0, comment = 0): Buffer {
  const encoded = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(46 + encoded.length + extra + comment);

  header.writeUInt32LE(0x0201_4b50, 0);
  header.writeUInt16LE(encoded.length, 28);
  header.writeUInt16LE(extra, 30);
  header.writeUInt16LE(comment, 32);
  encoded.copy(header, 46);

  return header;
}

function endOfCentralDirectory(
  entries: number,
  bytes: number,
  offset: number,
  comment = '',
): Buffer {
  const encoded = Buffer.from(comment, 'utf8');
  const record = Buffer.alloc(EOCD_BYTES + encoded.length);

  record.writeUInt32LE(0x0605_4b50, 0);
  record.writeUInt16LE(entries, 10);
  record.writeUInt32LE(bytes, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(encoded.length, 20);
  encoded.copy(record, EOCD_BYTES);

  return record;
}

function zip64Locator(offset: number): Buffer {
  const record = Buffer.alloc(LOCATOR_BYTES);

  record.writeUInt32LE(0x0706_4b50, 0);
  record.writeBigUInt64LE(BigInt(offset), 8);
  record.writeUInt32LE(1, 16);

  return record;
}

function zip64EndOfCentralDirectory(
  entries: number,
  bytes: number,
  offset: number,
): Buffer {
  const record = Buffer.alloc(ZIP64_EOCD_BYTES);

  record.writeUInt32LE(0x0606_4b50, 0);
  record.writeBigUInt64LE(BigInt(entries), 32);
  record.writeBigUInt64LE(BigInt(bytes), 40);
  record.writeBigUInt64LE(BigInt(offset), 48);

  return record;
}

describe('findDirectory', () => {
  it('reads the offset, size and count out of the record', () => {
    expect(findDirectory(endOfCentralDirectory(10, 512, 4096))).toEqual({
      entries: 10,
      bytes: 512,
      offset: 4096,
      zip64Offset: null,
    });
  });

  it('finds the record behind a zip comment', () => {
    const tail = Buffer.concat([endOfCentralDirectory(2, 96, 40, 'built by geOps')]);

    expect(findDirectory(tail).entries).toBe(2);
  });

  /** A forward scan would stop here; the backward scan is the reason it does not. */
  it('ignores a signature that appears inside the archive body', () => {
    const decoy = Buffer.alloc(64);
    decoy.writeUInt32LE(0x0605_4b50, 8);

    const tail = Buffer.concat([decoy, endOfCentralDirectory(7, 200, 900)]);

    expect(findDirectory(tail).entries).toBe(7);
  });

  it('follows the locator when the 32-bit fields are exhausted', () => {
    const tail = Buffer.concat([
      zip64Locator(8_000_000_000),
      endOfCentralDirectory(0xffff, 0xffff_ffff, 0xffff_ffff),
    ]);

    expect(findDirectory(tail).zip64Offset).toBe(8_000_000_000);
  });

  it('rejects an archive that needs ZIP64 and has no locator', () => {
    const tail = endOfCentralDirectory(0xffff, 0xffff_ffff, 0xffff_ffff);

    expect(() => findDirectory(tail)).toThrow(/locator/);
  });

  it('rejects a tail with no record in it', () => {
    expect(() => findDirectory(Buffer.alloc(4096))).toThrow(
      /no end-of-central-directory/,
    );
  });
});

describe('readZip64Directory', () => {
  it('reads the 64-bit fields', () => {
    expect(readZip64Directory(zip64EndOfCentralDirectory(70_000, 9_000_000_000, 12))).toEqual(
      { entries: 70_000, bytes: 9_000_000_000, offset: 12 },
    );
  });

  it('rejects a record the locator pointed at wrongly', () => {
    expect(() => readZip64Directory(Buffer.alloc(ZIP64_EOCD_BYTES))).toThrow(/ZIP64/);
  });
});

describe('listEntries', () => {
  it('reads every member name in order', () => {
    const directory = Buffer.concat([
      centralHeader('routes.txt'),
      centralHeader('trips.txt'),
      centralHeader('shapes.txt'),
    ]);

    expect(listEntries(directory, 3)).toEqual(['routes.txt', 'trips.txt', 'shapes.txt']);
  });

  /** geOps writes a UT extra field on every member; skipping it wrong shifts every later name. */
  it('steps over the extra and comment fields', () => {
    const directory = Buffer.concat([
      centralHeader('agency.txt', 9, 4),
      centralHeader('stops.txt', 9),
    ]);

    expect(listEntries(directory, 2)).toEqual(['agency.txt', 'stops.txt']);
  });

  it('reports a directory that ends early rather than returning what it got', () => {
    expect(() => listEntries(centralHeader('routes.txt'), 4)).toThrow(/1 of 4/);
  });

  it('rejects bytes that are not a central directory', () => {
    expect(() => listEntries(Buffer.alloc(64), 1)).toThrow(/no central directory header/);
  });
});
