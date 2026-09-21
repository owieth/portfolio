import CaseStudy from '@/components/projects/CaseStudy';
import { getProject } from '@/data/projects';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

const project = getProject('macvitals');

export const metadata: Metadata = {
  title: 'MacVitals',
  description:
    'A macOS menu bar system monitor with no third-party dependencies. How it brute-forces an undocumented SMC key list, why two of its menu bar modes are drawn by hand, and three numbers it reports that you should not trust — including a battery health figure that is plainly wrong.',
  alternates: {
    canonical: '/projects/macvitals',
  },
};

export default function MacVitalsCaseStudy() {
  if (!project) notFound();

  return (
    <CaseStudy
      project={project}
      tagline="Every number is a syscall it makes itself."
      intro="A menu bar app for CPU, memory, storage, battery, temperatures, fans, network and GPU. It has no dock icon, no third-party dependencies and no server — it is a thin skin over a pile of Mach and IOKit calls, and most of the work was in finding out what to call."
    />
  );
}
