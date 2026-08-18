import type { DernaebeGrund } from '@/lib/wo-haere/geo/resolveHit';
import type { WurfStil } from '@/lib/wo-haere/throw/mechanics';

/**
 * The event contract. Every later analytics layer adds a member to this
 * discriminated union rather than inventing its own push shape, so the whole
 * app speaks one vocabulary and `track()` stays the single entry point.
 *
 * `name` is the discriminant and becomes the GA4 event name. The rest of an
 * event's own keys become GA4 event parameters.
 */
export type PageViewEvent = {
  name: 'page_view';
  page_path: string;
  page_title?: string;
};

export type OutboundClickEvent = {
  name: 'outbound_click';
  link_url: string;
  link_text: string;
  link_domain: string;
};

export type InternalLinkClickEvent = {
  name: 'internal_link_click';
  link_url: string;
  link_text: string;
  link_domain: string;
};

export type NavClickEvent = {
  name: 'nav_click';
  link_url: string;
  link_text: string;
  nav_location: 'header' | 'footer';
};

export type ProjectCtaClickEvent = {
  name: 'project_cta_click';
  project_slug: string;
  cta_label: string;
};

export type DownloadClickEvent = {
  name: 'download_click';
  project_slug: string;
  link_url: string;
};

export type CitationClickEvent = {
  name: 'citation_click';
  link_url: string;
  link_text: string;
  link_domain: string;
};

export type PageNotFoundEvent = {
  name: 'page_not_found';
  page_path: string;
  referrer: string;
};

export type WebVitalsEvent = {
  name: 'web_vitals';
  metric_name: string;
  metric_value: number;
  metric_rating: 'good' | 'needs-improvement' | 'poor';
  metric_id: string;
  page_path: string;
};

/**
 * The Wo häre? throw funnel. The client is the single source of truth for these
 * — the server layer emits `_server`-suffixed names so nothing double-counts.
 *
 * `input_method` names the throw mechanism: `tap` is the tipp-mode button,
 * `drag` and `fling` are the two pointer-drag modes (zieh / schlüder), and
 * `keyboard` is the Enter/Space fallback. `throw_started` and `throw_abandoned`
 * only exist on the pointer-drag path, so they carry `drag` | `fling` only.
 */
export type ThrowInputMethod = 'drag' | 'tap' | 'fling' | 'keyboard';

export type ThrowStartedEvent = {
  name: 'throw_started';
  input_method: 'drag' | 'fling';
};

export type ThrowInputMethodEvent = {
  name: 'throw_input_method';
  input_method: ThrowInputMethod;
};

export type ThrowAbandonedEvent = {
  name: 'throw_abandoned';
  input_method: 'drag' | 'fling';
};

/**
 * The geography `zeigResultat()` already has in hand. A `preich` hit carries the
 * full place; a `dernaebe` miss carries only why it missed (abroad vs border
 * water). `throw_quality` is the throw's own style, independent of where it
 * landed.
 */
export type ThrowCompletedEvent = {
  name: 'throw_completed';
  outcome: 'preich' | 'dernaebe';
  throw_quality: WurfStil;
  canton?: string;
  municipality?: string;
  elevation?: number | null;
  distance_km?: number;
  bearing?: string;
  water?: boolean;
  miss_reason?: DernaebeGrund;
};

export type ThrowOffMapEvent = {
  name: 'throw_off_map';
};

export type ThrowApiErrorEvent = {
  name: 'throw_api_error';
  status?: number | null;
};

export type SharedThrowOpenedEvent = {
  name: 'shared_throw_opened';
};

export type PanelToggleEvent = {
  name: 'panel_toggle';
  open: boolean;
};

export type MapEngagedEvent = {
  name: 'map_engaged';
};

/**
 * wo-haere client events stacked on the throw funnel: sharing, the result-card
 * actions, settings changes, throw-log interactions, and the canton/dart-skin
 * collection milestones. Param values keep the game's raw Berndeutsch ids so
 * they read the same as everywhere else in the feature.
 */
export type ShareAttemptEvent = {
  name: 'share_attempt';
};

export type ShareResultEvent = {
  name: 'share_result';
  share_method: 'native' | 'clipboard';
  outcome: 'shared' | 'dismissed' | 'copied' | 'unsupported' | 'failed';
};

export type ResultActionEvent = {
  name: 'result_action';
  action: 'again' | 'show_on_map' | 'share';
};

export type SettingChangedEvent = {
  name: 'setting_changed';
  setting_name: 'view' | 'throw_style' | 'dart_skin' | 'sound';
  setting_value: string;
};

export type ThrowLogEntryClickEvent = {
  name: 'throw_log_entry_click';
  art: 'preich' | 'dernaebe';
};

export type ThrowLogClearedEvent = {
  name: 'throw_log_cleared';
  entry_count: number;
};

export type CantonCollectedEvent = {
  name: 'canton_collected';
  canton: string;
  cantons_collected: number;
};

export type AllCantonsCollectedEvent = {
  name: 'all_cantons_collected';
  throw_count: number;
};

export type DartSkinUnlockedEvent = {
  name: 'dart_skin_unlocked';
  dart_skin: string;
  threshold: number;
};

export type AnalyticsEvent =
  | PageViewEvent
  | OutboundClickEvent
  | InternalLinkClickEvent
  | NavClickEvent
  | ProjectCtaClickEvent
  | DownloadClickEvent
  | CitationClickEvent
  | PageNotFoundEvent
  | WebVitalsEvent
  | ThrowStartedEvent
  | ThrowInputMethodEvent
  | ThrowAbandonedEvent
  | ThrowCompletedEvent
  | ThrowOffMapEvent
  | ThrowApiErrorEvent
  | SharedThrowOpenedEvent
  | PanelToggleEvent
  | MapEngagedEvent
  | ShareAttemptEvent
  | ShareResultEvent
  | ResultActionEvent
  | SettingChangedEvent
  | ThrowLogEntryClickEvent
  | ThrowLogClearedEvent
  | CantonCollectedEvent
  | AllCantonsCollectedEvent
  | DartSkinUnlockedEvent;

/**
 * GA4 silently drops an event whose name exceeds 40 characters or that carries
 * more than 25 parameters — no error, no console warning, the hit just never
 * lands. `isValidEvent` is the runtime guard the tests pin against, because the
 * union above vanishes at compile time and cannot check a value at runtime.
 */
export const MAX_EVENT_NAME_LENGTH = 40;
export const MAX_EVENT_PARAMS = 25;

export const isValidEvent = (event: AnalyticsEvent): boolean => {
  const paramCount = Object.keys(event).filter(key => key !== 'name').length;

  return (
    event.name.length <= MAX_EVENT_NAME_LENGTH && paramCount <= MAX_EVENT_PARAMS
  );
};
