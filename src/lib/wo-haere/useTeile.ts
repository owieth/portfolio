'use client';

import { useCallback, useState } from 'react';

import { track } from '@/lib/analytics/track';
import { AKTIONE, APP } from '@/lib/wo-haere/data/bern';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { PLAY_PATH } from '@/lib/wo-haere/routes';
import { formatWurf } from '@/lib/wo-haere/wurfParam';

/**
 * Sharing a hit: the native share sheet where there is one, the clipboard
 * otherwise. The button label doubles as the outcome, which is why the text and
 * the handler live together.
 */
export function useTeile(wurf: Wurf | null) {
  const [teiletext, setTeiletext] = useState<string>(AKTIONE.teile);

  const teile = useCallback(async () => {
    if (wurf?.art !== 'preich') return;
    const { lat, lon } = wurf;
    const url = `${window.location.origin}${PLAY_PATH}?wurf=${formatWurf({ lat, lon })}`;
    const daten = { title: APP.name, text: APP.tagline, url };

    track({ name: 'share_attempt' });

    // navigator.share spends the transient activation from the button press,
    // so nothing may be awaited before it.
    if (navigator.canShare?.(daten)) {
      try {
        await navigator.share(daten);
        setTeiletext(AKTIONE.gteilt);
        track({
          name: 'share_result',
          share_method: 'native',
          outcome: 'shared',
        });
        return;
      } catch (error) {
        // Dismissing the sheet is a choice, not a failure. Anything else
        // falls through to the clipboard.
        if (error instanceof Error && error.name === 'AbortError') {
          track({
            name: 'share_result',
            share_method: 'native',
            outcome: 'dismissed',
          });
          return;
        }
      }
    }

    // navigator.clipboard is undefined outside a secure context.
    if (!navigator.clipboard) {
      setTeiletext(AKTIONE.nidTeilt);
      track({
        name: 'share_result',
        share_method: 'clipboard',
        outcome: 'unsupported',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setTeiletext(AKTIONE.kopiert);
      track({
        name: 'share_result',
        share_method: 'clipboard',
        outcome: 'copied',
      });
    } catch {
      setTeiletext(AKTIONE.nidTeilt);
      track({
        name: 'share_result',
        share_method: 'clipboard',
        outcome: 'failed',
      });
    }
  }, [wurf]);

  /** Back to the plain label once a new throw replaces the shared one. */
  const zrugg = useCallback(() => setTeiletext(AKTIONE.teile), []);

  return { teiletext, teile, zrugg };
}
