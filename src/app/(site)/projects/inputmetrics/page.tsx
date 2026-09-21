import CaseStudy from '@/components/projects/CaseStudy';
import { getProject } from '@/data/projects';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

const project = getProject('inputmetrics');

export const metadata: Metadata = {
  title: 'InputMetrics',
  description:
    'A macOS menu bar app that counts keyboard and mouse use through a read-only event tap. Why the schema is the privacy policy, why a keycode is a position rather than a letter, and two metrics it reports that are simply wrong.',
  alternates: {
    canonical: '/projects/inputmetrics',
  },
};

export default function InputMetricsCaseStudy() {
  if (!project) notFound();

  return (
    <CaseStudy
      project={project}
      tagline="It counts. That is the whole of what it can do."
      intro="A menu bar app that tracks how much you type and how far you move the mouse, with charts and heatmaps. The interesting part is not the counting — it is that the app is built so that counting is the only thing it is capable of."
    />
  );
}
