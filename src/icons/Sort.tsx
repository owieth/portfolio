/**
 * Which way a column is sorted: an arrow up or down, or both chevrons when it
 * is not. Hidden from screen readers, since the header it sits in says the
 * same through `aria-sort`.
 */
const PATHS = {
  asc: 'M8 12.5V3.5M4.5 7 8 3.5 11.5 7',
  desc: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  none: 'M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3',
};

const IconSort = ({
  direction,
  className,
}: {
  direction: false | 'asc' | 'desc';
  className?: string;
}) => (
  <svg
    aria-hidden="true"
    focusable="false"
    className={className}
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={PATHS[direction || 'none']} />
  </svg>
);

export default IconSort;
