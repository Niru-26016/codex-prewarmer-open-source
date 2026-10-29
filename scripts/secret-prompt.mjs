import { StringDecoder } from 'node:string_decoder';

/** Read a private terminal value, including pasted input, without echoing it. */
export function secretPrompt({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) throw Error('An interactive terminal is required.');
  output.write('Prewarmer dashboard password (hidden): ');
  const previousRawMode = Boolean(input.isRaw);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const decoder = new StringDecoder('utf8');
    function cleanup() {
      input.removeListener('data', key);
      input.removeListener('end', ended);
      input.setRawMode(previousRawMode);
      input.pause();
      output.write('\n');
    }
    function ended() {
      cleanup();
      reject(Error('Input closed before the password was entered.'));
    }
    function key(buffer) {
      for (const character of decoder.write(buffer)) {
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u0003') {
          cleanup();
          reject(Error('Cancelled'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character.codePointAt(0) >= 32) {
          value += character;
        }
      }
    }
    input.on('data', key);
    input.on('end', ended);
  });
}
