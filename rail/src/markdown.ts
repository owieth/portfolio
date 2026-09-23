/**
 * The GitHub-flavoured Markdown tables `RECON.md` and `REPORT.md` are built
 * from. Shared so the two reports escape and format a cell the same way.
 */

export type Cell = string | number | null | undefined;

/** Nothing renders a `|` today, but a route name is operator-supplied text. */
export function cell(value: Cell): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return typeof value === 'number'
    ? value.toLocaleString('en-US')
    : value.replaceAll('|', '\\|');
}

export function table(headers: string[], rows: Cell[][]): string {
  if (rows.length === 0) {
    return '_No rows._';
  }

  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${row.map(cell).join(' | ')} |`);

  return [head, rule, ...body].join('\n');
}
