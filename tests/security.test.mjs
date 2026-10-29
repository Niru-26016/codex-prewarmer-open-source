import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSession,
  verifySession,
  encryptJson,
  decryptJson,
  validateAuthJson,
  safeEqual,
} from '../src/security.js';
const base64 = Buffer.alloc(32, 7).toString('base64');
test('session signature and expiration', async () => {
  const token = await makeSession('very-long-test-secret', 1000);
  assert.equal(await verifySession('very-long-test-secret', token, 1001), true);
  assert.equal(await verifySession('wrong', token, 1001), false);
  assert.equal(await verifySession('very-long-test-secret', token, 604801001), false);
  assert.equal(await verifySession('very-long-test-secret', token + 'x', 1001), false);
});
test('encrypt/decrypt and validate auth roundtrip', async () => {
  const auth = {
    auth_mode: 'chatgpt',
    tokens: { refresh_token: 'long-test-refresh-token', access_token: 'opaque-access' },
  };
  validateAuthJson(auth);
  const e = await encryptJson(base64, auth);
  assert.equal(JSON.stringify(e).includes('opaque-access'), false);
  assert.deepEqual(await decryptJson(base64, e), auth);
  await assert.rejects(decryptJson(Buffer.alloc(32, 3).toString('base64'), e));
});
test('invalid auth rejected and safe equality works', () => {
  assert.throws(() => validateAuthJson({ auth_mode: 'apikey', tokens: {} }));
  assert.equal(safeEqual('a', 'a'), true);
  assert.equal(safeEqual('a', 'b'), false);
});
