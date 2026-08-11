/**
 * Checks Berndeutsch words against the berndeutsch.ch dictionary.
 *
 *   pnpm vocab:wo-haere            # check the built-in list
 *   pnpm vocab:wo-haere gäbig nöi  # check specific words
 *
 * A word with zero hits is not in the dictionary and should be replaced
 * rather than shipped. "träffer", "stäigyse" and "badhösli" all failed this
 * check during development, which is why the app says "preiche" and "Badhose".
 */

const WOERTER = [
  'häre',
  'wohi',
  'pfyl',
  'charte',
  'nomau',
  'preiche',
  'schmeisse',
  'dernäbe',
  'gmeind',
  'bärg',
  'seeli',
  'chugele',
  'wäut',
  'schlüdere',
  'chueglogge',
  'stämpfel',
  'badhose',
  'zwäg',
  'äuä',
  'gäu',
  'chli',
  'wyt',
  'gniesse',
  'dörfli',
  'wätter',
  'zrügg',
  'wyter',
  'schiesse',
  'gäng',
  'gäbig',
  'gmüetlech',
  'härzig',
  'luege',
  'loufe',
  'hocke',
  'schmöcke',
  'wandere',
  'bade',
  'chrampf',
  'zvieri',
  'znüni',
  'schoggi',
  'chueche',
  'bitzeli',
  'prächtig',
  'luschtig',
  'dehei',
  'verby',
  'trumm',
  'stuune',
];

const words = process.argv.slice(2).length ? process.argv.slice(2) : WOERTER;

let missing = 0;

for (const word of words) {
  const url = `https://www.berndeutsch.ch/search?q=${encodeURIComponent(word)}`;
  let hits = 0;
  try {
    const html = await (await fetch(url)).text();
    hits = (html.match(/\/words\/\d+/g) ?? []).length;
  } catch (error) {
    console.error(`${word.padEnd(14)} FEHLER  ${error.message}`);
    continue;
  }
  if (hits === 0) missing++;
  console.log(
    `${word.padEnd(14)} ${hits === 0 ? 'NID IM WÖRTERBUECH' : `${hits} Träffer`}`,
  );
}

console.log(
  `\n${words.length - missing}/${words.length} Wörter im Wörterbuech`,
);
process.exit(missing === 0 ? 0 : 1);
