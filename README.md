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

## Inspiration

https://linusrogge.com/

https://antonstallboerger.com/

https://sdrn.co/

https://id-c.se/

https://chris-wang.com/

https://www.haydenbleasel.com/
