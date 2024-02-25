import { ReactNode } from 'react';
import Clock from './Clock';
import CustomLink from './Link';

const Column = ({ children }: { children: ReactNode }) => (
  <div className="col-span-2 grid gap-1">{children}</div>
);

const FooterLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-sm font-medium text-white">{children}</p>
);

const Footer = () => (
  <footer className="relative z-10 overflow-hidden border-t border-white/50 bg-black">
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:grid sm:grid-cols-[1fr_auto] sm:px-6 sm:py-0 lg:px-8">
      <section className="text-sm text-white/50 sm:gap-16">
        <div className="grid grid-cols-4 items-start gap-8 py-16 sm:grid-cols-8 lg:grid-cols-12">
          <Column>
            <FooterLabel>Pages</FooterLabel>
            <CustomLink link="/">Home</CustomLink>
            <CustomLink link="/gallery">Gallery</CustomLink>
          </Column>

          <Column>
            <FooterLabel>Connect</FooterLabel>
            <CustomLink link="https://www.linkedin.com/in/olivier-winkler/">
              LinkedIn
            </CustomLink>
            <CustomLink link="https://twitter.com/_owieth">Twitter</CustomLink>
          </Column>

          <Column>
            <FooterLabel>Resources</FooterLabel>
            <CustomLink link="">Design</CustomLink>
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
