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
