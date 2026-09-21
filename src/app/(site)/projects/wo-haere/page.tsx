import CaseStudy from '@/components/projects/CaseStudy';
import { getProject } from '@/data/projects';
import type { Metadata } from 'next';
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

  // The links stay plain, never a dynamic import of the game: pulling the map
  // component in here would land ~250KB gz of maplibre on a page that is
  // mostly prose.
  return (
    <CaseStudy
      project={project}
      tagline="Schmeiss e Pfyl u lue, wo’s di häre nimmt."
      intro="Throw a dart at a map of Switzerland and let it decide where to go next. The whole interface is in Berndeutsch. No API keys, no environment variables — every data source is public."
    />
  );
}
