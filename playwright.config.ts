import { defineConfig, devices } from '@playwright/test';
const { validateTestDatabaseUrl } = require('./tests/helpers/catalogTestDatabase');
const database = validateTestDatabaseUrl();

export default defineConfig({
  testDir: './tests', testMatch: 'catalog.e2e.spec.ts', fullyParallel: false, workers: 1,
  globalSetup: './tests/e2e/setup.js', timeout: 45000,
  reporter: [['list'], ['json', { outputFile: 'test-results/catalog-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3108', trace: 'retain-on-failure', contextOptions: { reducedMotion: 'reduce' } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npm run start -- --hostname 127.0.0.1 --port 3108', url: 'http://127.0.0.1:3108',
    reuseExistingServer: false, env: { DATABASE_URL: database }, timeout: 60000 },
});
