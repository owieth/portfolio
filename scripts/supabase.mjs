/**
 * Runs the Supabase CLI against the portfolio project, as the account that owns
 * it.
 *
 * On its own the CLI acts as whichever account `supabase login` last stored in
 * the keychain, and on whichever project `supabase link` last wrote to
 * `supabase/.temp`. Both are machine state: another repo can log in as another
 * account, and every Conductor workspace starts with no link at all. So the
 * project is pinned here, and the account comes from `SUPABASE_ACCESS_TOKEN` in
 * `.env.local`, which the CLI prefers over the keychain. A token belongs to one
 * account.
 *
 * Without the token this stops rather than fall back to the keychain login,
 * which is exactly the account that may be the wrong one.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'hqpjysfwwpgjlumxhrdi';
const LINKED_REF = 'supabase/.temp/project-ref';

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set. Put an access token of the account that owns the portfolio project in .env.local.',
  );
  process.exit(1);
}

function supabase(args) {
  const { status, error } = spawnSync('supabase', args, { stdio: 'inherit' });

  if (error) throw error;

  return status ?? 1;
}

function linkedRef() {
  try {
    return readFileSync(LINKED_REF, 'utf8').trim();
  } catch {
    return undefined;
  }
}

// Linking also stores the pooler URL, which `db push` needs on a network
// without IPv6.
if (linkedRef() !== PROJECT_REF) {
  const status = supabase(['link', '--project-ref', PROJECT_REF]);

  if (status !== 0) process.exit(status);
}

process.exit(supabase(process.argv.slice(2)));
