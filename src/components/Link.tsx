import IconLink from '@/icons/Link';
import Link from 'next/link';
import { ReactNode } from 'react';

const CustomLink = ({
  link,
  children,
  className,
}: {
  link: string;
  children: ReactNode;
  className?: string;
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
      'ease-in-out',
      'hover:border-white hover:text-white',
    ].join(' '),
  };

  return (
    <Link
      href={link}
      className={`${styles.link} ${className || ''}`}
      target={isExternal ? '_blank' : '_self'}
    >
      {children}
      {isExternal && <IconLink />}
    </Link>
  );
};

export default CustomLink;
