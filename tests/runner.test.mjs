import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const jobId = '0e672bd9-55b5-44d9-84e5-8f609ef50ce1';
const here = fileURLToPath(new URL('./', import.meta.url));

test('dry-run runner claims job and reports success without invoking Codex', async () => {
  const calls = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk.toString();
    const body = JSON.parse(raw);
    calls.push({ path: req.url, body, authorization: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        req.url.endsWith('/claim') ? { ok: true, dryRun: true, authJson: null } : { ok: true },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = `http://127.0.0.1:${server.address().port}`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          fileURLToPath(new URL('./mock-fetch.mjs', import.meta.url)),
          fileURLToPath(new URL('../scripts/runner.mjs', import.meta.url)),
        ],
        {
          env: {
            ...process.env,
            WORKER_URL: 'https://prewarmer.invalid',
            RUNNER_TOKEN: 'r'.repeat(48),
            JOB_ID: jobId,
            MOCK_HTTP_TARGET: target,
          },
          cwd: here,
        },
      );
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      calls.map((x) => x.path),
      ['/api/runner/claim', '/api/runner/finish'],
    );
    assert.equal(calls[0].body.jobId, jobId);
    assert.equal(calls[1].body.ok, true);
    assert.equal(calls[1].body.authJson, null);
    assert.equal(
      calls.every((x) => x.authorization === `Bearer ${'r'.repeat(48)}`),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
