import { track } from '@/lib/analytics/track';
import { AUI_KANTOEN, PFYLSORTE } from '@/lib/wo-haere/data/bern';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { gsammleteKantöne } from '@/lib/wo-haere/store';
import type { WurfStil } from '@/lib/wo-haere/throw/mechanics';
import type { WurfEintrag } from '@/lib/wo-haere/types';

interface SpurWurf {
  wurf: Wurf;
  stil: WurfStil;
  /** The log as it was *before* this throw joined it. */
  vorher: WurfEintrag[];
}

/**
 * Every analytics event a completed throw produces: the throw itself, a newly
 * collected canton, the full set, and any dart skin the throw count unlocks.
 *
 * Milestones fire on the state transition this throw causes, read from the
 * pre-throw snapshot rather than a render-derived flag that would misfire when
 * the settings pane mounts.
 */
export function spurWurf({ wurf, stil, vorher }: SpurWurf) {
  track(
    wurf.art === 'preich'
      ? {
          name: 'throw_completed',
          outcome: 'preich',
          throw_quality: stil,
          canton: wurf.kanton,
          municipality: wurf.gmeind,
          elevation: wurf.hoechi,
          distance_km: wurf.distanzKm,
          bearing: wurf.richtig,
          water: wurf.wasser,
        }
      : {
          name: 'throw_completed',
          outcome: 'dernaebe',
          throw_quality: stil,
          miss_reason: wurf.grund,
        },
  );

  const vorherKantoene = gsammleteKantöne(vorher);
  if (
    wurf.art === 'preich' &&
    wurf.kanton &&
    !vorherKantoene.has(wurf.kanton)
  ) {
    const cantonsCollected = vorherKantoene.size + 1;
    track({
      name: 'canton_collected',
      canton: wurf.kanton,
      cantons_collected: cantonsCollected,
    });
    if (cantonsCollected === AUI_KANTOEN.length) {
      track({ name: 'all_cantons_collected', throw_count: vorher.length + 1 });
    }
  }

  const neuiZahl = vorher.length + 1;
  for (const sorte of PFYLSORTE) {
    if (sorte.abNWuerf > 0 && sorte.abNWuerf === neuiZahl) {
      track({
        name: 'dart_skin_unlocked',
        dart_skin: sorte.id,
        threshold: sorte.abNWuerf,
      });
    }
  }
}
