/** Trusted VM service. Polls sequentially; never logs credentials or Codex output. */
import { setTimeout as delay } from 'node:timers/promises';
import { pollVm } from './runner.mjs';
import { readPrivateConfig } from './private-config.mjs';

const path = process.argv[2];
if (!path) throw Error('Usage: node scripts/vm-runner.mjs /private/path/runner.json');
const config = await readPrivateConfig(path);
const env = {
  WORKER_URL: config.WORKER_URL,
  RUNNER_TOKEN: config.RUNNER_TOKEN,
  ALLOW_CODEX_EXECUTION: config.ALLOW_CODEX_EXECUTION === 'true' ? 'true' : 'false',
};
const stop = new AbortController();
process.on('SIGTERM', () => stop.abort());
process.on('SIGINT', () => stop.abort());
let previous = '';
console.log(
  JSON.stringify({
    event: 'vm_runner_started',
    liveAllowed: env.ALLOW_CODEX_EXECUTION === 'true',
  }),
);
while (!stop.signal.aborted) {
  const result = await pollVm({ env });
  if (result.code !== previous || !['IDLE', 'VM_RUNNER_DISABLED'].includes(result.code)) {
    console.log(
      JSON.stringify({
        event: 'vm_runner_status',
        code: result.code,
        at: new Date().toISOString(),
      }),
    );
    previous = result.code;
  }
  if (result.code === 'INVALID_CONFIG') process.exit(2);
  try {
    await delay(10000, undefined, { signal: stop.signal });
  } catch {}
}
