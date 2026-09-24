/**
 * The share of a line, a category or the network that has been ridden, as the
 * map and the page both print it.
 *
 * Floored rather than rounded, so 100% only ever means every stop: a line with
 * one stop left out of 300 would otherwise read as done.
 */
export const formatShare = (share: number) => `${Math.floor(share * 100)}%`;
