import Link from 'next/link';

import { AKTIONE, APP } from '@/lib/wo-haere/data/bern';
import { CASE_STUDY_PATH } from '@/lib/wo-haere/routes';

/** Title card in the top left, over the map. */
export default function Chopf() {
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-(--z-steuerig) flex items-start p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto rounded-xl bg-white/90 px-3 py-2 shadow-lg dark:bg-stone-900/90">
        <h1 className="text-lg leading-none font-black text-stone-900 dark:text-white">
          {APP.name}
        </h1>
        <p className="mt-0.5 text-xs text-pretty text-stone-600 dark:text-stone-400">
          {APP.tagline}
        </p>
        {/* Full-bleed means no site chrome, so this is the only way out. */}
        <Link
          href={CASE_STUDY_PATH}
          className="mt-1 inline-block text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-stone-400 dark:hover:text-white"
        >
          ← {AKTIONE.zrugg}
        </Link>
      </div>
    </header>
  );
}
