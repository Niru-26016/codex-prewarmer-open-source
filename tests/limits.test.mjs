import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLimits } from '../src/limits.js';
import { classifyFailure, runRunner } from '../scripts/runner.mjs';
test('quota snapshots retain only valid public window fields', () => {
  const w = {
    usedPercent: 24,
    windowDurationMins: 300,
    resetsAt: 1900000000,
    secret: 'never-store',
  };
  assert.deepEqual(sanitizeLimits({ rateLimits: { primary: w, accountId: 'private' } }), [
    {
      id: 'codex',
      primary: { usedPercent: 24, windowDurationMins: 300, resetsAt: 1900000000 },
      secondary: null,
    },
  ]);
  assert.deepEqual(sanitizeLimits({ rateLimits: { primary: { ...w, usedPercent: 101 } } }), []);
});
test('rate, network and timeout errors do not masquerade as expired auth', () => {
  assert.equal(classifyFailure('429 usage limit reached').reconnect, false);
  assert.equal(classifyFailure('network connection reset').reconnect, false);
  assert.equal(classifyFailure('refresh_token_reused').reconnect, true);
});
test('usage job calls only read-only query and persists refreshed auth', async () => {
  let queried = false,
    finish;
  await runRunner({
    env: {
      WORKER_URL: 'https://example.invalid',
      RUNNER_TOKEN: 'r'.repeat(48),
      JOB_ID: '0e672bd9-55b5-44d9-84e5-8f609ef50ce1',
      ALLOW_CODEX_EXECUTION: 'true',
    },
    fetcher: async (url, opts) => {
      if (url.endsWith('claim'))
        return Response.json({
          ok: true,
          dryRun: false,
          usageOnly: true,
          authJson: { auth_mode: 'chatgpt', tokens: { refresh_token: 'fake' } },
        });
      finish = JSON.parse(opts.body);
      return Response.json({ ok: true });
    },
    execute: () => {
      throw Error('No model request allowed');
    },
    query: async () => {
      queried = true;
      return { ok: true, reconnect: false, limits: [] };
    },
  });
  assert.equal(queried, true);
  assert.equal(finish.authJson.tokens.refresh_token, 'fake');
});
