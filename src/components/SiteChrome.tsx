import { ReactNode } from 'react';
import Footer from './Footer';
import Header from './Header';

const styles = {
  main: [
    'relative',
    'flex',
    'min-h-[85vh]',
    'flex-col',
    'items-center',
    'justify-center',
    'p-24',
  ].join(' '),
};

const SiteChrome = ({ children }: { children: ReactNode }) => (
  <>
    <Header />
    <main className={styles.main}>{children}</main>
    <Footer />
  </>
);

export default SiteChrome;
