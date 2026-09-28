# olivierwinkler.ch

The source of [olivierwinkler.ch](https://olivierwinkler.ch): the home page, the
`/projects` case studies (`inputmetrics`, `macvitals`, `wo-haere`), `/stats`,
which covers the flights taken and the Swiss rail lines ridden and reads them
from Supabase, and the `/design` and `/privacy` pages. The wo häre? game runs at
`/projects/wo-haere/play`, with its API routes under `src/app/api/wo-haere/`
(`og`, `wurf`). The Swiss rail data pipeline behind `/stats` lives in `rail/`.

The site deploys on Vercel.

## Requirements

- **pnpm**, and only pnpm. The security pins in `pnpm.overrides` in
  `package.json` and the seven-day release quarantine in `pnpm-workspace.yaml`
  are pnpm settings; npm and yarn ignore both.
- **Node 22.18 or later.** CI runs Node 22. The rail CLI and the `scripts/*.mjs`
  run `.ts` files directly through Node's type stripping, which is on by default
  from 22.18.
- **The Supabase CLI**, installed separately. It is not a package dependency.

## Setup

```sh
pnpm install
cp .env.example .env.local
```

[`.env.example`](.env.example) lists every key the repo reads. Each one can stay
unset for local work:

| Key                         | What it does                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_GTM_ID`        | Loads the Tag Manager container. Unset, the analytics layer is a no-op that logs to the console. |
| `NEXT_PUBLIC_GA_ID`         | The GA4 property. GA4 is configured inside the Tag Manager container.                            |
| `GA4_API_SECRET`            | Server-only, for the GA4 Measurement Protocol.                                                   |
| `SUPABASE_URL`              | Server-only. Unset, the Supabase layer is a no-op and the client is never constructed.           |
| `SUPABASE_PUBLISHABLE_KEY`  | Server-only, with `SUPABASE_URL`.                                                                |
| `DATABASE_URL`              | Only for `pnpm reconcile:data`. It is the database password; never set it on Vercel.             |
| `NEXT_PUBLIC_STATS_ENABLED` | Unset hides `/stats` from the nav, the footer and the sitemap. The route stays reachable.        |

## Local data

[`supabase/config.toml`](supabase/config.toml) runs a local Postgres 17 on port
54322 and the API on port 54321.

```sh
supabase start
supabase status
```

Put the API URL and the publishable key that `supabase status` prints into
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Then
`supabase db reset` re-applies the migrations and loads both seeds,
`seeds/rail.sql` and `seeds/rail_rides.sql`.

Production migrations and seeds are pushed by hand, with
`supabase db push --include-seed`. No CI job pushes them.

## Commands

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `pnpm dev`               | Runs the dev server on http://localhost:3000.                              |
| `pnpm build`             | Builds the site for production.                                            |
| `pnpm start`             | Serves the production build.                                               |
| `pnpm test`              | Runs the tests once.                                                       |
| `pnpm test:watch`        | Runs the tests in watch mode.                                              |
| `pnpm lint`              | Runs ESLint.                                                               |
| `pnpm react-doctor`      | Runs React Doctor over the components.                                     |
| `pnpm og:world`          | Regenerates the land silhouette the passport share card is drawn on.       |
| `pnpm og:flags`          | Regenerates the flags inlined into the passport share card.                |
| `pnpm vocab:wo-haere`    | Checks the game's Berndeutsch words against the berndeutsch.ch dictionary. |
| `pnpm coords:wo-haere`   | Verifies every curated destination against swisstopo.                      |
| `pnpm simulate:wo-haere` | Reproduces the throw calibration table.                                    |

The six `*:data` scripts (`build`, `diff`, `recon`, `seed`, `rides` and
`reconcile`) run the rail pipeline; [`rail/README.md`](rail/README.md) documents
each one.

To check formatting, run `pnpm exec prettier --check <paths>`. Do not run
`pnpm prettier`: it is `prettier --write .` and rewrites the whole repo.

## Inspiration

https://linusrogge.com/

https://antonstallboerger.com/

https://sdrn.co/

https://id-c.se/

https://chris-wang.com/

https://www.haydenbleasel.com/
