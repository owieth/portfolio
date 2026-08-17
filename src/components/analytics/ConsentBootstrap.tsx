import { ALL_DENIED, CONSENT_COOKIE, GRANTED_DEFAULT } from '@/lib/analytics/consent';
import Script from 'next/script';

/**
 * Sets the Consent Mode v2 defaults before GTM loads.
 *
 * `gtag('consent', 'default', …)` is ignored outright if it runs after
 * `gtm.js`. `<GoogleTagManager>` injects its script `afterInteractive`, so this
 * inline `beforeInteractive` script in the root layout is what guarantees the
 * ordering — it is a correctness requirement, not a cosmetic one.
 *
 * The script mirrors `resolveConsent()` from `@/lib/analytics/consent` in plain
 * JS because a `beforeInteractive` inline script cannot import a module. The
 * category objects are serialized straight from that module so their shape has
 * a single source of truth; only the cookie/GPC/DNT reads are duplicated as
 * literal JS.
 */
const inlineScript = `
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var granted = ${JSON.stringify(GRANTED_DEFAULT)};
  var denied = ${JSON.stringify(ALL_DENIED)};

  var privacySignal =
    navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  var stored = null;
  if (!privacySignal) {
    var match = document.cookie
      .split('; ')
      .find(function (row) { return row.indexOf('${CONSENT_COOKIE}=') === 0; });
    if (match) {
      try {
        stored = JSON.parse(
          decodeURIComponent(match.slice('${CONSENT_COOKIE}='.length)),
        );
      } catch (e) {
        stored = null;
      }
    }
  }

  var state = privacySignal ? denied : stored || granted;
  gtag('consent', 'default', state);
})();
`;

const ConsentBootstrap = () => (
  // The lint rule targets the Pages Router (`pages/_document.js`); in the App
  // Router the root layout is the required home for a `beforeInteractive`
  // script, so this is a false positive.
  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
  <Script
    id="consent-bootstrap"
    strategy="beforeInteractive"
    dangerouslySetInnerHTML={{ __html: inlineScript }}
  />
);

export default ConsentBootstrap;
