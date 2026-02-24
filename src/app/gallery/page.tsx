import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function GalleryPage() {
  return <div className="h-dvh" />;
}
