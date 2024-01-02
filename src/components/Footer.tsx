import IconLink from '@/icons/Link';
import Link from 'next/link';
import { ReactNode } from 'react';
import Clock from './Clock';

const Column = ({ children }: { children: ReactNode }) => (
  <div className="col-span-2 grid gap-1">{children}</div>
);

const FooterLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-sm font-medium text-white">{children}</p>
);

const FooterItem = ({
  link,
  children,
}: {
  link: string;
  children: ReactNode;
}) => {
  const isExternal = link.startsWith('http');

  const styles = {
    link: [
      'group',
      'inline-flex',
      'w-fit',
      'items-center',
      'gap-1',
      'border-b',
      'border-transparent',
      'text-white/50',
      'transition-colors',
      'hover:border-white hover:text-white',
    ].join(' '),
  };

  return (
    <Link
      href={link}
      className={styles.link}
      target={isExternal ? '_blank' : '_self'}
    >
      {children}
      {isExternal && <IconLink />}
    </Link>
  );
};

const Footer = () => (
  <footer className="relative z-10 overflow-hidden border-t border-white/50 bg-black">
    {/* <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"> */}
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:grid sm:grid-cols-[1fr_auto] sm:px-6 sm:py-0 lg:px-8">
      <section className="text-sm text-white/50 sm:gap-16">
        <div className="grid grid-cols-4 items-start gap-8 py-16 sm:grid-cols-8 lg:grid-cols-12">
          <Column>
            <FooterLabel>Pages</FooterLabel>
            <FooterItem link="/">Home</FooterItem>
            <FooterItem link="/gallery">Gallery</FooterItem>
          </Column>

          <Column>
            <FooterLabel>Connect</FooterLabel>
            <FooterItem link="https://www.linkedin.com/in/olivier-winkler/">
              LinkedIn
            </FooterItem>
            <FooterItem link="https://twitter.com/_owieth">Twitter</FooterItem>
          </Column>

          <Column>
            <FooterLabel>Resources</FooterLabel>
            <FooterItem link="">Design</FooterItem>
          </Column>
        </div>
      </section>

      <section className="flex items-center justify-center leading-none">
        <Clock />
      </section>
    </div>
  </footer>
);

export default Footer;
