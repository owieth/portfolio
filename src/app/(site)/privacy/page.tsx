import { A, P, Section, Table } from '@/components/projects/Prose';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What this site collects, which cookies it sets, and how to opt out. Google Analytics with a granted-by-default consent choice, plus cookieless Vercel Analytics.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <article className="w-full max-w-3xl">
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl font-medium text-balance italic sm:text-5xl">
          Privacy
        </h1>
        <P>
          This is a personal portfolio. It collects only what it takes to see
          which work holds attention and where the site falls short — nothing is
          sold, and there are no advertising trackers.
        </P>
      </header>

      <Section title="Analytics">
        <P>
          Usage is measured with Google Analytics 4, delivered through Google
          Tag Manager. It records pseudonymous events — pages viewed,
          interactions, an approximate location derived from your IP address,
          and basic device and browser details. It does not identify you by
          name.
        </P>
        <P>
          Consent defaults to <em>granted</em>: Swiss data-protection law
          (revDSG) asks for transparency and a real opt-out rather than an
          up-front barrier. A notice at the bottom of the page tells you this on
          your first visit and lets you opt out in one click.
        </P>
      </Section>

      <Section title="Cookies">
        <P>These are the only cookies involved:</P>
        <Table
          head={['Cookie', 'Set by', 'Purpose']}
          rows={[
            [
              <code key="ga">_ga</code>,
              'Google Analytics',
              'Distinguishes one visitor from another.',
            ],
            [
              <code key="gaid">_ga_&lt;id&gt;</code>,
              'Google Analytics',
              'Keeps session state for a single property.',
            ],
            [
              <code key="ow">ow_consent</code>,
              'This site',
              'Remembers your analytics choice so the notice appears once.',
            ],
          ]}
        />
        <P>
          Vercel Analytics also runs on the site for aggregate traffic and Core
          Web Vitals. It is cookieless and stores no personal data.
        </P>
      </Section>

      <Section title="Opting out">
        <P>
          Choose <strong>Opt out</strong> in the notice at any time — it stops
          Google Analytics from collecting anything further and remembers the
          choice across visits. You can also block or clear cookies in your
          browser, or install Google&rsquo;s{' '}
          <A href="https://tools.google.com/dlpage/gaoptout">
            opt-out browser add-on
          </A>
          .
        </P>
      </Section>
    </article>
  );
}
