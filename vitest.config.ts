import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ADMIN_PASSWORD: 'fake-dashboard-password-for-tests-only',
          SESSION_SECRET: 's'.repeat(48),
          RUNNER_TOKEN: 'r'.repeat(48),
          AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        },
      },
    }),
  ],
  test: { include: ['tests/**/*.worker.test.ts'], testTimeout: 15000, fileParallelism: false },
});
