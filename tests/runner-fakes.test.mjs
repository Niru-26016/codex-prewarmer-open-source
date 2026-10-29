import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runRunner } from '../scripts/runner.mjs';
const env = {
  WORKER_URL: 'https://prewarmer.invalid',
  RUNNER_TOKEN: 'r'.repeat(48),
  JOB_ID: '0e672bd9-55b5-44d9-84e5-8f609ef50ce1',
  ALLOW_CODEX_EXECUTION: 'true',
};
const auth = {
  auth_mode: 'chatgpt',
  tokens: { access_token: 'fake-expired-token', refresh_token: 'fake-refresh-token-only' },
};
for (const success of [true, false])
  test(`fake credential refresh is written back when execution success=${success}`, async () => {
    let home,
      finish,
      attempts = 0;
    const result = await runRunner({
      env,
      fetcher: async (url, options) => {
        assert.equal(options.redirect, 'error');
        const data = JSON.parse(options.body);
        assert.equal(data.jobId, env.JOB_ID);
        assert.equal(data.claimToken.length, 64);
        if (url.endsWith('claim'))
          return Response.json({ ok: true, dryRun: false, authJson: auth });
        finish = data;
        if (++attempts === 1) throw Error('fake lost response');
        return Response.json({ ok: true });
      },
      execute: async (path) => {
        home = path;
        assert.equal((await stat(join(path, 'auth.json'))).mode & 0o777, 0o600);
        const stored = JSON.parse(await readFile(join(path, 'auth.json'), 'utf8'));
        stored.tokens.access_token = 'fake-refreshed-token';
        await writeFile(join(path, 'auth.json'), JSON.stringify(stored));
        return { ok: success, reconnect: !success };
      },
    });
    assert.equal(result.ok, success);
    assert.equal(finish.authJson.tokens.access_token, 'fake-refreshed-token');
    assert.equal(attempts, 2);
    await assert.rejects(access(home));
  });
test('dry runner never invokes the execution function and never writes credentials', async () => {
  let executed = false,
    finish;
  const result = await runRunner({
    env,
    fetcher: async (url, options) => {
      if (url.endsWith('claim')) return Response.json({ ok: true, dryRun: true });
      finish = JSON.parse(options.body);
      return Response.json({ ok: true });
    },
    execute: () => {
      executed = true;
      throw Error('must not run');
    },
  });
  assert.equal(result.ok, true);
  assert.equal(executed, false);
  assert.equal(finish.authJson, null);
});
test('invalid or unbound runner configuration is rejected before any fetch', async () => {
  for (const invalid of [
    { ...env, JOB_ID: '' },
    { ...env, WORKER_URL: 'http://example.invalid' },
    { ...env, WORKER_URL: 'https://user:pass@example.invalid' },
  ]) {
    const result = await runRunner({
      env: invalid,
      fetcher: () => {
        throw Error('must not fetch');
      },
    });
    assert.equal(result.code, 'INVALID_CONFIG');
  }
});
test('lost finish callback fails closed and retries at most three times', async () => {
  let attempts = 0;
  const result = await runRunner({
    env,
    fetcher: async (url) => {
      if (url.endsWith('claim')) return Response.json({ ok: true, dryRun: true });
      attempts++;
      throw Error('fake unavailable');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(attempts, 3);
});
