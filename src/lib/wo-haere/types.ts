import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import type { PfylsorteId } from '@/lib/wo-haere/data/bern';

export type Aasicht = 'charte' | 'chugele' | 'aaflug';
export type Wurfart = 'zieh' | 'tipp' | 'schlüder';

export const AASICHT_IDS: Aasicht[] = ['charte', 'chugele', 'aaflug'];
export const WURFART_IDS: Wurfart[] = ['zieh', 'tipp', 'schlüder'];

export interface WurfEintrag {
  id: string;
  zyt: number;
  wurf: Wurf;
  /** Curated destination name, when the dart landed near one. */
  ziuName: string | null;
  isPreich: boolean;
}

export interface Yschtellige {
  aasicht: Aasicht;
  wurfart: Wurfart;
  ton: boolean;
  pfylsorte: PfylsorteId;
}

export const STANDARD_YSCHTELLIGE: Yschtellige = {
  aasicht: 'charte',
  wurfart: 'zieh',
  ton: false,
  pfylsorte: 'pfyl',
};
