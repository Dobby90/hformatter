import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  use: { headless: true, launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {} },
  projects: [
    { name: 'root', use: { baseURL: 'http://127.0.0.1:4173/' } },
    { name: 'subpath', use: { baseURL: 'http://127.0.0.1:4173/tools/formatter/' } },
  ],
  webServer: { command: 'node scripts/serve-test.mjs', port: 4173, reuseExistingServer: false },
});
