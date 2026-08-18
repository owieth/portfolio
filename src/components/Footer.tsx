import { ReactNode } from 'react';
import Clock from './Clock';
import CustomLink from './Link';

const Column = ({ children }: { children: ReactNode }) => (
  <div className="col-span-2 grid gap-1">{children}</div>
);

const FooterLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-foreground text-sm font-medium">{children}</p>
);

const Footer = () => (
  <footer className="border-line bg-background relative z-10 overflow-hidden border-t">
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:grid sm:grid-cols-[1fr_auto] sm:px-6 sm:py-0 lg:px-8">
      <nav aria-label="Footer" className="text-muted text-sm sm:gap-16">
        <div className="grid grid-cols-4 items-start gap-8 py-16 sm:grid-cols-8 lg:grid-cols-12">
          <Column>
            <FooterLabel>Pages</FooterLabel>
            <CustomLink link="/" nav>
              Home
            </CustomLink>
            <CustomLink link="/projects" nav>
              Projects
            </CustomLink>
            {/* <CustomLink link="/gallery" nav>Gallery</CustomLink> */}
          </Column>

          <Column>
            <FooterLabel>Connect</FooterLabel>
            <CustomLink link="https://github.com/owieth">GitHub</CustomLink>
            <CustomLink link="https://www.linkedin.com/in/olivier-winkler/">
              LinkedIn
            </CustomLink>
            <CustomLink link="https://twitter.com/_owieth">Twitter</CustomLink>
          </Column>

          <Column>
            <FooterLabel>Resources</FooterLabel>
            <CustomLink link="/design">Design</CustomLink>
          </Column>
        </div>
      </nav>

      <section className="flex items-center justify-center leading-none">
        <Clock />
      </section>
    </div>
  </footer>
);

export default Footer;
