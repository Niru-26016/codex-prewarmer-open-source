import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { dispatchJob } from '../src/executors.js';

const uuid = '0e672bd9-55b5-44d9-84e5-8f609ef50ce1';
test('GitHub runtime dispatch is disabled; Actions is CI only', async () => {
  await assert.rejects(dispatchJob({ EXECUTOR: 'github' }, uuid));
});
test('Cloud Run dispatch signs service-account JWT and binds a job using only its non-secret ID', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const old = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (String(url).includes('oauth2.googleapis.com'))
      return new Response(JSON.stringify({ access_token: 'temporary-test-token' }), {
        status: 200,
      });
    return new Response(JSON.stringify({ name: 'operations/abc' }), { status: 200 });
  };
  try {
    const result = await dispatchJob(
      {
        EXECUTOR: 'cloud_run',
        GCP_PROJECT: 'p',
        GCP_REGION: 'asia-south1',
        GCP_JOB: 'codex-prewarmer',
        GCP_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: 'robot@p.iam.gserviceaccount.com',
          private_key: pem,
        }),
      },
      uuid,
    );
    assert.match(result, /console.cloud.google.com\/run\/jobs/);
    assert.equal(calls.length, 2);
    assert.match(calls[0].opts.body.toString(), /assertion=/);
    assert.equal(calls[1].opts.headers.Authorization, 'Bearer temporary-test-token');
    assert.equal(JSON.parse(calls[1].opts.body).overrides.containerOverrides[0].env[0].value, uuid);
    assert.equal(calls[1].opts.body.includes('temporary-test-token'), false);
    assert.match(
      calls[1].url,
      /run.googleapis.com\/v2\/projects\/p\/locations\/asia-south1\/jobs\/codex-prewarmer:run/,
    );
  } finally {
    globalThis.fetch = old;
  }
});
