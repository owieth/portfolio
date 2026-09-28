'use client';

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type Column,
} from '@tanstack/react-table';
import { useMemo } from 'react';

import Named from '@/components/stats/Named';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import IconSort from '@/icons/Sort';
import type { RailLogTable } from '@/lib/stats/rail/log';
import { logRange, logRows, type RailLogRow } from '@/lib/stats/rail/log-rows';
import { cn } from '@/lib/wo-haere/cn';

/**
 * The rail ride log as shadcn/ui's data table: TanStack Table for the sorting
 * and the paging, the site's table and buttons for the markup. The server
 * sends every ride packed (`toLogTable`) and renders the first page; sorting
 * and paging after that happen here, without a request.
 *
 * Every column sorts on the rank the server packed it with, so comparing two
 * rows is comparing two integers. Rides that tie keep the order of the log,
 * which is also why the default sort, newest first, is the log as it came.
 */

const PAGE_SIZE = 10;

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

type LogColumn = Column<typeof features, RailLogRow, number>;

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * A header that sorts its column. The label is its name; which way it sorts
 * is on the header cell's `aria-sort`, so the arrow stays out of the
 * accessibility tree.
 */
const SortButton = ({
  column,
  label,
}: {
  column: LogColumn;
  label: string;
}) => {
  const sorted = column.getIsSorted();

  return (
    <Button variant="ghost" size="cell" onClick={() => column.toggleSorting()}>
      {label}
      <IconSort
        direction={sorted}
        className={cn(
          'size-3.5',
          !sorted && 'text-muted group-hover/button:text-foreground',
        )}
      />
    </Button>
  );
};

const helper = createColumnHelper<typeof features, RailLogRow>();

// At module scope, so every render hands TanStack the same headers and cells:
// a new function would be a new component, and remount the header in focus.
const columns = helper.columns([
  helper.accessor('dayRank', {
    id: 'date',
    header: ({ column }) => <SortButton column={column} label="Date" />,
    cell: ({ row }) => row.original.day,
    sortFn: sortFn_basic,
    sortDescFirst: true,
  }),
  helper.accessor('lineRank', {
    id: 'line',
    header: ({ column }) => <SortButton column={column} label="Line" />,
    cell: ({ row }) => (
      <Named code={row.original.code} name={row.original.terminals} />
    ),
    sortFn: sortFn_basic,
    sortDescFirst: false,
  }),
  helper.accessor('stretchRank', {
    id: 'stretch',
    header: ({ column }) => <SortButton column={column} label="Stretch" />,
    cell: ({ row }) => row.original.stretch,
    sortFn: sortFn_basic,
    sortDescFirst: false,
  }),
]);

export default function RideLog({ log }: { log: RailLogTable }) {
  // A new array would be new data to TanStack, which sends the table back to
  // its first page.
  const data = useMemo(() => logRows(log), [log]);
  const table = useTable({
    features,
    columns,
    data,
    initialState: {
      sorting: [{ id: 'date', desc: true }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    },
    enableMultiSort: false,
    enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.state.pagination;

  return (
    <>
      {/*
        Fixed, with the date column sized, so the columns hold still while
        the pages change under them.
      */}
      <Table className="min-w-md table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id}>
              {group.headers.map(header => {
                const sorted = header.column.getIsSorted();

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                    className={cn('p-0', header.column.id === 'date' && 'w-32')}
                  >
                    <table.FlexRender header={header} />
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getAllCells().map(cell => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/*
        One line whatever the page, the range wrapping rather than the
        buttons, so Next stays under the thumb that pressed it.
      */}
      <div className="flex items-center justify-between gap-4">
        <p
          aria-live="polite"
          className="text-muted min-w-0 text-sm text-pretty tabular-nums"
        >
          {logRange(pageIndex, pageSize, table.getRowCount())}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            focusableWhenDisabled
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            focusableWhenDisabled
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
