/**
 * Shared anchor helpers for the click-tracking layer. Kept as pure string
 * functions (no DOM types) so they run in the `node` vitest environment; the
 * React chokepoints and the document delegate feed them `anchor.href` (already
 * absolute), `anchor.textContent`, and `window.location.host`.
 */

/**
 * Stamped on every anchor whose click a React handler already tracks. The
 * document-level `OutboundLinkDelegate` skips anchors carrying it, so a normal
 * outbound click never fires twice — once from the component, once from the
 * delegate.
 */
export const ANALYTICS_HANDLED_ATTR = 'data-analytics-handled';

export const handledMarker = { [ANALYTICS_HANDLED_ATTR]: '' } as const;

export type LinkFields = {
  link_url: string;
  link_text: string;
  link_domain: string;
};

/**
 * The `link_url` / `link_text` / `link_domain` triple shared by the link-click
 * events. `href` is expected absolute (the DOM resolves `anchor.href`); a
 * non-URL `href` (e.g. `mailto:`) falls back to an empty domain rather than
 * throwing.
 */
export const linkFields = (href: string, text: string): LinkFields => {
  let link_domain = '';

  try {
    link_domain = new URL(href).hostname;
  } catch {
    link_domain = '';
  }

  return { link_url: href, link_text: text.trim(), link_domain };
};

/**
 * True only for http(s) links pointing at a different host than the current
 * one. `mailto:`, `tel:`, in-page hashes, and malformed hrefs are not outbound.
 */
export const isOutbound = (href: string, currentHost: string): boolean => {
  try {
    const url = new URL(href);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    return url.host !== currentHost;
  } catch {
    return false;
  }
};
