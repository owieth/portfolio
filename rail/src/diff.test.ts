import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { diffArtifacts } from './diff.ts';

const run = promisify(execFile);

const LINES_HEADER =
  'id,display_name,category,network_region,operators,terminal_a,terminal_b,true_terminal_a,true_terminal_b,route_ids,seasonal,trips_per_week,has_geometry';
const STOPS_HEADER = 'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction';

const IR35 =
  'fernverkehr:IR35,IR35,IR,fernverkehr,BLS AG,Bern,Luzern,Bern,Luzern,1,false,196,true';
const IR36 =
  'fernverkehr:IR36,IR36,IR,fernverkehr,BLS AG,Bern,Luzern,Bern,Luzern,1,false,196,true';
const S12 =
  's-bahn-zuerich:S12,S12,S,s-bahn-zuerich,SBB,Brugg AG,Wil SG,Brugg AG,Wil SG,2,false,700,true';

function csv(header: string, rows: string[]): string {
  return `${[header, ...rows].join('\n')}\n`;
}

function stops(line: string, names: string[]): string[] {
  return names.map((name, index) => `${line},${index + 1},${name},,${8500000 + index},,,backbone,`);
}

describe('diffArtifacts', () => {
  let repo: string;
  let dir: string;
  const log = () => {};

  const git = (...args: string[]) =>
    run('git', ['-c', 'user.name=rail', '-c', 'user.email=rail@example.com', ...args], {
      cwd: repo,
    });

  const write = async (lines: string[], lineStops: string[]) => {
    await writeFile(join(dir, 'lines.csv'), csv(LINES_HEADER, lines));
    await writeFile(join(dir, 'line_stops.csv'), csv(STOPS_HEADER, lineStops));
  };

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'rail-diff-'));
    // A subdirectory, as rail/ is in the real repo, so paths resolve from it.
    dir = join(repo, 'rail');
    await mkdir(dir);
    await git('init', '--quiet');
  });

  afterEach(async () => {
    await rm(repo, { force: true, recursive: true });
  });

  it('finds nothing when the build rewrote the same files', async () => {
    await write([IR35, S12], stops('fernverkehr:IR35', ['Bern', 'Luzern']));
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'snapshot');

    const { comparison, markdown } = await diffArtifacts({ base: 'HEAD' }, log, { dir });

    expect(comparison.lines).toEqual({ before: 2, after: 2 });
    expect(markdown).toContain('No line or stop changed.');
  });

  it('compares the working tree against the committed snapshot', async () => {
    await write([IR35, S12], stops('fernverkehr:IR35', ['Bern', 'Luzern']));
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'snapshot');
    await write([IR36], stops('fernverkehr:IR36', ['Bern', 'Luzern']));

    const { comparison, markdown } = await diffArtifacts({ base: 'HEAD' }, log, { dir });

    expect(comparison.renumbered.map(pair => [pair.before.id, pair.after.id])).toEqual([
      ['fernverkehr:IR35', 'fernverkehr:IR36'],
    ]);
    expect(comparison.removed.map(line => line.id)).toEqual(['s-bahn-zuerich:S12']);
    expect(markdown).toContain('against `HEAD`');
  });

  it('reads the committed side at the ref it is given', async () => {
    await write([IR35], []);
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'first');
    await write([IR35, S12], []);
    await git('commit', '--quiet', '-am', 'second');

    const { comparison } = await diffArtifacts({ base: 'HEAD~1' }, log, { dir });

    expect(comparison.added.map(line => line.id)).toEqual(['s-bahn-zuerich:S12']);
  });

  it('lists every line as added when the ref has no artifacts yet', async () => {
    await writeFile(join(repo, 'README.md'), 'rail\n');
    await git('add', 'README.md');
    await git('commit', '--quiet', '-m', 'empty');
    await write([IR35, S12], []);

    const { comparison } = await diffArtifacts({ base: 'HEAD' }, log, { dir });

    expect(comparison.lines).toEqual({ before: 0, after: 2 });
    expect(comparison.added).toHaveLength(2);
  });

  it('fails on a ref that is not a commit', async () => {
    await write([IR35], []);
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'snapshot');

    await expect(diffArtifacts({ base: 'no-such-ref' }, log, { dir })).rejects.toThrow(
      '--base no-such-ref does not name a commit',
    );
  });

  it('fails when the build has not written the artifacts', async () => {
    await writeFile(join(repo, 'README.md'), 'rail\n');
    await git('add', 'README.md');
    await git('commit', '--quiet', '-m', 'empty');

    await expect(diffArtifacts({ base: 'HEAD' }, log, { dir })).rejects.toThrow(
      'lines.csv is missing; run pnpm build:data first',
    );
  });

  it('logs what changed', async () => {
    const messages: string[] = [];
    await write([IR35], []);
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'snapshot');
    await write([IR35, S12], []);

    await diffArtifacts({ base: 'HEAD' }, message => messages.push(message), { dir });

    expect(messages).toEqual([
      'diffed lines.csv and line_stops.csv against HEAD: 1 line added, 0 removed, 0 likely renumbered, 0 renamed and 0 lines with other stations',
    ]);
  });
});
