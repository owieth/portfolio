import * as React from 'react';
import { cn } from '@/lib/wo-haere/cn';

/**
 * shadcn/ui's table, base-nova style
 * (https://ui.shadcn.com/r/styles/base-nova/table.json, taken 2026-09-28),
 * restyled onto the site's tokens so a table built from it looks like `Table`
 * in `projects/Prose.tsx`: a /20 border under the head and /10 between rows, a
 * muted, tabular body, and cells padded on the right and set to the top. No
 * hover, selected state or transition, since nothing in a row is interactive,
 * and no `'use client'`, since nothing here has state.
 *
 * The scroll container is padded by a focus ring's width and pulled back out
 * by as much, so the table lines up as before but a control in its first
 * column or its head row has room to draw a ring the scrolling cannot clip.
 */

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="relative -m-1 overflow-x-auto p-1"
    >
      <table
        data-slot="table"
        className={cn(
          'w-full caption-bottom border-collapse text-left text-sm',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-foreground/20 [&_tr]:border-b', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('text-muted tabular-nums', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-foreground/20 border-t font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-foreground/10 border-b', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('py-2 pr-4 text-left font-medium', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('py-2 pr-4 align-top', className)}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted mt-4 text-sm', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
