import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractArchive } from './extract.ts';

const run = promisify(execFile);

const MEMBERS: Record<string, string> = {
  'agency.txt': 'agency_id,agency_name\n11,SBB\n',
  'routes.txt': 'route_id,route_short_name,route_type\n1,S10,109\n',
  'stops.txt': 'stop_id,stop_name\n8503000,Zurich HB\n',
};

describe('extractArchive', () => {
  let dir: string;
  let archive: string;
  let destination: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-extract-'));
    archive = join(dir, 'gtfs.zip');
    destination = join(dir, 'gtfs');

    const source = join(dir, 'source');
    await mkdir(source, { recursive: true });

    const names = Object.keys(MEMBERS);

    for (const name of names) {
      await writeFile(join(source, name), MEMBERS[name]);
    }

    // The real feed is a flat archive, so -j matches what the pipeline will see.
    await run('zip', ['-q', '-j', archive, ...names.map(name => join(source, name))]);
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('unpacks every member and reports its size', async () => {
    const entries = await extractArchive(archive, destination);

    expect(entries).toEqual(
      Object.keys(MEMBERS)
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ name, bytes: Buffer.byteLength(MEMBERS[name]) })),
    );

    expect((await readdir(destination)).sort()).toEqual(Object.keys(MEMBERS).sort());
    expect(await readFile(join(destination, 'routes.txt'), 'utf8')).toBe(
      MEMBERS['routes.txt'],
    );
  });

  it('leaves no .part directory behind', async () => {
    await extractArchive(archive, destination);

    await expect(stat(`${destination}.part`)).rejects.toThrow();
  });

  it('replaces an earlier extraction rather than merging into it', async () => {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'from_an_older_feed.txt'), 'stale');

    await extractArchive(archive, destination);

    expect(await readdir(destination)).not.toContain('from_an_older_feed.txt');
  });

  // A half-populated gtfs/ would be read by the next step as if it were whole.
  it('commits nothing when the archive is not a zip', async () => {
    const corrupt = join(dir, 'corrupt.zip');
    await writeFile(corrupt, 'this is not a zip file');

    await expect(extractArchive(corrupt, destination)).rejects.toThrow(
      /could not be extracted/,
    );

    await expect(stat(destination)).rejects.toThrow();
    await expect(stat(`${destination}.part`)).rejects.toThrow();
  });
});
