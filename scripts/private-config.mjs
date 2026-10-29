import { readFile, stat, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';

export function privateConfigMode(mode, managedBySystemd = false) {
  // systemd uses an ACL mask (0440) inside its private credential directory.
  return (mode & (managedBySystemd ? 0o037 : 0o077)) === 0;
}
export async function readPrivateConfig(path) {
  const actual = await realpath(path);
  const directory = process.env.CREDENTIALS_DIRECTORY;
  const managed =
    directory?.startsWith('/run/credentials/') && dirname(actual) === (await realpath(directory));
  const info = await stat(actual);
  if (!info.isFile() || !privateConfigMode(info.mode, managed) || info.size > 16000)
    throw Error('Runner configuration must be private and small.');
  try {
    return JSON.parse(await readFile(actual, 'utf8'));
  } catch {
    throw Error('Invalid private runner configuration.');
  }
}
