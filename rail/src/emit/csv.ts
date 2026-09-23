/**
 * RFC 4180 CSV, written the one way the committed artifacts are written.
 *
 * Hand-rolled because the whole format is ten lines and every choice in it is
 * one the December diff depends on: `\n` line ends on every platform, UTF-8
 * without a byte-order mark, a header row, a newline after the last row, and a
 * field quoted only when it has to be, so a cell that did not change never
 * changes its bytes.
 *
 * `null` is an empty field. Postgres `copy … csv` reads an unquoted empty field
 * as null, which is what #489 seeds with, and an empty string never reaches
 * here: every text column the pipeline writes is either filled or null.
 */

export type Cell = string | number | boolean | null;

/** What joins a list inside one cell, like a line's operators. */
export const LIST_SEPARATOR = ';';

const NEEDS_QUOTES = /[",\n\r]/;

function field(value: Cell): string {
  if (value === null) {
    return '';
  }

  const text = String(value);

  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A list as one cell. A value that already contains the separator would split
 * into two on the way back, so it stops the build rather than reading back as a
 * different list.
 */
export function list(values: readonly string[], column: string): string {
  const broken = values.find(value => value.includes(LIST_SEPARATOR));

  if (broken !== undefined) {
    throw new Error(
      `${column} value ${JSON.stringify(broken)} contains "${LIST_SEPARATOR}", which separates the values of a list in the CSV`,
    );
  }

  return values.join(LIST_SEPARATOR);
}

/** The columns in `header` order, then one line per row. */
export function toCsv<Row extends Record<string, Cell>>(
  header: readonly (keyof Row & string)[],
  rows: readonly Row[],
): string {
  const lines = [
    header.join(','),
    ...rows.map(row => header.map(column => field(row[column])).join(',')),
  ];

  return `${lines.join('\n')}\n`;
}
