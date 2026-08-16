import CustomLink from '@/components/Link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function Home() {
  return (
    <>
      <p className="mb-2 text-sm text-white/50">Olivier Winkler</p>
      <h1 className="text-4xl font-medium text-balance italic sm:text-6xl">
        Building Software for the Future.
      </h1>
      <CustomLink
        link="https://frigg.eco"
        className="text-white/100! hover:border-[#71BC92]! hover:text-[#71BC92]!"
      >
        frigg.eco
      </CustomLink>
    </>
  );
}
