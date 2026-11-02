import type { RailLine } from '@/lib/stats/rail/types';

/**
 * The share of a line, a category or the network that has been ridden, as the
 * map and the page both print it.
 *
 * Floored rather than rounded, so 100% only ever means every stop: a line with
 * one stop left out of 300 would otherwise read as done.
 *
 * Takes the counts rather than their quotient, since `0.29 * 100` floors to 28.
 */
export const formatShare = (covered: number, stops: number) =>
  `${Math.floor((100 * covered) / stops)}%`;

/**
 * Where a line's trains run between, as every list on the page prints it: the
 * true termini, so the RE1 reads Domodossola – Bern rather than ending at
 * Preglia, its last stop in the Swiss feed. The feed tags a few foreign
 * stations with their country, `Domodossola (I)`, which the name drops; other
 * brackets, like a funicular's `(funi)`, are part of the name and stay.
 */
export const formatTermini = ({
  trueTerminalA,
  trueTerminalB,
}: Pick<RailLine, 'trueTerminalA' | 'trueTerminalB'>) =>
  [trueTerminalA, trueTerminalB]
    .map(name => name.replace(/ \([A-Z]\)$/, ''))
    .join(' – ');
