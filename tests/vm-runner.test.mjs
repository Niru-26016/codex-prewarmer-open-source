import test from 'node:test';
import assert from 'node:assert/strict';
import { pollVm } from '../scripts/runner.mjs';
const env = {
  WORKER_URL: 'https://prewarm.invalid',
  RUNNER_TOKEN: 'r'.repeat(48),
  ALLOW_CODEX_EXECUTION: 'true',
};
test('VM runner discovers an exact job ID and passes it to the bound runner', async () => {
  const jobId = '0e672bd9-55b5-44d9-84e5-8f609ef50ce1';
  let calls = 0;
  const result = await pollVm({
    env,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, env.WORKER_URL + '/api/runner/vm-poll');
      assert.equal(options.headers.Authorization, 'Bearer ' + env.RUNNER_TOKEN);
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), { allowLive: true, supportsUsage: true });
      return Response.json({ ok: true, jobId });
    },
    runner: async (options) => {
      assert.equal(options.env.JOB_ID, jobId);
      return { ok: true, code: 'COMPLETED' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.code, 'COMPLETED');
});
test('VM idle and malformed discovery never execute Codex or claim another job', async () => {
  for (const jobId of [null, 'invalid']) {
    const result = await pollVm({
      env,
      fetcher: async () => Response.json({ ok: true, jobId }),
      runner: async () => {
        throw Error('Must not execute');
      },
    });
    assert.equal(result.code, jobId === null ? 'IDLE' : 'POLL_FAILED');
  }
});
test('VM invalid destinations and disabled mode fail closed', async () => {
  assert.equal(
    (await pollVm({ env: { ...env, WORKER_URL: 'http://prewarm.invalid' } })).code,
    'INVALID_CONFIG',
  );
  assert.equal(
    (await pollVm({ env, fetcher: async () => new Response('', { status: 403 }) })).code,
    'VM_RUNNER_DISABLED',
  );
});
