// Imported only in subprocess integration tests; never used by production scripts.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) =>
  realFetch(
    String(input).replace('https://prewarmer.invalid', process.env.MOCK_HTTP_TARGET),
    options,
  );
