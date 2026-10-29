import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateConfigMode, readPrivateConfig } from '../scripts/private-config.mjs';
test('systemd ACL-readable credentials are allowed only in the managed directory', () => {
  assert.equal(privateConfigMode(0o440, true), true);
  assert.equal(privateConfigMode(0o440, false), false);
  for (const mode of [0o444, 0o460, 0o640])
    assert.equal(privateConfigMode(mode, true), mode === 0o640);
  assert.equal(privateConfigMode(0o600), true);
});
test('ordinary group-readable configuration and invalid JSON fail without exposing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prewarm-config-test-'));
  const file = join(dir, 'config.json');
  try {
    await writeFile(file, '{"token":"fake-only"}', { mode: 0o600 });
    assert.deepEqual(await readPrivateConfig(file), { token: 'fake-only' });
    await chmod(file, 0o640);
    await assert.rejects(readPrivateConfig(file), /must be private/);
    await chmod(file, 0o600);
    await writeFile(file, 'fake-secret-invalid-json');
    await assert.rejects(readPrivateConfig(file), {
      message: 'Invalid private runner configuration.',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
