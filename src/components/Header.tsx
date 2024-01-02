'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

const navigation = [
  { name: 'Home', href: '' },
  { name: 'Gallery', href: '/gallery' },
];

const NavItem = ({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) => {
  const isActive = usePathname() === href;

  const styles = {
    link: ({ isActive }: { isActive: boolean }) =>
      [
        'block',
        'relative',
        'px-3',
        'py-2',
        'transition-all',
        'duration-300',
        isActive ? 'text-white' : 'text-white/50 hover:text-white/100',
        'before:absolute',
        'before:hover:inset-x-1',
        'before:hover:-bottom-px',
        'before:hover:h-px',
        'before:hover:animate-pulse',
        'before:hover:bg-gradient-to-r',
        'before:hover:from-[rgba(17,17,17,0)]',
        'before:hover:via-white',
        'before:hover:to-[rgba(17,17,17,0)]',
      ].join(' '),
    activeLink: [
      'absolute',
      'inset-x-1',
      '-bottom-px',
      'h-px',
      'bg-gradient-to-r',
      'from-white/0',
      'via-white/40',
      'to-white/0',
    ].join(' '),
  };

  return (
    <li className={className}>
      <Link href={href} className={styles.link({ isActive })}>
        {children}
        {isActive && <span className={styles.activeLink} />}
      </Link>
    </li>
  );
};

const Navigation = () => {
  const styles = {
    bar: ['flex', 'text-sm', 'px-3'].join(' '),
  };

  return (
    <nav>
      <ul className={styles.bar}>
        {navigation.map((item, i) => (
          <NavItem key={i} href={item.href}>
            {item.name}
          </NavItem>
        ))}
      </ul>
    </nav>
  );
};

const Header = () => {
  const styles = {
    header: [
      'fixed',
      'left-0',
      'right-0',
      'py-4',
      'px-4',
      'z-50',
      'm-0',
      'grid',
      'w-full',
      'grid-cols-2',
      'border-b',
      'border-white/10',
      'items-center',
      'backdrop-blur-sm',
      'grid-cols-5',
      'px-6',
      'lg:px-8',
    ].join(' '),
  };

  return (
    <>
      <header className={styles.header}>
        <Navigation />
      </header>
    </>
  );
};

export default Header;
