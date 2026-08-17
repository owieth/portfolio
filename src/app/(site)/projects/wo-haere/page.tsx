import ProjectLinks from '@/components/projects/Links';
import { A, P, Section, Shot, Table } from '@/components/projects/Prose';
import { getProject } from '@/data/projects';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

const project = getProject('wo-haere');

export const metadata: Metadata = {
  title: 'Wo häre?',
  description:
    'A dart-throwing map game with a Berndeutsch interface, backed by live swisstopo APIs. How the miss is calibrated from a statistics paper, and how a screen pixel becomes a Swiss municipality.',
  alternates: {
    canonical: '/projects/wo-haere',
  },
};

export default function WoHaereCaseStudy() {
  if (!project) notFound();

  return (
    <article className="w-full max-w-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-4xl font-medium text-balance italic sm:text-5xl">
            {project.title}
          </h1>
          <span className="text-muted text-sm tabular-nums">
            {project.year}
          </span>
        </div>
        <p className="text-muted text-pretty italic">
          Schmeiss e Pfyl u lue, wo&rsquo;s di häre nimmt.
        </p>
        <P>
          Throw a dart at a map of Switzerland and let it decide where to go
          next. The whole interface is in Berndeutsch. No API keys, no
          environment variables — every data source is public.
        </P>
        <p className="text-muted text-sm">{project.stack.join(' · ')}</p>
        {/*
          Plain links, never a dynamic import of the game: pulling the map
          component in here would land ~250KB gz of maplibre on a page that is
          mostly prose.
        */}
        <ProjectLinks links={project.links} className="mt-2" />
      </header>

      <Image
        src={project.cover.src}
        width={project.cover.width}
        height={project.cover.height}
        alt={project.cover.alt}
        className="border-foreground/20 mt-12 w-full rounded-lg border"
        priority
      />

      <Section title="How it works">
        <P>
          A dart lands on a screen pixel, the pixel becomes a coordinate, and
          swisstopo turns the coordinate into a place.
        </P>
        <ul className="text-muted marker:text-foreground/30 flex list-disc flex-col gap-2 pl-5 text-pretty">
          <li>
            <strong className="text-foreground font-medium">Tiles.</strong>{' '}
            <code>wmts.geo.admin.ch</code> serves the swisstopo Landeskarte with
            no key.
          </li>
          <li>
            <strong className="text-foreground font-medium">
              Reverse geocoding.
            </strong>{' '}
            One <code>identify</code> request against the Gemeinde layer returns
            the municipality and canton. Only the record with{' '}
            <code>is_current_jahr === true</code> counts — the API also returns
            historical ones going back to 1850.
          </li>
          <li>
            <strong className="text-foreground font-medium">Elevation.</strong>{' '}
            The <code>height</code> endpoint needs LV95 coordinates, so the app
            converts them with swisstopo&rsquo;s approximate formulas, checked
            against the reframe service and accurate to about 5 cm.
          </li>
          <li>
            <strong className="text-foreground font-medium">Water.</strong>{' '}
            swisstopo lists lakes in the Gemeinde layer under their own name, so{' '}
            <em>Thunersee</em> comes back as a &ldquo;municipality&rdquo;. That
            is how the app detects a splash without shipping any polygons.
          </li>
          <li>
            <strong className="text-foreground font-medium">Abroad.</strong> No
            records at all means the dart left the country. Records but none
            current means border water, like the French half of Lac Léman.
          </li>
        </ul>
        <P>
          One trap is worth writing down: <code>mapExtent</code> must bracket
          the queried point. A bogus extent makes <code>identify</code> return
          zero results instead of an error — which reads exactly like
          &ldquo;abroad&rdquo;.
        </P>
        <Shot shot={project.screenshots[0]} />
      </Section>

      <Section title="Three views">
        <Table
          head={['View', 'What it is']}
          rows={[
            [
              'Charte',
              'swisstopo Landeskarte, mercator, camera kept near Switzerland',
            ],
            [
              'Wäutchugele',
              'MapLibre globe projection over OpenFreeMap world tiles',
            ],
            [
              'Aaflug',
              'starts on the globe, dives into Switzerland, Landeskarte appears',
            ],
          ]}
        />
        <P>
          All three run on one MapLibre instance. <code>setProjection</code>,{' '}
          <code>addSource</code> and <code>addLayer</code> all throw before the
          style has loaded, and <code>isStyleLoaded()</code> never returns true
          for the world style — so readiness is tracked from the{' '}
          <code>style.load</code> event per map instance instead.
        </P>
        <Shot shot={project.screenshots[1]} />
      </Section>

      <Section title="Three throw mechanics">
        <P>
          Grab the dart at the bottom and drag. One gesture carries both the aim
          and the force: the drag&rsquo;s direction points the dart, its length
          is the force. A live overlay draws the flight path and a crosshair on
          the predicted landing spot, so you can see where it will go before
          letting go.
        </P>
        <Table
          head={['Style', 'What it does']}
          rows={[
            [
              'Zieh',
              'pull back like a slingshot; the dart flies the opposite way',
            ],
            [
              'Schlüder',
              'drag straight at the target instead; the dart follows the drag',
            ],
            ['Ei Tipp', 'one tap, no aiming, pure luck'],
          ]}
        />
        <P>
          The preview function is deliberately free of randomness, so the
          overlay and the actual throw agree. Drags shorter than a minimum
          threshold are ignored, so a plain click never throws. Pointer capture
          keeps the drag alive anywhere on screen while leaving the rest of the
          map free to pan.
        </P>
        <Shot shot={project.screenshots[2]} />
      </Section>

      <Section title="How badly you miss">
        <P>
          Aiming only ever biases the throw — it never determines it, because
          nobody playing this can actually throw darts. The miss is calibrated
          from Tibshirani, Price &amp; Taylor,{' '}
          <A href="https://www.stat.cmu.edu/~ryantibs/papers/darts-jrss.pdf">
            <em>A statistician plays darts</em>
          </A>{' '}
          (J. R. Statist. Soc. A, 2011), who model a throw as a 2-D Gaussian
          around the aim point and measured themselves over 100 throws at a
          board of radius 170 mm.
        </P>
        <Table
          head={['σ', 'Who']}
          rows={[
            [
              '64.6 mm',
              <>
                author 1 — not a dart player, trying his best. Averaged 11.65
                points,{' '}
                <strong className="text-foreground font-medium">
                  worse than throwing uniformly at random
                </strong>{' '}
                (12.82)
              </>,
            ],
            ['26.9 mm', 'author 2 — “a fairly skilled darts player”'],
            ['< 20 mm', 'the threshold for actually being good'],
          ]}
        />
        <P>
          64.6 / 170 ≈{' '}
          <strong className="text-foreground font-medium">0.38</strong>, so a
          beginner&rsquo;s spread is nearly 40% of the target radius. That is
          what this app throws with. The map is the dartboard, so σ scales with
          the map&rsquo;s radius, and a throw at full force lands exactly on
          that beginner figure — ease off and you do better. Measured over 1.2M
          simulated throws per force level on a 1280×800 view, by a script that
          ships with the project and reads the constants off the game:
        </P>
        <Table
          head={['Force', 'σ', 'Median miss', 'Off the board']}
          rows={[
            ['0%', '61 px', '23 km', '0.1%'],
            ['50%', '106 px', '40 km', '1.6%'],
            ['100%', '152 px', '57 km', '7.8%'],
          ]}
        />
        <P>
          The paper&rsquo;s remark that &ldquo;a beginner will occasionally miss
          the board entirely&rdquo; is where the occasional <em>Dernäbe!</em>{' '}
          card comes from. An earlier calibration ran to 23% off-board at full
          force, which is not &ldquo;occasionally&rdquo;.
        </P>
        <P>Three further details, all of them things real throwers do:</P>
        <ul className="text-muted marker:text-foreground/30 flex list-disc flex-col gap-2 pl-5 text-pretty">
          <li>
            <strong className="text-foreground font-medium">
              Not circularly symmetric.
            </strong>{' '}
            The paper&rsquo;s section 3 moves to a general covariance matrix;
            release timing shows up mostly as height error, so the vertical
            spread is the wider one.
          </li>
          <li>
            <strong className="text-foreground font-medium">
              A consistent tendency.
            </strong>{' '}
            Everyone pulls one way. The bias is drawn once per session, so it
            feels like your own wonky arm rather than fresh noise.
          </li>
          <li>
            <strong className="text-foreground font-medium">
              The occasional shank.
            </strong>{' '}
            7% of throws are a <em>Chnorz</em>: nearly double the spread, and
            the dart sails past the target, tumbles end over end and flutters
            back to stick in at a silly angle.
          </li>
        </ul>
        <P>
          The dashed ring on the aim overlay is 1σ — roughly two thirds of
          throws land inside it. It grows with force, so you can see the gamble
          before taking it.
        </P>
      </Section>

      <Section title="Sound">
        <P>
          Everything is synthesised with the Web Audio API, so the app ships no
          audio files. It is off by default; the toggle sits in Yschtellige.
        </P>
        <Table
          head={['When', 'What']}
          rows={[
            [
              'pulling back',
              'a tension tone that climbs in pitch with the force, plus a ratchet click every notch',
            ],
            ['release', 'a whoosh, louder the harder it was thrown'],
            [
              'a Chnorz release',
              'the whoosh plus a wobbling descending whistle for the tumble',
            ],
            ['landing', 'a filtered noise thwack'],
            ['bullseye', 'a Chueglogge'],
            ['off the map', 'a short descending blip'],
          ]}
        />
        <P>
          The tension tone is a sustained oscillator, so starting it hands back
          a handle that the caller must always stop — including when a drag is
          cancelled or the component unmounts mid-drag. Audio can only start
          from a user gesture, and the pointer press that begins a drag is
          exactly that.
        </P>
        <Shot shot={project.screenshots[3]} />
      </Section>

      <Section title="Copy">
        <P>
          Every user-facing string lives in one file, and every word is checked
          against <A href="https://www.berndeutsch.ch">berndeutsch.ch</A> by a
          script that ships with the project.
        </P>
        <P>
          Words that failed the check were replaced rather than shipped: it is{' '}
          <em>dernäbe</em> not &ldquo;danäbe&rdquo;, <em>preiche</em> for
          hitting the target rather than &ldquo;träffer&rdquo;, and{' '}
          <em>Badhose</em> rather than &ldquo;Badhösli&rdquo;.
        </P>
      </Section>

      <Section title="Destinations">
        <P>
          A curated list holds the interesting spots. Coordinates came from
          swisstopo&rsquo;s search API and were then verified against the
          Gemeinde layer and the elevation API — a wrong coordinate cannot
          survive an elevation check, which is how a football stadium in Thun
          stopped impersonating the Stockhorn summit. A second script re-runs
          that check against every coordinate on the list.
        </P>
        <P>
          A dart that lands more than 8 km from any curated spot falls back to
          the plain municipality name, so the list never has to be complete.
        </P>
      </Section>

      <Section title="Attribution">
        <P>
          Required, and rendered by MapLibre from the source specs: © swisstopo
          for the Landeskarte, OpenFreeMap and OpenStreetMap for the globe.
        </P>
      </Section>

      <div className="border-foreground/20 mt-16 border-t pt-8">
        <ProjectLinks links={project.links} />
      </div>
    </article>
  );
}
