import { consentBootstrapScript } from '@/lib/analytics/consent-bootstrap';
import Script from 'next/script';

/**
 * Sets the Consent Mode v2 defaults before GTM loads.
 *
 * `gtag('consent', 'default', …)` is ignored outright if it runs after
 * `gtm.js`. `<GoogleTagManager>` injects its script `afterInteractive`, so this
 * inline `beforeInteractive` script in the root layout is what guarantees the
 * ordering — it is a correctness requirement, not a cosmetic one.
 */
const ConsentBootstrap = () => (
  // The lint rule targets the Pages Router (`pages/_document.js`); in the App
  // Router the root layout is the required home for a `beforeInteractive`
  // script, so this is a false positive.
  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
  <Script
    id="consent-bootstrap"
    strategy="beforeInteractive"
    dangerouslySetInnerHTML={{ __html: consentBootstrapScript }}
  />
);

export default ConsentBootstrap;
