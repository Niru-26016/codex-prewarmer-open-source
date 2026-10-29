import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { secretPrompt } from '../scripts/secret-prompt.mjs';

function terminal() {
  const input = Object.assign(new EventEmitter(), {
    isTTY: true,
    isRaw: false,
    setRawMode(value) {
      this.isRaw = value;
    },
    resume() {},
    pause() {},
  });
  let text = '';
  const output = {
    write(value) {
      text += value;
    },
  };
  return { input, output, text: () => text };
}

test('pasted passwords are accepted in one chunk and never echoed', async () => {
  const t = terminal();
  const pending = secretPrompt(t);
  t.input.emit('data', Buffer.from('fake-long-pasted-password\r\n'));
  assert.equal(await pending, 'fake-long-pasted-password');
  assert.equal(t.text().includes('fake-long-pasted-password'), false);
  assert.equal(t.input.isRaw, false);
  assert.equal(t.input.listenerCount('data'), 0);
});

test('split UTF8 input and backspace preserve the entered password', async () => {
  const t = terminal();
  const pending = secretPrompt(t);
  const bytes = Buffer.from('aé');
  t.input.emit('data', bytes.subarray(0, 2));
  t.input.emit('data', bytes.subarray(2));
  t.input.emit('data', Buffer.from('\u007fx\n'));
  assert.equal(await pending, 'ax');
});

test('cancelling or closing the terminal restores terminal mode', async () => {
  for (const event of ['cancel', 'end']) {
    const t = terminal();
    const pending = secretPrompt(t);
    const rejected = assert.rejects(pending, /Cancelled|Input closed/);
    if (event === 'cancel') t.input.emit('data', Buffer.from('fake\u0003'));
    else t.input.emit('end');
    await rejected;
    assert.equal(t.input.isRaw, false);
    assert.equal(t.input.listenerCount('data'), 0);
    assert.equal(t.input.listenerCount('end'), 0);
  }
});

test('non-interactive input is refused before reading', () => {
  const t = terminal();
  t.input.isTTY = false;
  assert.throws(() => secretPrompt(t), /interactive terminal/);
});
