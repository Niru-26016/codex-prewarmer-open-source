import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
try {
  await access('.dev.vars');
  console.log('Local settings already exist; preserved.');
} catch {
  await writeFile(
    '.dev.vars',
    `ADMIN_PASSWORD="${randomBytes(24).toString('hex')}"\nSESSION_SECRET="${randomBytes(32).toString('hex')}"\nRUNNER_TOKEN="${randomBytes(32).toString('hex')}"\nAUTH_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Generated local-only settings in .dev.vars. Read ADMIN_PASSWORD there to sign in.');
}
