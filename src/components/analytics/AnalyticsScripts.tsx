import ConsentBootstrap from '@/components/analytics/ConsentBootstrap';
import { GTM_ID, isAnalyticsEnabled } from '@/lib/analytics/config';
import { GoogleTagManager } from '@next/third-parties/google';
import { Fragment } from 'react';

/**
 * The delivery path: the Consent Mode defaults followed by the GTM container.
 * GA4 is configured inside that container, so there is no separate
 * `<GoogleAnalytics>` component and therefore no double-tagging.
 *
 * Renders nothing when analytics is disabled, so dev and CI never load GTM.
 */
const AnalyticsScripts = () => {
  if (!isAnalyticsEnabled) return null;

  return (
    <Fragment>
      <ConsentBootstrap />
      <GoogleTagManager gtmId={GTM_ID} />
    </Fragment>
  );
};

export default AnalyticsScripts;
