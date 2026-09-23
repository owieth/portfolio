/**
 * Reads back the CSVs `emit/csv.ts` writes, so the December diff can compare two
 * of them by row rather than by line of text.
 *
 * The inverse of `toCsv` and no more general than it needs to be: a header row,
 * fields quoted only when they have to be, `""` for a quote inside one. An empty
 * unquoted field reads as `null`, the way `toCsv` writes one and Postgres
 * `copy … csv` reads one. Every value is a string; which column is a number is
 * the reader's business, not the format's. A `\r\n` line end is read as `\n`,
 * because a checkout on Windows may have converted it.
 */

export type CsvRow = Record<string, string | null>;

function records(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;
  let inQuotes = false;

  const endField = () => {
    row.push(quoted || field !== '' ? field : null);
    field = '';
    quoted = false;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
      }
    } else if (char === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char !== '\r' || text[index + 1] !== '\n') {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error(`row ${rows.length + 1} ends inside a quoted field`);
  }

  if (field !== '' || quoted || row.length > 0) {
    endRow();
  }

  return rows;
}

/** One record per row after the header, keyed by the header's column names. */
export function parseCsv(text: string): CsvRow[] {
  const [header, ...body] = records(text);

  if (header === undefined) {
    return [];
  }

  const columns = header.map(column => column ?? '');

  return body.map((fields, index) => {
    if (fields.length !== columns.length) {
      throw new Error(
        `row ${index + 2} has ${fields.length} fields where the header has ${columns.length}`,
      );
    }

    return Object.fromEntries(columns.map((column, at) => [column, fields[at]]));
  });
}
