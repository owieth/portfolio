/** @type {import("prettier").Config} */
const config = {
  plugins: [require.resolve('prettier-plugin-tailwindcss')],
  // The wo-haere components compose classes through cn(), so the plugin needs
  // to be told to sort inside it.
  tailwindFunctions: ['cn'],
  singleQuote: true,
  semi: true,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'avoid',
};

module.exports = config;
