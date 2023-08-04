'use client';

import IconHome from '@/icons/Home';
import IconPhotos from '@/icons/Photos';
import IconProjects from '@/icons/Projects';
import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';

const DockItem = ({
  href,
  external,
  children,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) => {
  const styles = {
    item: [
      'flex',
      'justify-center',
      'items-center',
      'h-10',
      'w-10',
      'rounded',
      'bg-[linear-gradient(rgb(17,17,17)_0%,rgb(6,6,6)_100%)]',
      //'bg-[linear-gradient(145deg, #292929, #313131)]',
      //'shadow-[2px_2px_6px_#272727,-2px_-2px_6px_#353535]'
    ].join(' '),
  };

  return (
    <div className={styles.item}>
      <Link href={href} target={external ? '_blank' : '_self'}>
        {children}
      </Link>
    </div>
  );
};

const Dock = () => {
  const styles = {
    footer: [
      'fixed',
      'flex',
      'gap-4',
      'bottom-4',
      'left-1/2',
      '-translate-x-1/2',
      'z-10',
      'backdrop-blur-sm',
      'bg-[linear-gradient(rgb(17,17,17)_0%,rgb(12,12,12)_100%)]',
      'rounded-md',
      'p-4',
      //'bg-[#0D0E0E]',
      //'drop-shadow-[0_35px_35px_rgba(255,255,255,0.25)]'
    ].join(' '),
  };

  return (
    <footer className={styles.footer}>
      <DockItem href="/">
        <IconHome />
      </DockItem>

      <DockItem href="/projects">
        <IconProjects />
      </DockItem>

      <DockItem href="/photos">
        <IconPhotos />
      </DockItem>

      {/* <button className="h-[100px] w-[100px] rounded" style={{ background: 'linear-gradient(rgb(17, 17, 17) 0%, rgb(6, 6, 6) 100%)', boxShadow: 'rgba(255, 255, 255, 0.08) 0px 4px 6px 0px inset, rgba(0, 0, 0, 0.15) 0px 0.76382px 0.76382px -0.53571px, rgba(0, 0, 0, 0.145) 0px 1.87304px 1.87304px -1.07143px, rgba(0, 0, 0, 0.14) 0px 3.54344px 3.54344px -1.60714px, rgba(0, 0, 0, 0.133) 0px 6.19599px 6.19599px -2.14286px, rgba(0, 0, 0, 0.12) 0px 10.7712px 10.7712px -2.67857px, rgba(0, 0, 0, 0.098) 0px 19.7435px 19.7435px -3.21429px, rgba(0, 0, 0, 0.05) 0px 39px 39px -3.75px, rgba(0, 255, 255, 0) 0px 20px 120px 0px' }}>
        <p>
          ⌘
        </p>
      </button> */}
    </footer>
  );
};

export default Dock;
