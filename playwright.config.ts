import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:8790',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `npm run build && wrangler dev --local --ip 127.0.0.1 --port 8790 --persist-to .wrangler/e2e-${process.pid} --var ADMIN_PASSWORD:fake-dashboard-password-e2e-only --var SESSION_SECRET:fake-session-secret-e2e-only-000000000000000000 --var RUNNER_TOKEN:fake-runner-token-e2e-only-000000000000000000`,
    url: 'http://127.0.0.1:8790/api/health',
    reuseExistingServer: false,
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '.build/e2e-wrangler.log' },
  },
});
